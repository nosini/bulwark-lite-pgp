import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import React from 'react';
import type { Email } from '@/lib/jmap/types';

// An undone PGP send is kept in Drafts. Reopening it in the standard composer
// gave an empty body with the original recipients, which then sent as plaintext.
// The Pro tab guard is covered in pro-edit-encrypted-draft.test.tsx; this is
// the same contract for MailApp's own edit-draft path.

const h = vi.hoisted(() => ({
  listProps: null as null | { onEditDraft?: (email: Email) => void },
  listEmail: null as Email | null,
  composerProps: null as null | Record<string, unknown>,
  toastInfo: vi.fn(),
  getEmail: vi.fn(),
}));

// Both the viewer and the composer are next/dynamic imports. Replace dynamic
// with a synchronous stub, and tell them apart by the composer-only prop.
vi.mock('next/dynamic', () => ({
  default: () => (props: Record<string, unknown>) => {
    if ('pgpSupported' in props) {
      h.composerProps = props;
      return React.createElement('div', { 'data-testid': 'composer' });
    }
    return React.createElement('div', { 'data-testid': 'viewer' });
  },
}));

vi.mock('@/components/email/email-list', () => ({
  EmailList: (props: { onEditDraft?: (email: Email) => void }) => {
    h.listProps = props;
    return React.createElement('button', {
      'data-testid': 'edit-draft',
      onClick: () => { if (h.listEmail) props.onEditDraft?.(h.listEmail); },
    }, 'edit draft');
  },
}));

vi.mock('@/components/layout/sidebar', () => ({ Sidebar: () => null }));
vi.mock('@/components/email/message-list-tabs', () => ({
  MessageListTabs: () => null,
  useMessageListPanelProps: () => ({}),
}));
vi.mock('@/components/protocol/protocol-account-picker', () => ({ ProtocolAccountPicker: () => null }));
vi.mock('@/components/email/thread-conversation-view', () => ({ ThreadConversationView: () => null }));
vi.mock('@/components/layout/mobile-header', () => ({ MobileHeader: () => null }));
vi.mock('@/components/keyboard-shortcuts-modal', () => ({ KeyboardShortcutsModal: () => null }));
vi.mock('@/components/layout/mailbox-share-dialog', () => ({ MailboxShareDialog: () => null }));
vi.mock('@/components/layout/share-notification-toaster', () => ({ ShareNotificationToaster: () => null }));
vi.mock('@/components/layout/calendar-event-notification-toaster', () => ({ CalendarEventNotificationToaster: () => null }));
vi.mock('@/components/ui/confirm-dialog', () => ({ ConfirmDialog: () => null }));
vi.mock('@/components/ui/prompt-dialog', () => ({ PromptDialog: () => null }));
vi.mock('@/components/totp-reauth-dialog', () => ({ TotpReauthDialog: () => null }));
vi.mock('@/components/search/search-box', () => ({ SearchBox: () => null }));
vi.mock('@/components/ui/welcome-banner', () => ({ WelcomeBanner: () => null }));
vi.mock('@/components/layout/navigation-rail', () => ({ NavigationRail: () => null }));
vi.mock('@/components/layout/sidebar-apps-modal', () => ({ SidebarAppsModal: () => null }));
vi.mock('@/components/layout/inline-app-view', () => ({ InlineAppView: () => null }));
vi.mock('@/components/files/file-preview-modal', () => ({ FilePreviewModal: () => null }));
vi.mock('@/components/layout/resize-handle', () => ({ ResizeHandle: () => null }));
vi.mock('@/components/plugins/app-top-banner-slot', () => ({ AppTopBannerSlot: () => null }));
vi.mock('@/contexts/drag-drop-context', () => ({
  DragDropProvider: ({ children }: { children: React.ReactNode }) => children,
}));
vi.mock('@/components/error', () => ({
  ErrorBoundary: ({ children }: { children: React.ReactNode }) => children,
  SidebarErrorFallback: () => null,
  EmailListErrorFallback: () => null,
  EmailViewerErrorFallback: () => null,
  ComposerErrorFallback: () => null,
}));

