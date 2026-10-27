#!/usr/bin/env python3
"""Re-apply the PGP changes to upstream's email-composer.tsx."""
import sys
path = sys.argv[1]
s = open(path).read()

def sub(old, new, count=1):
    global s
    n = s.count(old)
    if n != count:
        sys.exit(f'expected {count} match(es), found {n}:\n{old}')
    s = s.replace(old, new)

# Imports.
sub('import { toast } from "@/stores/toast-store";\n',
    'import { toast } from "@/stores/toast-store";\n'
    'import type { SendEmailResult } from "@/lib/jmap/types";\n'
    'import { usePgpCompose } from "@/components/pgp/use-pgp-compose";\n'
    'import { PgpComposeBanner, PgpComposeToggle } from "@/components/pgp/pgp-compose-controls";\n'
    'import { MailvelopeEditor } from "@/components/pgp/mailvelope-editor";\n'
    'import { withoutPgpAccess } from "@/components/pgp/plugin-guard";\n')

# onSend data and the pgpSupported prop.
sub('''    /** Importance / X-Priority; absent for normal (#970). */
    priority?: MessagePriority;
  }) => void | false | Promise<void | false>;
  onScheduledSendCreated?: () => void | Promise<void>;
''', '''    /** Importance / X-Priority; absent for normal (#970). */
    priority?: MessagePriority;
    /**
     * Set for PGP/MIME messages: submits the already-encrypted raw message. The
     * host must call this instead of building a message from the fields above
     * (which are empty then), and treat its result like the normal send's.
     */
    rawSend?: () => Promise<SendEmailResult>;
  }) => void | false | Promise<void | false>;
  /**
   * The host's `onSend` honors `rawSend`. PGP encryption is only offered when
   * this is set, so a host that ignores `rawSend` can never send a blank
   * plaintext message in place of an encrypted one.
   */
  pgpSupported?: boolean;
  onScheduledSendCreated?: () => void | Promise<void>;
''')
sub('''export function EmailComposer({
  onSend,
  onScheduledSendCreated,
''', '''export function EmailComposer({
  onSend,
  onScheduledSendCreated,
  pgpSupported = false,
''')

# The PGP state, after the draft helpers it uses.
sub('''  // Login that owns the blobs uploaded through `composerClient`.
  const composerAccountId = ''', '''
  // PGP/MIME via the Mailvelope extension. While it is on, nothing typed may
  // reach the server (drafts, attachments) or a plugin: see pgpActiveRef below.
  const pendingAttachmentUploadsRef = useRef(0);
  const pgp = usePgpCompose({
    recipients: [
      ...expandRecipients(withInput(to, toInput)),
      ...expandRecipients(withInput(cc, ccInput)),
      ...expandRecipients(withInput(bcc, bccInput)),
    ].map((r) => r.email),
    get hasAttachments() {
      return attachments.length > 0 || pendingAttachmentUploadsRef.current > 0;
    },
    getPlainText: () => {
      const text = plainTextMode ? body : htmlToPlainText(body);
      return signatureAlreadyInBody
        ? text
        : appendPlainTextSignature(text, signatureIdentity, { separator: signatureSeparatorEnabled });
    },
    hasServerDraft: () => draftIdRef.current !== null,
    // Unlike removeDraftVersion this must not fail quietly: encryption only
    // starts once the plaintext draft is gone from the server.
    discardServerDraft: async () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
        saveTimeoutRef.current = null;
      }
      if (inflightSaveRef.current) {
        try { await inflightSaveRef.current; } catch { /* the draft is deleted next anyway */ }
      }
      const id = draftIdRef.current;
      if (!id) return;
      const localAccountId = draftLocalAccountIdRef.current;
      const owner = localAccountId ? useAuthStore.getState().getClientForAccount(localAccountId) : composerClientRef.current;
      if (!owner) throw new Error('No connection to the account that holds the draft');
      await owner.deleteEmail(id, draftAccountIdRef.current);
      draftIdRef.current = null;
      draftAccountIdRef.current = undefined;
      draftLocalAccountIdRef.current = undefined;
      setDraftId(null);
      setDraftAccountId(undefined);
      setDraftLocalAccountId(undefined);
    },
    onEncryptionStarted: () => setBody(''),
  });
  const pgpActiveRef = pgp.activeRef;

  // Login that owns the blobs uploaded through `composerClient`.
  const composerAccountId = ''')

