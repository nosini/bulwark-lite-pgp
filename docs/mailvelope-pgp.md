# PGP with Mailvelope

Bulwark Lite reads and sends OpenPGP mail through the
[Mailvelope](https://mailvelope.com) browser extension. Mailvelope keeps your
keys and passphrases, and it shows decrypted mail and the encrypted editor in
its own frames. The webmail page never sees your plaintext, and the server only
receives ciphertext.

Without Mailvelope, or before you authorize the site in it, the webmail shows
no PGP features and works like upstream Bulwark Lite.

## Setup

1. Install Mailvelope for Chrome, Edge or Firefox.
2. In Mailvelope, open **Authorized Domains** and add the host the webmail is
   served from, for example `mail.example.com`. Turn on the entry's **API**
   option.
3. Reload the webmail. **Settings > PGP encryption** appears. Its button opens
   Mailvelope's own settings in a new tab, where you generate or import your
   key.

If the PGP settings don't appear, check that the domain is authorized and that
its API option is on.

## Content-Security-Policy

Mailvelope's frames come from the extension, so a Content-Security-Policy must
allow the extension schemes in `frame-src`:

```
frame-src 'self' blob: chrome-extension: moz-extension:
```

If it doesn't, decrypted messages and the encrypted editor stay blank.

- **Stalwart:** Stalwart sends no policy for an Application, so you only need
  this if a reverse proxy in front of it adds one.
- **Netlify and Cloudflare Pages:** the `_headers` file in the static zip
  already includes it.
- **nginx, Caddy or a CDN with its own policy:** add the two schemes to its
  `frame-src`. A complete policy for a static build that talks to
  `mail.example.com`:

  ```nginx
  add_header Content-Security-Policy "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https:; font-src 'self' https: data:; connect-src 'self' https://mail.example.com; frame-src 'self' blob: chrome-extension: moz-extension:; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'; media-src 'self' blob:" always;
  ```

## Reading encrypted mail

Encrypted messages open decrypted, in both PGP/MIME and inline PGP formats. An
inline message is recognized when a `PGP MESSAGE` block starts on a line of its
own; armor quoted in a reply (`> -----BEGIN PGP MESSAGE-----`) is not. When the
body has text outside the block (a note above it, a mailing-list footer below),
Mailvelope shows only the block and a note points to **Show original** for the
rest. Mailvelope shows whether the signature is valid inside the message frame.
**Show original** displays the message as received.

Messages that are signed but not encrypted, PGP/MIME (`multipart/signed`) or
cleartext-signed (`BEGIN PGP SIGNED MESSAGE`), are shown as normal text.
Mailvelope's display container refuses them (`WRONG_ARMORED_TYPE`), and their
text is readable as it is. Their signature is not verified.

## Sending encrypted mail

Click the lock button in the composer to encrypt. The second button signs the
message as well. Changing that choice restarts the editor and clears what you
typed in it, so choose it before you write.

The composer checks each recipient for a key. If Mailvelope finds one on a key
server, the composer offers to import it. **Send** stays blocked while any
recipient has no key, and the webmail never sends the message unencrypted
instead. Only recipients that have been added are checked: text still in a
recipient field may be half typed, so it is not looked up, and Send stays blocked
until it is added.

If your own key is in Mailvelope, the copy in Sent is encrypted to you as well,
so you can read it later. The composer tries the From address, the same address
without its `+tag`, and the identity's address. The delivery-notification (DSN)
and read-receipt requests are kept: DSN goes in the SMTP envelope, the read
receipt as an unencrypted `Disposition-Notification-To` header.

With a send delay, **Undo** stops the submission and keeps the encrypted message
in Drafts (the plaintext is gone with the editor, so the ciphertext is the only
copy). It can be read there but not edited: the composer refuses to open an
encrypted draft, which would otherwise come up as an empty body and send as
plaintext.

While encryption is on:

- The subject, sender, recipients and date are not encrypted.
- Nothing is saved to the server. There are no drafts, and closing the composer
  discards the message. If the message already had a saved draft, turning on
  encryption deletes it, after asking, because that draft is unencrypted.
- Leaving the composer loses the text: opening another message puts it aside,
  and the message comes back with the recipients and subject, encryption still
  on, an empty editor and a notice that the text is gone.
- Add attachments with the button inside the encrypted editor. The composer's
  own attach button is turned off, because files attached there would be
  uploaded unencrypted.
- **Bcc is not available.** One OpenPGP message holds a session-key packet per
  recipient key, so every recipient could read the Bcc recipients' key IDs off
  it. Send is blocked while Bcc has recipients; send them a separate message.

## Limitations

- Replies and forwards quote the encrypted text, not the decrypted one. Copy
  the parts you want to quote into the editor yourself.
- Messages that are signed but not encrypted, PGP/MIME or cleartext-signed, are
  shown without checking the signature.
- When Mailvelope updates itself while you're writing, the encrypted editor
  stops working and what you typed is lost. The composer blocks Send. When the
  extension comes back the editor restarts empty, and a notice says so.
- Depending on Mailvelope's settings, checking a recipient's key can look up
  the address on a key server. Mailvelope makes these requests, not the
  webmail.
- Bcc in encrypted mode is a follow-up. Instead of blocking Send, submit one
  message encrypted to To and Cc, then a separate copy encrypted to each Bcc
  recipient. That needs several submissions per Send, handling for some of them
  failing, and undo send covering all of them.
