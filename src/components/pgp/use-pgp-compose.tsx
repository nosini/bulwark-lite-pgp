"use client";

import { useCallback, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { useConfirmDialog } from '@/hooks/use-confirm-dialog';
import { PGP_ERROR_MESSAGE_KEYS, encryptAndBuildMessage, pgpErrorMessageKey } from '@/lib/mailvelope/compose';
import type { MimeAddress } from '@/lib/mailvelope/pgp-mime';
import { importRecipientKey, type RecipientKeyStatus } from '@/lib/mailvelope/recipients';
import { sanitizeDisplayName } from '@/lib/rfc5322-mailbox';
import type { MailvelopeEditor } from '@/lib/mailvelope/types';
import type { IJMAPClient } from '@/lib/jmap/client-interface';
import type { SendEmailResult } from '@/lib/jmap/types';
import { useEmailStore } from '@/stores/email-store';
import { selectPgpAvailable, useMailvelopeStore, usePgpAvailable } from '@/stores/mailvelope-store';
import { toast } from '@/stores/toast-store';
import type { PgpComposeMode } from './pgp-compose-controls';
import { useRecipientKeyStatus } from './use-recipient-key-status';

export interface UsePgpComposeOptions {
  /**
   * Every committed To/Cc/Bcc address. Only these are looked up: text still in
   * a recipient field may be half typed, and Mailvelope resolves an address it
   * has no key for over WKD or a key server.
   */
  recipients: string[];
  /** Text typed in a recipient field but not yet committed. Blocks Send. */
  uncommittedRecipients: string[];
  /**
   * Whether there are Bcc recipients. Blocks Send: one OpenPGP message carries a
   * session-key packet per recipient key, so every recipient could read the Bcc
   * recipients' key ids off the message.
   */
  hasBcc: boolean;
  /** Files already uploaded to the server in plain form. */
  hasAttachments: boolean;
  /** What has been typed so far, carried into the encrypted editor. */
  getPlainText: () => string;
  hasServerDraft: () => boolean;
  /** Remove the plaintext draft from the server and forget its id. Throws on failure. */
  discardServerDraft: () => Promise<void>;
  /** The typed text now lives in the encrypted editor: clear Bulwark's copy. */
  onEncryptionStarted: () => void;
  /**
   * Start with encryption on: a composer that was encrypting when it was
   * suspended comes back encrypted (with an empty editor), never as plaintext.
   */
  initialMode?: PgpComposeMode;
}

export interface PgpSendParams {
  /** Client of the account the identity belongs to. */
  client: IJMAPClient;
  identityId: string;
  from: MimeAddress;
  to: MimeAddress[];
  cc: MimeAddress[];
  /** Always empty: Send is blocked while there are Bcc recipients. Checked again when encrypting. */
  bcc: MimeAddress[];
  /** Addresses whose key would identify the sender, beyond `from`: the identity's own address. */
  ownAddresses?: string[];
  subject: string;
  inReplyTo?: string[];
  references?: string[];
  delayedUntil?: string;
  requireTls?: boolean;
  /** RFC 3461 delivery status notifications, as for a normal send. */
  requestDsn?: boolean;
  /** RFC 8098 read receipt: written as Disposition-Notification-To in the cleartext headers. */
  requestReadReceipt?: boolean;
  /** Connected account that owns the identity, when it is not the active one (#461). */
  localAccountId?: string;
}

type EditorStatus = 'starting' | 'ready' | 'error';

/**
 * Everything the composer needs for Mailvelope encryption, so email-composer.tsx
 * only wires it in. While PGP is on the composer must not persist anything the
 * user typed: `activeRef` is the flag `saveDraft` checks, and it flips before
 * the plaintext draft is deleted so no save can slip in between.
 */
export function usePgpCompose(options: UsePgpComposeOptions) {
  const t = useTranslations('pgp');
  const available = usePgpAvailable();
  const keyring = useMailvelopeStore((s) => s.keyring);
  const { dialogProps, confirm } = useConfirmDialog();

  const [mode, setMode] = useState<PgpComposeMode>(options.initialMode ?? 'off');
  const [initialText, setInitialText] = useState('');
  const [editorStatus, setEditorStatus] = useState<EditorStatus>('starting');
  const editorRef = useRef<MailvelopeEditor | null>(null);
  const activeRef = useRef((options.initialMode ?? 'off') !== 'off');

  // Stays on if the extension disconnects mid-compose (it updated or was disabled):
  // dropping to the normal composer would show an empty editor while the text
  // the user typed is gone with the extension's iframe.
  const active = mode !== 'off';
  const disconnected = active && !available;
  const optionsRef = useRef(options);
  optionsRef.current = options;

  const keyStatus = useRecipientKeyStatus(active, keyring, options.recipients);
  const missing = keyStatus.statuses.filter((s) => s.state === 'missing');

  const toggleEncrypt = useCallback(async () => {
    const opts = optionsRef.current;
    if (mode === 'off') {
      if (opts.hasAttachments) {
        toast.error(t('enable_blocked_attachments'));
        return;
      }
      if (opts.hasServerDraft()) {
        const ok = await confirm({
          title: t('enable_draft_title'),
          message: t('enable_draft_message'),
          confirmText: t('enable_confirm'),
          variant: 'destructive',
        });
        if (!ok) return;
      }
      // Attachments may have started while the draft confirmation was open.
      if (optionsRef.current.hasAttachments) {
        toast.error(t('enable_blocked_attachments'));
        return;
      }
      const text = optionsRef.current.getPlainText();
      // Block every save first, then remove what is already on the server.
      activeRef.current = true;
      try {
        await opts.discardServerDraft();
      } catch {
        activeRef.current = false;
        toast.error(t('enable_draft_failed'));
        return;
      }
      setInitialText(text);
      setEditorStatus('starting');
      opts.onEncryptionStarted();
      setMode('encrypt');
      return;
    }

    const ok = await confirm({
      title: t('disable_title'),
      message: t('disable_message'),
      confirmText: t('disable_confirm'),
      variant: 'destructive',
    });
    if (!ok) return;
    activeRef.current = false;
    editorRef.current = null;
    setInitialText('');
    setMode('off');
  }, [mode, confirm, t]);

  const toggleSign = useCallback(async () => {
    if (mode === 'off') return;
    const ok = await confirm({
      title: t('sign_switch_title'),
      message: t('sign_switch_message'),
      confirmText: t('sign_switch_confirm'),
      variant: 'destructive',
    });
    if (!ok) return;
    // The editor's options are fixed at creation, so it restarts empty.
    editorRef.current = null;
    setInitialText('');
    setEditorStatus('starting');
    setMode(mode === 'encrypt' ? 'encrypt-sign' : 'encrypt');
  }, [mode, confirm, t]);

  const onEditor = useCallback((editor: MailvelopeEditor | null) => {
    editorRef.current = editor;
    setEditorStatus(editor ? 'ready' : 'starting');
    // The carried-over text is in the editor now and is the user's to change
    // there. Any later restart (the extension disconnecting and coming back)
    // must not put that first version back as if it were what they wrote.
    if (editor) setInitialText('');
  }, []);

  // The extension went away and came back: its editor restarts empty, and what
  // was typed in the old one is gone. Say so, rather than let the empty editor
  // pass for the message.
  const wasDisconnectedRef = useRef(false);
  useEffect(() => {
    if (disconnected) {
      wasDisconnectedRef.current = true;
    } else if (wasDisconnectedRef.current && active) {
      wasDisconnectedRef.current = false;
      toast.info(t('editor_restarted'));
    }
  }, [disconnected, active, t]);

  const onEditorError = useCallback(
    (err: unknown) => {
      setEditorStatus('error');
      // A known code explains itself; only fall back to the raw text otherwise.
      const code = (err as { code?: string } | undefined)?.code;
      const key = code ? PGP_ERROR_MESSAGE_KEYS[code] : undefined;
      if (key) {
        toast.error(t(key, { address: '' }));
        return;
      }
      toast.error(t('editor_failed', { message: err instanceof Error ? err.message : String(err) }));
    },
    [t],
  );

  const manageKeys = useCallback(async () => {
    try {
      await useMailvelopeStore.getState().keyring?.openSettings();
    } catch {
      toast.error(t('error_generic'));
    }
  }, [t]);

  const importKey = useCallback(
    async (status: RecipientKeyStatus) => {
      const current = useMailvelopeStore.getState().keyring;
      if (!current) return;
      try {
        const result = await importRecipientKey(current, status);
        if (result === 'REJECTED') toast.info(t('import_rejected'));
        else if (result) toast.success(t('import_done'));
        keyStatus.refresh(status.address);
      } catch {
        toast.error(t('import_failed'));
      }
    },
    [keyStatus, t],
  );

  // Why Send is unavailable right now, or null. Recipients without a key block
  // it rather than falling back to plaintext: that choice is the user's.
  let sendBlockedReason: string | null = null;
  if (active) {
    if (disconnected) sendBlockedReason = t('error_disconnected');
    else if (editorStatus === 'error') sendBlockedReason = t('editor_failed_short');
    else if (editorStatus !== 'ready') sendBlockedReason = t('editor_not_ready');
    else if (options.hasBcc) sendBlockedReason = t('send_blocked_bcc');
    else if (options.uncommittedRecipients.length > 0) {
      sendBlockedReason = t('send_blocked_uncommitted', { addresses: options.uncommittedRecipients.join(', ') });
    } else if (keyStatus.checking) sendBlockedReason = t('recipients_checking');
    else if (missing.length > 0) {
      sendBlockedReason = t('send_blocked_missing', { addresses: missing.map((s) => s.address).join(', ') });
    } else if (keyStatus.failed.length > 0) sendBlockedReason = t('send_blocked_failed');
  }

  /**
   * Encrypt the editor content and submit the resulting PGP/MIME message.
   * The plaintext never leaves the extension; only ciphertext is uploaded.
   */
  const send = useCallback(
    async (params: PgpSendParams): Promise<SendEmailResult> => {
      const editor = editorRef.current;
      const currentKeyring = useMailvelopeStore.getState().keyring;
      const state = useMailvelopeStore.getState();
      if (!editor || !currentKeyring || !selectPgpAvailable(state)) throw new Error(t('editor_not_ready'));
      try {
        const { raw, envelopeRecipients } = await encryptAndBuildMessage({
          editor,
          keyring: currentKeyring,
          // Servers hand identity names back as `Name <addr>`; the header would then read `"Name <addr>" <addr>`.
          from: { name: sanitizeDisplayName(params.from.name) || undefined, email: params.from.email },
          to: params.to,
          cc: params.cc,
          bcc: params.bcc,
          ownAddresses: params.ownAddresses,
          subject: params.subject,
          inReplyTo: params.inReplyTo,
          references: params.references,
          requestReadReceipt: params.requestReadReceipt,
        });
        const blob = new Blob([raw], { type: 'message/rfc822' });
        return await useEmailStore
          .getState()
          .sendRawEmail(params.client, blob, params.identityId, params.delayedUntil, envelopeRecipients, {
            isPgp: true,
            ...(params.requireTls ? { requireTls: true } : {}),
            ...(params.requestDsn ? { requestDsn: true } : {}),
            ...(params.localAccountId ? { localAccountId: params.localAccountId } : {}),
          });
      } catch (err) {
        // Mailvelope errors carry a code, and so do the address ones raised
        // before encrypting; anything else (network, server) is shown as is.
        const coded = err as { code?: string; address?: string } | undefined;
        if (coded?.code) {
          // Unused by messages without the placeholder, needed by the address ones.
          throw new Error(t(pgpErrorMessageKey(err), { address: coded.address ?? '' }));
        }
        throw err;
      }
    },
    [t],
  );

  const dialog: ReactNode = <ConfirmDialog {...dialogProps} />;

  return {
    available,
    mode,
    active,
    /** Read by `saveDraft`: true from the moment encryption starts until it is switched off. */
    activeRef,
    signing: mode === 'encrypt-sign',
    initialText,
    sendBlockedReason,
    toggleEncrypt,
    toggleSign,
    send,
    dialog,
    editorProps: { signMsg: mode === 'encrypt-sign', initialText, onEditor, onError: onEditorError },
    bannerProps: {
      signing: mode === 'encrypt-sign',
      disconnected,
      statuses: keyStatus.statuses,
      failed: keyStatus.failed,
      checking: keyStatus.checking,
      onImport: importKey,
      onRefresh: () => keyStatus.refresh(),
      onManageKeys: manageKeys,
    },
  };
}