# Dirty state.
sub('''    body !== initialValuesRef.current.body || attachments.length !== initialValuesRef.current.attachmentCount;
''', '''    body !== initialValuesRef.current.body || attachments.length !== initialValuesRef.current.attachmentCount ||
    // What is typed in the encrypted editor is invisible here, so never let it close silently.
    pgpActiveRef.current;
''')

# Plain text mode cannot change under the encrypted editor.
sub('''  const togglePlainTextMode = useCallback(() => {
    const separator = signatureSeparatorEnabled;
''', '''  const togglePlainTextMode = useCallback(() => {
    if (pgpActiveRef.current) return;
    const separator = signatureSeparatorEnabled;
''')

# Attachments: the upload itself is unchanged, under another name.
sub('''  const addFiles = useCallback(async (files: File[]) => {
    if (!client || files.length === 0) return;
''', '''  const uploadFiles = useCallback(async (files: File[]) => {
    if (!client || files.length === 0) return;
''')
sub('''  }, [client, t, plainTextMode]);
''', '''  }, [client, t, plainTextMode]);

  const addFiles = useCallback(async (files: File[]) => {
    if (!client || files.length === 0) return;
    // Files uploaded from here would sit on the server unencrypted; the
    // encrypted editor has its own attach button.
    if (pgpActiveRef.current) {
      toast.info(t('pgp_attachments_blocked'));
      return;
    }
    // Counts the plugin approval time too, before an attachment chip exists,
    // so encryption cannot be turned on in between.
    pendingAttachmentUploadsRef.current++;
    try {
      await uploadFiles(files);
    } finally {
      pendingAttachmentUploadsRef.current--;
    }
  }, [client, t, uploadFiles, pgpActiveRef]);
''')
sub('''  const handlePluginAttachmentAdd = useCallback(async (raw: PluginAttachmentUpload): Promise<boolean> => {
''', '''  const handlePluginAttachmentAdd = useCallback(async (raw: PluginAttachmentUpload): Promise<boolean> => {
    // The blob is already on the server in cleartext, and the send path drops
    // `attachments` while encrypting: accepting it would both leak the file
    // and silently lose it. Same rule as addFiles.
    if (pgpActiveRef.current) {
      toast.info(t('pgp_attachments_blocked'));
      return false;
    }
''')
sub('''    setAttachments(prev => [...prev, upload]);
    return true;
  }, [composerClient, t]);
''', '''    setAttachments(prev => [...prev, upload]);
    return true;
  }, [composerClient, t, pgpActiveRef]);
''')
sub('''  const handleFilesPicked = useCallback(async (nodes: FileNode[]) => {
    const picker = filesPicker;
    setFilesPicker(null);
    if (!picker) return;
''', '''  const handleFilesPicked = useCallback(async (nodes: FileNode[]) => {
    const picker = filesPicker;
    setFilesPicker(null);
    if (!picker) return;
    // Same rule as addFiles: these would go out unencrypted, or not at all.
    if (pgpActiveRef.current) {
      toast.info(t('pgp_attachments_blocked'));
      return;
    }
''')
sub('''        sourceAccountId: picker.accountId,
      })),
    ]);
  }, [filesPicker, t]);
''', '''        sourceAccountId: picker.accountId,
      })),
    ]);
  }, [filesPicker, t, pgpActiveRef]);
''')

# Drafts.
sub('''  const saveDraftOnce = async (auto = false): Promise<string | null> => {
    if (!client || !composerClient) return null;
''', '''  const saveDraftOnce = async (auto = false): Promise<string | null> => {
    if (!client || !composerClient) return null;
    // Never store anything of an encrypted message on the server, not even its
    // subject and recipients. Every autosave, unload, close and pre-send flush
    // funnels through here.
    if (pgpActiveRef.current) return null;
''')