vi.mock('@/hooks/use-media-query', () => ({ useDeviceDetection: () => ({ isMobile: false, isTablet: false }) }));
vi.mock('@/hooks/use-pane-size', () => ({ usePaneSize: () => null }));
vi.mock('@/hooks/use-pane-context', () => ({ usePaneId: () => null, useIsFocusedProTab: () => false }));
vi.mock('@/hooks/use-keyboard-shortcuts', () => ({ useKeyboardShortcuts: () => {} }));
vi.mock('@/hooks/use-refresh-gesture', () => ({ useRefreshGesture: () => ({ indicator: null }) }));
vi.mock('@/hooks/use-confirm-dialog', () => ({ useConfirmDialog: () => ({ dialogProps: {}, confirm: vi.fn() }) }));
vi.mock('@/hooks/use-prompt-dialog', () => ({ usePromptDialog: () => ({ dialogProps: {}, prompt: vi.fn() }) }));
vi.mock('@/hooks/use-browser-navigation', () => ({ useBrowserNavigation: () => {} }));
vi.mock('@/hooks/use-sidebar-apps', () => ({
  useSidebarApps: () => ({
    showAppsModal: false,
    inlineApp: null,
    loadedApps: [],
    handleManageApps: vi.fn(),
    handleInlineApp: vi.fn(),
    closeInlineApp: vi.fn(),
    closeAppsModal: vi.fn(),
  }),
}));
vi.mock('@/hooks/use-identity-sync', () => ({ useIdentitySync: () => {} }));
vi.mock('@/hooks/use-is-embedded', () => ({ useIsEmbedded: () => false }));
vi.mock('@/hooks/use-pro-multi-account-mailboxes', () => ({ useProMultiAccountMailboxes: () => {} }));
vi.mock('@/hooks/use-pro-multi-account-identities', () => ({
  useProMultiAccountIdentities: () => ({ enabled: false, groups: [], allIdentities: [] }),
}));
vi.mock('@/hooks/use-config', () => ({ useConfig: () => ({ appName: 'Bulwark' }) }));
vi.mock('@/hooks/use-lite-link-segments', () => ({ useLiteLinkSegments: () => [], initialLinkSearch: () => '' }));
vi.mock('@/components/pro/pro-interface-redirect', () => ({ useProInterfaceActive: () => false }));

vi.mock('@/lib/protocol-handlers/session', () => ({
  consumePendingMailto: () => null,
  subscribeToPendingMailto: () => () => {},
}));
vi.mock('@/lib/deep-link-handoff', () => ({
  consumePendingDeepLink: () => [],
  subscribePendingDeepLink: () => () => {},
}));

function storeHook<T extends object>(state: T) {
  const hook = (sel?: (s: T) => unknown) => (typeof sel === 'function' ? sel(state) : state);
  hook.getState = () => state;
  hook.subscribe = () => () => {};
  return hook;
}

vi.mock('@/stores/auth-store', () => ({
  useAuthStore: storeHook({
    isAuthenticated: true,
    client: {
      getEmail: h.getEmail,
      getUsername: () => 'me@example.com',
      hasDelayedSend: () => true,
      getAllConnectedClients: () => new Map(),
      getClientForAccount: () => undefined,
    },
    logout: vi.fn(),
    checkAuth: vi.fn(async () => {}),
    switchAccount: vi.fn(async () => {}),
    refreshIdentities: vi.fn(),
    getAllConnectedClients: () => new Map(),
    getClientForAccount: () => undefined,
    activeAccountId: 'local-1',
    isLoading: false,
    connectionLost: false,
    isRateLimited: false,
    rateLimitUntil: null,
    connectedAccountsRevision: 0,
  }),
  redirectToLogin: vi.fn(),
  saveRedirectAfterLogin: vi.fn(),
}));

