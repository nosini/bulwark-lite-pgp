import { addrSpec, buildPgpMimeMessage, type MimeAddress } from './pgp-mime';
import { bareAddress, envelopeAddresses, uniqueAddresses } from './recipients';
import type { MailvelopeEditor, MailvelopeError, MailvelopeKeyring } from './types';

export interface EncryptedMessageInput {
  editor: MailvelopeEditor;
  keyring: MailvelopeKeyring;
  from: MimeAddress;
  to: MimeAddress[];
  cc: MimeAddress[];
  /**
   * Must be empty. One OpenPGP message holds a session-key packet per recipient
   * key, so a Bcc recipient's key id would be readable by everyone else; the
   * composer blocks Send instead, and this refuses in case anything gets here.
   */
  bcc: MimeAddress[];
  /**
   * More of the sender's own addresses to try for the Sent copy's key, after
   * `from` and `from` without its sub-address tag: the identity's address when
   * the From header carries an override.
   */
  ownAddresses?: string[];
  subject: string;
  inReplyTo?: string[];
  references?: string[];
  /** Ask for a read receipt (RFC 8098 Disposition-Notification-To, to `from`). */
  requestReadReceipt?: boolean;
}

export interface EncryptedMessage {
  /** Full RFC 822 message: the only thing that is ever uploaded. */
  raw: string;
  /** Every To/Cc address for the SMTP envelope, as written: local parts can be case-sensitive. */
  envelopeRecipients: string[];
}

/** Raised before encrypting when the message has Bcc recipients. */
export class PgpBccError extends Error {
  readonly code = 'BULWARK_BCC_UNSUPPORTED';
  constructor() {
    super('Refusing to encrypt with Bcc recipients: every recipient could see their key ids');
    this.name = 'PgpBccError';
  }
}

/** `me+tag@example.com` → `me@example.com`, for finding the key behind a sub-address. */
function withoutSubAddress(address: string): string {
  return address.replace(/^([^@+]+)\+[^@]*@/, '$1@');
}

/**
 * Whether the sender's own address has a key in the local keyring, i.e. the
 * Sent copy can be encrypted to them as well. Adding an address Mailvelope
 * cannot resolve would make the whole encryption fail, so this is checked
 * rather than assumed.
 */
async function ownKeyAddress(keyring: MailvelopeKeyring, candidates: string[]): Promise<string | null> {
  const addresses = uniqueAddresses(candidates);
  if (addresses.length === 0) return null;
  try {
    const keyMap = await keyring.validKeyForAddress(addresses);
    return addresses.find((address) => {
      const entry = keyMap[address];
      return entry ? entry.keys.some((key) => key.source === 'LOC') : false;
    }) ?? null;
  } catch {
    return null;
  }
}

/**
 * Ask Mailvelope to encrypt the editor content and wrap the result in a
 * PGP/MIME message. Nothing here sees plaintext or key material: the plaintext
 * lives in the extension's iframe and `armored` is already ciphertext.
 */
export async function encryptAndBuildMessage(input: EncryptedMessageInput): Promise<EncryptedMessage> {
  // Before the editor encrypts, not after: buildPgpMimeMessage would reject
  // the same address further down, once the user has already answered the
  // passphrase dialog and waited for a message that is then thrown away. Bcc
  // is checked here too — it reaches no header, only the SMTP envelope.
  if (input.bcc.length > 0) throw new PgpBccError();
  for (const { email } of [input.from, ...input.to, ...input.cc]) addrSpec(email);

  const recipients = [...input.to, ...input.cc].map((a) => a.email);
  const envelopeRecipients = envelopeAddresses(recipients);
  // Key lookup is by address, which Mailvelope compares case-insensitively.
  const recipientKeys = uniqueAddresses(recipients);

  // Encrypt to the sender too, so the copy in Sent stays readable. The From
  // address may be a sub-address or an override with no key of its own, so try
  // the plain address and the identity's as well. Mailvelope also adds the
  // user's default key unless that is switched off in its settings.
  const from = bareAddress(input.from.email);
  const own = recipientKeys.includes(from)
    ? null
    : await ownKeyAddress(input.keyring, [from, withoutSubAddress(from), ...(input.ownAddresses ?? []).map(bareAddress)]);
  const targets = own && !recipientKeys.includes(own) ? [...recipientKeys, own] : recipientKeys;

  const armored = await input.editor.encrypt(targets);

  const { raw } = buildPgpMimeMessage({
    from: input.from,
    to: input.to,
    cc: input.cc,
    subject: input.subject,
    armored,
    inReplyTo: input.inReplyTo,
    references: input.references,
    ...(input.requestReadReceipt ? { dispositionNotificationTo: input.from.email } : {}),
  });
  return { raw, envelopeRecipients };
}

/**
 * Error codes the composer explains to the user; anything else gets a generic
 * message. Mailvelope's own codes, plus the BULWARK_ ones raised here — those
 * are prefixed so they cannot collide with a code the extension adds later.
 */
export const PGP_ERROR_MESSAGE_KEYS: Record<string, string> = {
  BULWARK_FRAME_BLOCKED: 'error_frame_blocked',
  BULWARK_BCC_UNSUPPORTED: 'send_blocked_bcc',
  BULWARK_INVALID_ADDRESS: 'error_invalid_address',
  BULWARK_NON_ASCII_ADDRESS: 'error_non_ascii_address',
  NO_KEY_FOR_RECIPIENT: 'error_no_key_for_recipient',
  NO_KEY_FOR_ENCRYPTION: 'error_no_own_key',
  NO_DEFAULT_KEY_FOUND: 'error_no_own_key',
  ENCRYPT_QUOTA_SIZE: 'error_quota',
  ENCRYPT_IN_PROGRESS: 'error_in_progress',
  EDITOR_DIALOG_CANCEL: 'error_cancelled',
  PWD_DIALOG_CANCEL: 'error_cancelled',
  NO_CONNECTION: 'error_disconnected',
};

export function pgpErrorMessageKey(err: unknown): string {
  const code = (err as MailvelopeError | undefined)?.code;
  return (code && PGP_ERROR_MESSAGE_KEYS[code]) || 'error_generic';
}
