# Bulwark Lite with PGP

[Bulwark Webmail](https://github.com/bulwarkmail/webmail) Lite, with OpenPGP
encryption through the [Mailvelope](https://mailvelope.com) browser extension.
You can read PGP/MIME and inline PGP mail, and send encrypted (and signed)
PGP/MIME mail. Keys, passphrases and decrypted text stay inside the extension.
The webmail page never sees them, and the server only receives ciphertext.

Each release is an upstream Bulwark release with these changes applied, named
after it: `v1.18.0-1` is built from upstream 1.18.0. Without Mailvelope, or before
you allow this site in it, the webmail works like upstream Bulwark Lite.

## Install on Stalwart

Bulwark Lite runs as a Stalwart `Application`: Stalwart downloads the zip and
serves it on its own HTTP listener. You need Stalwart 0.16.6 or later, or 1.0.
As an administrator:

- Web admin: open **Settings > Web Applications > Create**. Enter the
  description `Bulwark Webmail`, the resource URL
  `https://github.com/nosini/bulwark-lite-pgp/releases/latest/download/bulwark-lite-stalwart.zip`
  and the URL prefix `/webmail`. Then run **Actions > Update applications**, or
  restart Stalwart.
- CLI:

  ```bash
  stalwart-cli create Application \
    --field description='Bulwark Webmail' \
    --field resourceUrl='https://github.com/nosini/bulwark-lite-pgp/releases/latest/download/bulwark-lite-stalwart.zip' \
    --field 'urlPrefix={"/webmail":true}'
  stalwart-cli create Action/UpdateApps
  ```

Open `https://<your stalwart host>/webmail/` and sign in with a mail account.

The `latest` URL always points to the newest stable release. Stalwart downloads
it again on **Update applications** and at startup. To stay on one version, use
that release's URL instead, such as
`.../releases/download/v1.18.0-1/bulwark-lite-stalwart.zip`. The
`LITE-README.md` file in the zip covers the remaining options.

Stalwart sends no Content-Security-Policy for an Application. If a reverse
proxy in front of it adds one, its `frame-src` must allow
`chrome-extension: moz-extension:`, as described in
[the PGP guide](docs/mailvelope-pgp.md#content-security-policy).

### Other web servers

`bulwark-lite-<version>.zip` is the static build for any web server or static
host. Unpack it, set your JMAP server in `config.json`, and follow
`LITE-README.md` in the zip.

Each zip has a `.sha256` file and a GitHub build attestation:

```bash
gh attestation verify bulwark-lite-stalwart.zip --repo nosini/bulwark-lite-pgp
```

## Set up Mailvelope

1. Install Mailvelope for Chrome, Edge or Firefox.
2. In Mailvelope, open **Authorized Domains**, add the webmail's host (for
   example `mail.example.com`), and turn on the entry's **API** option.
3. Reload the webmail. A new **Settings > PGP encryption** page lets you
   generate or import your key, and the composer gets an encrypt button.

When you send encrypted mail:

- The subject, sender, recipients and date are not encrypted.
- Nothing is saved to the server while you write. There are no drafts, and
  closing the composer discards the message.
- Add attachments with the button inside the encrypted editor.
- Send is blocked while a recipient has no key. The webmail never falls back
  to sending unencrypted.

[docs/mailvelope-pgp.md](docs/mailvelope-pgp.md) covers using it in more
detail, and its limitations.

## Development

See [docs/development.md](docs/development.md).

## License

AGPL-3.0-only, like upstream Bulwark Webmail. Every release links its source
code in the webmail's About dialog.