// 1.20's email store also exports helpers the mail app imports at module
// load (invalidateUnifiedMailboxes, resolveEmailBlobContext, ...): keep the
// real ones, and replace only the store hook.
vi.mock('@/stores/email-store', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/stores/email-store')>()),
  useEmailStore: storeHook({
    emails: [],
    mailboxes: [{ id: 'inbox', name: 'Inbox', role: 'inbox' }],
    selectedEmail: null,
    selectedMailbox: 'inbox',
    quota: null,
    isPushConnected: false,
    newEmailNotification: null,
    selectEmail: vi.fn(),
    selectMailbox: vi.fn(),
    selectedEmailIds: new Set<string>(),
    selectedEmailKeys: new Set<string>(),
    selectAllEmails: vi.fn(),
    clearSelection: vi.fn(),
    toggleEmailSelection: vi.fn(),
    fetchMailboxes: vi.fn(async () => {}),
    fetchEmails: vi.fn(async () => {}),
    fetchQuota: vi.fn(),
    sendEmail: vi.fn(),
    deleteEmail: vi.fn(),
    markAsRead: vi.fn(),
    toggleStar: vi.fn(),
    setEmailKeywords: vi.fn(),
    moveToMailbox: vi.fn(),
    moveToMailboxCrossAware: vi.fn(),
    moveThreadToMailbox: vi.fn(),
    searchEmails: vi.fn(),
    searchQuery: '',
    setSearchQuery: vi.fn(),
    isLoading: false,
    isLoadingEmail: false,
    setLoadingEmail: vi.fn(),
    setPushConnected: vi.fn(),
    handleStateChange: vi.fn(),
    clearNewEmailNotification: vi.fn(),
    markAsSpam: vi.fn(),
    undoSpam: vi.fn(),
    searchFilters: {
      from: '', to: '', subject: '', body: '', hasAttachment: null,
      dateAfter: '', dateBefore: '', isUnread: null, isStarred: null,
      minSizeKb: '', maxSizeKb: '',
    },
    searchMailboxId: '',
    isAdvancedSearchOpen: false,
    setSearchFilters: vi.fn(),
    setSearchMailboxId: vi.fn(),
    clearSearchFilters: vi.fn(),
    toggleAdvancedSearch: vi.fn(),
    advancedSearch: vi.fn(),
    selectedKeyword: null,
    selectKeyword: vi.fn(),
    hasMoreEmails: false,
    fetchTagCounts: vi.fn(),
    fetchEmailContent: vi.fn(async () => null),
    isUnifiedView: false,
    unifiedRole: null,
    scheduledEmails: [],
    scheduledTotal: 0,
    scheduledTotalByAccount: {},
    scheduledHasMore: false,
    isLoadingScheduled: false,
    isScheduledView: false,
    scheduledAccountScope: null,
    setScheduledView: vi.fn(),
    fetchScheduledEmails: vi.fn(async () => {}),
    loadMoreScheduledEmails: vi.fn(),
    cancelScheduledEmailForEdit: vi.fn(),
    rescheduleScheduledEmail: vi.fn(),
    refreshScheduledMetadata: vi.fn(async () => {}),
    cancelUndoSend: vi.fn(),
    clearPendingUndoSend: vi.fn(),
    pendingUndoSend: null,
    fetchUnifiedEmails: vi.fn(),
    fetchCrossView: vi.fn(),
    refreshUnifiedCounts: vi.fn(),
    refreshCrossCounts: vi.fn(),
    crossUnreadCount: 0,
    exitUnifiedView: vi.fn(),
    emptyMailbox: vi.fn(),
    markMailboxAsRead: vi.fn(),
    createMailbox: vi.fn(),
    renameMailbox: vi.fn(),
    deleteMailbox: vi.fn(),
    batchDelete: vi.fn(),
    batchArchive: vi.fn(),
    batchMarkAsRead: vi.fn(),
    batchMarkAsSpam: vi.fn(),
    batchUndoSpam: vi.fn(),
    accountMailboxes: {},
    viewingAccountId: null,
    selectAccountMailbox: vi.fn(),
    setViewingAccount: vi.fn(),
    refreshCurrentMailbox: vi.fn(),
  }),
  buildUnifiedAccountClients: vi.fn(async () => []),
  ArchiveMailboxNotFoundError: class extends Error {},
  findArchiveMailbox: vi.fn(() => null),
  resolveUnstampedEmailAccountId: vi.fn(() => undefined),
}));

vi.mock('@/stores/identity-store', () => ({ useIdentityStore: storeHook({ identities: [] }) }));
vi.mock('@/stores/settings-store', () => ({
  useSettingsStore: storeHook({
    mailLayout: 'vertical',
    trustedSendersAddressBook: false,
    sendDelaySeconds: 0,
    enableUnifiedMailbox: false,
    enableCrossUnreadView: false,
    enableCrossStarredView: false,
    enableCrossAllView: false,
    includeGroupInUnified: false,
    unifiedCrossAccount: false,
    plainTextMode: false,
    markAsReadDelay: 0,
    timeFormat: '24h',
    returnToListAfterAction: false,
    signatureSeparatorEnabled: false,
    mailAttachmentAction: 'preview',
    archiveMode: 'move',
    clearSearchOnFolderChange: true,
    permanentlyDeleteJunk: false,
    keepAppsLoaded: false,
    sidebarApps: [],
    proInterface: false,
    singleKeyShortcuts: false,
    emailNotificationsEnabled: false,
    emailNotificationSound: false,
    notificationSoundChoice: 'default',
  }),
  // Named exports the mail app's children import (1.20): the settings store's
  // sync bridges and its layout helper (the value the store holds is the one
  // being tested).
  registerCalendarSubscriptionSyncBridge: vi.fn(),
  registerTemplateSyncBridge: vi.fn(),
  effectiveMailLayout: (layout: string) => layout,
}));
vi.mock('@/stores/ui-store', () => ({
  // The pane widths' bounds, which the mail app lays out with.
  SIDEBAR_MIN: 180, SIDEBAR_MAX: 400,
  EMAIL_LIST_MIN: 240, EMAIL_LIST_MAX: 600,
  EMAIL_LIST_HEIGHT_MIN: 160, EMAIL_LIST_HEIGHT_MAX: 800,
  useUIStore: storeHook({
    activeView: 'list',
    sidebarOpen: false,
    setSidebarOpen: vi.fn(),
    setActiveView: vi.fn(),
    tabletListVisible: true,
    setTabletListVisible: vi.fn(),
    sidebarWidth: 256,
    emailListWidth: 320,
    emailListHeight: 240,
    setSidebarWidth: vi.fn(),
    setEmailListWidth: vi.fn(),
    setEmailListHeight: vi.fn(),
    persistColumnWidths: vi.fn(),
    sidebarCollapsed: false,
    resetSidebarWidth: vi.fn(),
    resetEmailListWidth: vi.fn(),
    resetEmailListHeight: vi.fn(),
  }),
}));
vi.mock('@/stores/account-store', () => ({
  useAccountStore: storeHook({
    accounts: [],
    activeAccountId: 'local-1',
    getAccountById: (id: string) => (id === 'local-1' ? { id, email: 'me@example.com' } : undefined),
  }),
}));
vi.mock('@/stores/policy-store', () => ({ usePolicyStore: storeHook({ policy: {}, isFeatureEnabled: () => false }) }));
vi.mock('@/stores/contact-store', () => ({
  useContactStore: storeHook({
    loadTrustedSendersBook: vi.fn(),
    trustedSendersLoaded: true,
    loadRecentRecipients: vi.fn(),
  }),
}));
vi.mock('@/stores/plugin-store', () => ({ usePluginStore: storeHook({ initializePlugins: vi.fn() }) }));
vi.mock('@/stores/theme-store', () => ({ useThemeStore: storeHook({ syncServerThemes: vi.fn() }) }));
vi.mock('@/stores/pro-tab-store', () => ({
  useProTabStore: storeHook({ openComposeTab: vi.fn(), openEmailTab: vi.fn() }),
}));
vi.mock('@/stores/search-history-store', () => ({
  useSearchHistoryStore: storeHook({ addRecentSearch: vi.fn() }),
}));
vi.mock('@/stores/toast-store', () => ({
  toast: { info: h.toastInfo, error: vi.fn(), success: vi.fn(), warning: vi.fn() },
}));

