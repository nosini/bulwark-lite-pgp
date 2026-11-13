import { render, waitFor, act } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import React from 'react';
import type { Email } from '@/lib/jmap/types';

// An undone PGP send is kept in Drafts. Opening it in the composer gave an
// empty body with the original recipients, which then sent as plaintext.

const h = vi.hoisted(() => ({
  viewerProps: null as null | { onEditDraft?: () => void },
  openComposeTab: vi.fn(),
  toastInfo: vi.fn(),
  email: null as Email | null,
}));

vi.mock('@/components/email/email-viewer', () => ({
  EmailViewer: (props: { onEditDraft?: () => void }) => {
    h.viewerProps = props;
    return null;
  },
}));
vi.mock('@/components/error', () => ({
  ErrorBoundary: ({ children }: { children: React.ReactNode }) => children,
  EmailViewerErrorFallback: () => null,
}));

function storeHook<T extends object>(state: T) {
  const hook = (sel?: (s: T) => unknown) => (typeof sel === 'function' ? sel(state) : state);
  hook.getState = () => state;
  return hook;
}

vi.mock('@/stores/auth-store', () => ({ useAuthStore: storeHook({ client: { getEmail: async () => h.email, getUsername: () => 'me@example.com' } }) }));
vi.mock('@/stores/email-store', () => ({
  resolveEmailBlobContext: (_email: unknown, client: unknown) => ({ client }),
  useEmailStore: storeHook({
    emails: [],
    fetchEmailContent: async () => h.email,
    deleteEmail: vi.fn(), markAsRead: vi.fn(), toggleStar: vi.fn(), moveToMailbox: vi.fn(),
    setEmailKeywordsLocal: vi.fn(), mailboxes: [],
  }),
}));
vi.mock('@/stores/identity-store', () => ({ useIdentityStore: storeHook({ identities: [] }) }));
vi.mock('@/stores/settings-store', () => ({ useSettingsStore: storeHook({}) }));
vi.mock('@/stores/pro-tab-store', () => ({ useProTabStore: storeHook({ openComposeTab: h.openComposeTab }) }));
vi.mock('@/stores/toast-store', () => ({ toast: { info: h.toastInfo, error: vi.fn(), success: vi.fn() } }));
vi.mock('@/hooks/use-pro-multi-account-identities', () => ({
  useProMultiAccountIdentities: () => ({ enabled: false, groups: [], allIdentities: [] }),
}));

import { ProEmailView } from '../pro-email-tab-body';

const ARMOR = ['-----BEGIN PGP MESSAGE-----', '', 'hQEMA1Vn7c1u8bVh', '=AbCd', '-----END PGP MESSAGE-----'].join('\n');

const base = {
  id: 'd1', threadId: 't', mailboxIds: {}, keywords: { $draft: true }, size: 1, receivedAt: '',
  subject: 'Plans', to: [{ email: 'bob@example.com' }],
} as unknown as Email;

const pgpMimeDraft = {
  ...base,
  headers: { 'Content-Type': 'multipart/encrypted; protocol="application/pgp-encrypted"; boundary="b"' },
  bodyStructure: {
    partId: '0', type: 'multipart/encrypted', size: 0,
    subParts: [
      { partId: '1', type: 'application/pgp-encrypted', blobId: 'c', size: 10 },
      { partId: '2', type: 'application/octet-stream', blobId: 'p', name: 'encrypted.asc', size: 100 },
    ],
  },
  attachments: [{ partId: '2', blobId: 'p', name: 'encrypted.asc', type: 'application/octet-stream', size: 100 }],
} as unknown as Email;

async function openAndEdit(email: Email) {
  h.email = email;
  render(<ProEmailView emailId={email.id} onClose={vi.fn()} />);
  await waitFor(() => expect(h.viewerProps?.onEditDraft).toBeTypeOf('function'));
  // Let the loaded email reach the viewer's props.
  await act(async () => { await Promise.resolve(); });
  act(() => h.viewerProps!.onEditDraft!());
}

beforeEach(() => {
  h.viewerProps = null;
  h.openComposeTab.mockReset();
  h.toastInfo.mockReset();
});

describe('editing a draft from a Pro tab', () => {
  it('does not open an encrypted (PGP/MIME) draft in the composer', async () => {
    await openAndEdit(pgpMimeDraft);
    expect(h.openComposeTab).not.toHaveBeenCalled();
    expect(h.toastInfo).toHaveBeenCalledWith('pgp.draft_not_editable');
  });

  it('does not open an inline-PGP draft either', async () => {
    await openAndEdit({ ...base, textBody: [{ partId: '1', type: 'text/plain', size: 1 }], bodyValues: { '1': { value: ARMOR } } } as unknown as Email);
    expect(h.openComposeTab).not.toHaveBeenCalled();
  });

  it('still opens an ordinary draft', async () => {
    await openAndEdit({ ...base, textBody: [{ partId: '1', type: 'text/plain', size: 1 }], bodyValues: { '1': { value: 'Hello' } } } as unknown as Email);
    expect(h.openComposeTab).toHaveBeenCalledTimes(1);
  });
});