# Plugins: no draft, no body access while encrypting.
sub('''  const draftSnapshot = () => ({
''', '''  const fullDraftSnapshot = () => ({
''')
sub('''  const draftSnapshotRef = useRef(draftSnapshot);
''', '''  // While encrypting, plugins see an empty message: the body is in the
  // extension's frame, and the recipients and subject are exactly what an
  // encrypted message keeps out of everything but the message itself.
  const draftSnapshot = () => (pgpActiveRef.current
    ? { ...fullDraftSnapshot(), to: [], cc: [], bcc: [], subject: '', htmlBody: '', textBody: '', attachments: [] }
    : fullDraftSnapshot());
  const draftSnapshotRef = useRef(draftSnapshot);
''')
sub('''  const pluginInsertText = useCallback((value: unknown) => {
    if (typeof value !== 'string' || value.length === 0 || value.length > MAX_PLUGIN_INSERT_LENGTH) return false;
''', '''  const pluginInsertText = useCallback((value: unknown) => {
    if (pgpActiveRef.current) return false;
    if (typeof value !== 'string' || value.length === 0 || value.length > MAX_PLUGIN_INSERT_LENGTH) return false;
''')
sub('''  const pluginSelectedText = useCallback(() => {
    if (plainTextModeRef.current) {
''', '''  const pluginSelectedText = useCallback(() => {
    if (pgpActiveRef.current) return '';
    if (plainTextModeRef.current) {
''')
sub('''    const { id, unregister } = registerComposer({
''', '''    const { id, unregister } = registerComposer(withoutPgpAccess(pgpActiveRef, {
''')
sub('''      attach: (file) => pluginAttachRef.current(file as PluginAttachmentUpload),
    });
''', '''      attach: (file) => pluginAttachRef.current(file as PluginAttachmentUpload),
    }));
''')

sub('''      emailHooks.onDraftChange.emit(draftSnapshot());
''', '''      if (!pgpActiveRef.current) emailHooks.onDraftChange.emit(draftSnapshot());
''')

# Send availability and validation.
sub('''  const hasContent = bodyPlainText || attachments.some(att => att.blobId && !att.uploading);
''', '''  // In PGP mode the text is inside the extension's iframe and cannot be inspected.
  const hasContent = pgp.active || bodyPlainText || attachments.some(att => att.blobId && !att.uploading);
''')
sub('''  const canSend = toAddresses.length > 0 && hasContent;
''', '''  const canSend = toAddresses.length > 0 && hasContent && !pgp.sendBlockedReason;
''')
sub('''    if (toAddresses.length === 0) return t('validation.recipient_required');
    if (!hasContent) return t('validation.body_required');
''', '''    if (toAddresses.length === 0) return t('validation.recipient_required');
    if (pgp.sendBlockedReason) return pgp.sendBlockedReason;
    if (!hasContent) return t('validation.body_required');
''')
sub('''      if (!hasContent) errors.body = true;
      setValidationErrors(errors);
''', '''      if (!hasContent) errors.body = true;
      setValidationErrors(errors);

      if (pgp.sendBlockedReason && !errors.to) toast.error(pgp.sendBlockedReason);
''')
sub('''    if (!skipAttachmentCheck && attachmentReminderEnabled) {
''', '''    if (!skipAttachmentCheck && attachmentReminderEnabled && !pgp.active) {
''')

# Plugin send hooks stay out of an encrypted message.
sub('''      const sendCheck = await emailHooks.onBeforeEmailSend.interceptOutcome(sendablePreview);
''', '''      const sendCheck = pgp.active ? 'allowed' : await emailHooks.onBeforeEmailSend.interceptOutcome(sendablePreview);
''')
sub('''      const pluginOutcome = await emailHooks.onComposeSend.takeOver(composeSendRequest);
''', '''      // A crypto plugin must not take over a message Mailvelope is encrypting.
      const pluginOutcome = pgp.active ? 'default' : await emailHooks.onComposeSend.takeOver(composeSendRequest);
''')
sub('''        const outgoing = await emailHooks.onTransformOutgoingEmail.transform(transformInput);
''', '''        const outgoing = pgp.active ? transformInput : await emailHooks.onTransformOutgoingEmail.transform(transformInput);
''')

