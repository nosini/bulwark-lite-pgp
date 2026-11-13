import type { Email } from '@/lib/jmap/types';
import { detectPgpMessage } from '@/lib/mailvelope/detect';

/**
 * A scheduled message that "cancel and edit" cannot hand back to the composer,
 * so the user starts a new message instead: S/MIME (signed or encrypted as a
 * whole) and PGP (the plaintext never left the Mailvelope editor).
 */
export function isScheduledComposeAgainOnly(email: Pick<Email, 'isSmimeScheduled' | 'isPgpScheduled'>): boolean {
  return Boolean(email.isSmimeScheduled || email.isPgpScheduled);
}

/**
 * Whether the composer must not open this draft. An encrypted message would
 * load as an empty body with the original recipients and the ciphertext as
 * attachments, and sending that delivers a plaintext message. Undoing a PGP
 * send leaves exactly such a draft behind. Needs the full email (bodyStructure,
 * headers and body values), not a list stub.
 */
export function isUneditableDraft(email: Email): boolean {
  return isScheduledComposeAgainOnly(email) || detectPgpMessage(email) !== null;
}
