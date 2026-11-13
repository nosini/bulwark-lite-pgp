"use client";

import { useCallback, useEffect, useRef, useState } from 'react';
import { checkRecipientKeys, isLookupCandidate, uniqueAddresses, type RecipientKeyStatus } from '@/lib/mailvelope/recipients';
import type { MailvelopeKeyring } from '@/lib/mailvelope/types';

const DEBOUNCE_MS = 600;

interface RecipientKeyStatusResult {
  statuses: RecipientKeyStatus[];
  /** True while some recipient has no answer yet. */
  checking: boolean;
  /** Addresses whose lookup failed outright (extension error), as opposed to "no key". */
  failed: string[];
  /** Drop cached answers (all, or one address after an import) and ask again. */
  refresh: (address?: string) => void;
}

/**
 * Key status for the composer's recipients, while PGP is on. Mailvelope may
 * consult WKD and key servers for addresses it has no local key for, so answers
 * are debounced while the user types and cached per address for the session.
 * A failed lookup is not retried until `refresh`, so an unhappy extension
 * cannot turn this into a request loop.
 */
export function useRecipientKeyStatus(
  enabled: boolean,
  keyring: MailvelopeKeyring | null,
  recipients: string[],
): RecipientKeyStatusResult {
  const cacheRef = useRef(new Map<string, RecipientKeyStatus>());
  const failedRef = useRef(new Set<string>());
  // Asked about and not answered yet: a slow WKD lookup must not be repeated
  // just because the recipient list changed while it was running.
  const inFlightRef = useRef(new Set<string>());
  // Bumped by refresh, so an answer that was in flight before it cannot put
  // back what the user just asked to check again.
  const epochRef = useRef(0);
  // Bumped whenever the caches change, to re-render and re-run the effect.
  const [revision, setRevision] = useState(0);

  const addresses = uniqueAddresses(recipients);
  const addressKey = addresses.join('\n');

  useEffect(() => {
    if (!enabled || !keyring) return;
    // Addresses still being typed are withheld: Mailvelope would resolve them
    // over WKD or a key server, sending a half-typed address to a third party.
    const unresolved = addressKey
      .split('\n')
      .filter(
        (address) =>
          address &&
          isLookupCandidate(address) &&
          !cacheRef.current.has(address) &&
          !failedRef.current.has(address) &&
          !inFlightRef.current.has(address),
      );
    if (unresolved.length === 0) return;

    const timer = setTimeout(async () => {
      const epoch = epochRef.current;
      for (const address of unresolved) inFlightRef.current.add(address);
      try {
        const results = await checkRecipientKeys(keyring, unresolved);
        // Kept even when this run was superseded by an edit to the recipients.
        // The answers are per address and still true; dropping them meant
        // looking the same addresses up again.
        if (epoch === epochRef.current) {
          for (const status of results) {
            cacheRef.current.set(status.address, status);
            failedRef.current.delete(status.address);
          }
        }
      } catch {
        if (epoch === epochRef.current) {
          for (const address of unresolved) if (!cacheRef.current.has(address)) failedRef.current.add(address);
        }
      } finally {
        if (epoch === epochRef.current) for (const address of unresolved) inFlightRef.current.delete(address);
      }
      setRevision((r) => r + 1);
    }, DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [enabled, keyring, addressKey, revision]);

  const refresh = useCallback((address?: string) => {
    epochRef.current++;
    // Answers still in flight are discarded, so those addresses are asked again.
    inFlightRef.current.clear();
    if (address) {
      cacheRef.current.delete(address.toLowerCase());
      failedRef.current.delete(address.toLowerCase());
    } else {
      cacheRef.current.clear();
      failedRef.current.clear();
    }
    setRevision((r) => r + 1);
  }, []);

  if (!enabled) return { statuses: [], checking: false, failed: [], refresh };

  const statuses = addresses.flatMap((address): RecipientKeyStatus[] => {
    const status = cacheRef.current.get(address);
    if (status) return [status];
    // Never looked up, so answer from what we know: a half-typed address has
    // no key. Without this the composer would sit on "Checking recipient
    // keys…" for as long as the unfinished address is in the field.
    if (!isLookupCandidate(address)) return [{ address, state: 'missing', keys: [] }];
    return [];
  });
  const failed = addresses.filter((address) => failedRef.current.has(address) && !cacheRef.current.has(address));
  return { statuses, checking: statuses.length + failed.length < addresses.length, failed, refresh };
}