# The encrypted send.
sub('''        const draftElsewhere = !!finalDraftId && !!draftLogin && draftLogin !== loginFor(identityLocalAccountId);
''', '''        const draftElsewhere = !!finalDraftId && !!draftLogin && draftLogin !== loginFor(identityLocalAccountId);

        // Without a way to submit the ciphertext the host would send the blank
        // fields below as a plaintext message, so refuse rather than fall through.
        let pgpRawSend: (() => Promise<SendEmailResult>) | undefined;
        if (pgp.active) {
          if (!composerClient || !fromEmail || !rawId) throw new Error(t('pgp_no_identity'));
          pgpRawSend = () => pgp.send({
            client: composerClient,
            identityId: rawId,
            from: { name: fromName, email: fromEmail },
            to: toAddresses.map(r => ({ name: r.name, email: r.email })),
            cc: ccAddresses.map(r => ({ name: r.name, email: r.email })),
            bcc: bccAddresses.map(r => ({ name: r.name, email: r.email })),
            subject,
            inReplyTo: threadingHeaders?.inReplyTo,
            references: threadingHeaders?.references,
            delayedUntil: effectiveDelayedUntil,
            requireTls: requireTls || undefined,
          });
        }
''')
sub('''          subject: outgoing.subject,
          body: outgoing.textBody,
          htmlBody: outgoing.htmlBody || undefined,
          draftId: finalDraftId && !draftElsewhere ? finalDraftId : undefined,
''', '''          subject: outgoing.subject,
          // An encrypted message carries no plaintext through here: the host
          // submits `rawSend`'s result instead of building a message from these.
          body: pgp.active ? '' : outgoing.textBody,
          htmlBody: pgp.active ? undefined : (outgoing.htmlBody || undefined),
          draftId: finalDraftId && !draftElsewhere ? finalDraftId : undefined,
''')
sub('''          attachments: uploadedAttachments.length > 0 ? uploadedAttachments : undefined,
          inReplyTo: threadingHeaders?.inReplyTo,
          references: threadingHeaders?.references,
          requestReadReceipt,
''', '''          attachments: !pgp.active && uploadedAttachments.length > 0 ? uploadedAttachments : undefined,
          inReplyTo: threadingHeaders?.inReplyTo,
          references: threadingHeaders?.references,
          ...(pgpRawSend ? { rawSend: pgpRawSend } : {}),
          requestReadReceipt,
''')

# Body, banner and signature preview.
sub('''        {/* Body */}
        {plainTextMode ? (
''', '''        {pgp.active && <PgpComposeBanner {...pgp.bannerProps} />}
        {/* Body */}
        {pgp.active ? (
          <MailvelopeEditor {...pgp.editorProps} />
        ) : plainTextMode ? (
''')
sub('''        {signatureAlreadyInBody ? null
''', '''        {pgp.active || signatureAlreadyInBody ? null
''')

# Toolbar: no attach control while encrypting, and the encrypt toggle.
sub('''            {(filesEnabled && composerClient?.supportsFiles?.()) || hasAttachMenuActions ? (
''', '''            {pgp.active ? (
              // Files attached here would be uploaded unencrypted; the
              // encrypted editor has its own attach button.
              <Button
                variant="ghost"
                disabled
                className="h-9 max-md:h-11 max-md:min-w-11 justify-center gap-1.5 px-2 sm:px-2.5"
                title={t('pgp_attachments_blocked')}
                aria-label={t('attach')}
              >
                <Paperclip className="w-4 h-4" />
              </Button>
            ) : (filesEnabled && composerClient?.supportsFiles?.()) || hasAttachMenuActions ? (
''')
sub('''            {/* Sign/encrypt controls are contributed by crypto plugins via the
                composer-toolbar slot (rendered below). */}
''', '''            {pgpSupported && (pgp.available || pgp.active) && (
              <PgpComposeToggle
                mode={pgp.mode}
                onToggleEncrypt={pgp.toggleEncrypt}
                onToggleSign={pgp.toggleSign}
              />
            )}
            {/* Sign/encrypt controls are contributed by crypto plugins via the
                composer-toolbar slot (rendered below). */}
''')

# Close dialog: an encrypted message cannot be saved.
sub('''                {closeDialogKind === 'discard' ? t('discard_draft_message') : t('close_draft_message')}
''', '''                {pgp.active ? t('close_pgp_message') : closeDialogKind === 'discard' ? t('discard_draft_message') : t('close_draft_message')}
''')
sub('''              {closeDialogKind === 'close' && (
                <Button onClick={handleSaveDraftAndClose}>
''', '''              {closeDialogKind === 'close' && !pgp.active && (
                <Button onClick={handleSaveDraftAndClose}>
''')
sub('''      {previewAttachment && (
''', '''      {pgp.dialog}

      {previewAttachment && (
''')

open(path, 'w').write(s)