import { MailApp } from '../mail-app';

const ARMOR = ['-----BEGIN PGP MESSAGE-----', '', 'hQEMA1Vn7c1u8bVh', '=AbCd', '-----END PGP MESSAGE-----'].join('\n');

const base = {
  id: 'd1', threadId: 't', mailboxIds: {}, keywords: { $draft: true }, size: 1, receivedAt: '',
  subject: 'Plans', to: [{ email: 'bob@example.com' }],
} as unknown as Email;

const listDraft = { ...base } as unknown as Email;

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

const inlinePgpDraft = {
  ...base,
  textBody: [{ partId: '1', type: 'text/plain', size: 1 }],
  bodyValues: { '1': { value: ARMOR } },
} as unknown as Email;

const plainDraft = {
  ...base,
  textBody: [{ partId: '1', type: 'text/plain', size: 1 }],
  bodyValues: { '1': { value: 'Hello' } },
} as unknown as Email;

async function mountAndEdit(email: Email) {
  h.listEmail = email;
  render(<MailApp />);
  await waitFor(() => expect(h.listProps?.onEditDraft).toBeTypeOf('function'));
  await act(async () => {
    fireEvent.click(screen.getByTestId('edit-draft'));
  });
}

beforeEach(() => {
  h.listProps = null;
  h.listEmail = null;
  h.composerProps = null;
  h.toastInfo.mockReset();
  h.getEmail.mockReset();
});

describe('editing a draft from the standard mail app', () => {
  it('does not open a fetched encrypted (PGP/MIME) draft from the list', async () => {
    // The list row is a stub without bodyValues; the guard must apply to the
    // full draft returned by Email/get.
    h.getEmail.mockResolvedValue(pgpMimeDraft);
    await mountAndEdit(listDraft);

    expect(h.getEmail).toHaveBeenCalledWith('d1', undefined);
    expect(h.toastInfo).toHaveBeenCalledWith('pgp.draft_not_editable');
    expect(screen.queryByTestId('composer')).toBeNull();
    expect(h.composerProps).toBeNull();
  });

  it('does not open an inline-PGP draft whose body is already loaded', async () => {
    await mountAndEdit(inlinePgpDraft);

    expect(h.getEmail).not.toHaveBeenCalled();
    expect(h.toastInfo).toHaveBeenCalledWith('pgp.draft_not_editable');
    expect(screen.queryByTestId('composer')).toBeNull();
    expect(h.composerProps).toBeNull();
  });

  it('still opens an ordinary plaintext draft', async () => {
    await mountAndEdit(plainDraft);

    await waitFor(() => expect(h.composerProps).not.toBeNull());
    expect(screen.getByTestId('composer')).toBeInTheDocument();
    expect(h.composerProps?.initialData).toMatchObject({
      subject: 'Plans',
      body: 'Hello',
      draftId: 'd1',
    });
    expect(h.toastInfo).not.toHaveBeenCalled();
  });
});
