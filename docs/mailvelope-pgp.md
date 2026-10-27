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
3. Reload the webmail. **Settings > PGP encryption** appears. Generate or
   import your key there.

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

Encrypted messages open decrypted, in both PGP/MIME and inline PGP formats.
Mailvelope shows whether the signature is valid inside the message frame.
**Show original** displays the message as received.

## Sending encrypted mail

Click the lock button in the composer to encrypt. The second button signs the
message as well. Changing that choice restarts the editor and clears what you
typed in it, so choose it before you write.

The composer checks every recipient for a key. If Mailvelope finds one on a key
server, the composer offers to import it. **Send** stays blocked while any
recipient has no key, and the webmail never sends the message unencrypted
instead. If your own key is in Mailvelope, the copy in Sent is encrypted to you
as well, so you can read it later.

While encryption is on:

- The subject, sender, recipients and date are not encrypted.
- Nothing is saved to the server. There are no drafts, and closing the composer
  discards the message. If the message already had a saved draft, turning on
  encryption deletes it, after asking, because that draft is unencrypted.
- Add attachments with the button inside the encrypted editor. The composer's
  own attach button is turned off, because files attached there would be
  uploaded unencrypted.
- Bcc recipients receive the message, but the copy in Sent doesn't list them.

## Limitations

- Replies and forwards quote the encrypted text, not the decrypted one. Copy
  the parts you want to quote into the editor yourself.
- Messages that are signed but not encrypted are shown without checking the
  signature.
- When Mailvelope updates itself while you're writing, the encrypted editor
  stops working and what you typed is lost. The composer blocks Send until you
  reload the page.
- Depending on Mailvelope's settings, checking a recipient's key can look up
  the address on a key server. Mailvelope makes these requests, not the
  webmail.
