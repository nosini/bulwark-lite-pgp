import type { ComposerHandle } from "@/lib/plugin-sandbox/composer-registry";

/**
 * The composer handle plugins reach through `api.composer`, closed while the
 * Mailvelope editor holds the message: the text is inside the extension's
 * frame, and anything a plugin wrote or attached here would either leak in
 * cleartext or be dropped from the encrypted send.
 */
export function withoutPgpAccess(activeRef: { readonly current: boolean }, handle: ComposerHandle): ComposerHandle {
  return {
    readBody: () => (activeRef.current ? { html: '', text: '' } : handle.readBody()),
    readSelection: () => (activeRef.current ? { html: '', text: '', empty: true } : handle.readSelection()),
    replaceBody: (html, text) => !activeRef.current && handle.replaceBody(html, text),
    replaceSelection: (html, text, opts) => !activeRef.current && handle.replaceSelection(html, text, opts),
    attach: (file) => (activeRef.current ? Promise.resolve(false) : handle.attach(file)),
  };
}
