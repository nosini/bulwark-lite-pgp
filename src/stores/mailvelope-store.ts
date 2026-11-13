import { useEffect } from 'react';
import { create } from 'zustand';
import { debug } from '@/lib/debug';
import { getOrCreateKeyring, onMailvelopeArrival, whenMailvelopeReady } from '@/lib/mailvelope/bootstrap';
import type { MailvelopeApi, MailvelopeKeyring } from '@/lib/mailvelope/types';

type MailvelopeStatus = 'idle' | 'detecting' | 'ready' | 'unavailable';

interface MailvelopeStore {
  status: MailvelopeStatus;
  api: MailvelopeApi | null;
  /** The app keyring. Only a handle: keys and passphrases stay in the extension. */
  keyring: MailvelopeKeyring | null;
  version: string | null;
  /** Idempotent. Resolves once detection has finished, whatever the outcome. */
  init: () => Promise<void>;
  markUnavailable: () => void;
}

let initPromise: Promise<void> | null = null;
/** Bumped by every detection run; a run that is no longer the latest writes nothing. */
let detectionRun = 0;
/**
 * True while a run waits for the extension to announce itself. Its own
 * listener in whenMailvelopeReady picks up the `mailvelope` event, so the
 * arrival handler must not start a second run beside it.
 */
let awaitingAnnouncement = false;
let disconnectListenerAttached = false;
let arrivalUnsubscribe: (() => void) | null = null;

export const useMailvelopeStore = create<MailvelopeStore>((set, get) => ({
  status: 'idle',
  api: null,
  keyring: null,
  version: null,

  init: () => {
    if (initPromise) return initPromise;
    if (!arrivalUnsubscribe) {
      // An extension that shows up after detection gave up, or comes back after
      // `mailvelope-disconnect`, starts detection over instead of leaving the
      // page without PGP until it is reloaded.
      arrivalUnsubscribe = onMailvelopeArrival(() => {
        if (get().status === 'ready' || awaitingAnnouncement) return;
        initPromise = null;
        void get().init();
      });
    }
    set({ status: 'detecting' });
    const run = ++detectionRun;
    const current = () => run === detectionRun;
    initPromise = (async () => {
      awaitingAnnouncement = true;
      let api: MailvelopeApi | null;
      try {
        api = await whenMailvelopeReady();
      } finally {
        if (current()) awaitingAnnouncement = false;
      }
      if (!current()) return;
      if (!api) {
        set({ status: 'unavailable' });
        return;
      }
      try {
        const keyring = await getOrCreateKeyring(api);
        const version = await api.getVersion().catch(() => null);
        if (!current()) return;
        set({ status: 'ready', api, keyring, version });
        if (!disconnectListenerAttached) {
          disconnectListenerAttached = true;
          // Fired when the extension updates or is disabled: its containers stop working.
          window.addEventListener('mailvelope-disconnect', () => get().markUnavailable());
        }
      } catch (err) {
        // Present but unusable (origin not authorized for keyrings, extension
        // locked down, ...). Behave exactly as if it were absent.
        debug.log('email', 'Mailvelope detected but unusable:', err);
        if (current()) set({ status: 'unavailable' });
      }
    })();
    return initPromise;
  },

  markUnavailable: () => set({ status: 'unavailable', api: null, keyring: null }),
}));

/** Every piece of PGP UI is gated on this. */
export function selectPgpAvailable(state: Pick<MailvelopeStore, 'status' | 'api' | 'keyring'>): boolean {
  return state.status === 'ready' && state.api !== null && state.keyring !== null;
}

/**
 * Reactive `pgpAvailable`. Calling it is what starts detection, so surfaces
 * that never look at PGP (calendar, contacts) never pay for it.
 */
export function usePgpAvailable(): boolean {
  const init = useMailvelopeStore((s) => s.init);
  useEffect(() => {
    void init();
  }, [init]);
  return useMailvelopeStore(selectPgpAvailable);
}

/** Forget cached detection so the next `init()` starts over. Tests only. */
export function resetMailvelopeStoreForTests(): void {
  initPromise = null;
  detectionRun++;
  awaitingAnnouncement = false;
  disconnectListenerAttached = false;
  arrivalUnsubscribe?.();
  arrivalUnsubscribe = null;
  useMailvelopeStore.setState({ status: 'idle', api: null, keyring: null, version: null });
}
