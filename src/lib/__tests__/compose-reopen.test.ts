// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { isScheduledComposeAgainOnly, isUneditableDraft } from '@/lib/compose-reopen';
import type { Email, EmailBodyPart } from '@/lib/jmap/types';

const ARMOR = ['-----BEGIN PGP MESSAGE-----', '', 'hQEMA1Vn7c1u8bVh', '=AbCd', '-----END PGP MESSAGE-----'].join('\n');

const part = (over: Partial<EmailBodyPart>): EmailBodyPart => ({ partId: '1', type: 'text/plain', size: 0, ...over } as EmailBodyPart);
const email = (over: Partial<Email>): Email => ({ id: 'e1', threadId: 't', mailboxIds: {}, keywords: { $draft: true }, size: 1, receivedAt: '', ...over } as Email);

describe('isUneditableDraft', () => {
  // What undoing a PGP send leaves in Drafts: Email/import of our own PGP/MIME message.
  it('refuses a PGP/MIME draft', () => {
    const draft = email({
      headers: { 'Content-Type': 'multipart/encrypted; protocol="application/pgp-encrypted"; boundary="b"' } as never,
      bodyStructure: part({
        type: 'multipart/encrypted',
        subParts: [
          part({ partId: '1', type: 'application/pgp-encrypted', blobId: 'c' }),
          part({ partId: '2', type: 'application/octet-stream', blobId: 'p', name: 'encrypted.asc' }),
        ],
      }),
    });
    expect(isUneditableDraft(draft)).toBe(true);
  });

  it('refuses an inline PGP draft', () => {
    expect(isUneditableDraft(email({ textBody: [part({})], bodyValues: { '1': { value: ARMOR } } as never }))).toBe(true);
  });

  it('refuses a scheduled S/MIME or PGP message', () => {
    expect(isUneditableDraft(email({ isSmimeScheduled: true }))).toBe(true);
    expect(isUneditableDraft(email({ isPgpScheduled: true }))).toBe(true);
  });

  it('opens an ordinary draft', () => {
    expect(isUneditableDraft(email({ textBody: [part({})], bodyValues: { '1': { value: 'Hello' } } as never }))).toBe(false);
  });
});

describe('isScheduledComposeAgainOnly', () => {
  it('is set for S/MIME and PGP, and only those', () => {
    expect(isScheduledComposeAgainOnly({ isSmimeScheduled: true })).toBe(true);
    expect(isScheduledComposeAgainOnly({ isPgpScheduled: true })).toBe(true);
    expect(isScheduledComposeAgainOnly({})).toBe(false);
  });
});
