# Development

This repository contains only the PGP changes. The webmail is assembled from
upstream at build time:

| Path | Contents |
| --- | --- |
| `upstream/webmail` | Submodule pinned to an upstream release tag (no `v` prefix, for example `1.18.0`). |
| `patches/*.patch` | Changes to upstream files, applied in name order with `git apply`. |
| `src/` | New files, copied over the upstream tree at the same paths. |
| `locales/<lang>/*.json` | Only the keys we add. They are merged into upstream's file of the same name. A language without a directory here gets the `en` keys. |
| `tools/` | One-off helpers from the rebase onto 1.18.0. They are not part of the build. |

`npm run prepare:webmail` (`scripts/prepare.mjs`) assembles `build/webmail`
from these. It stops if:

- the submodule has uncommitted changes. Only committed upstream files are
  used.
- a patch does not apply.
- a file in `src/` now exists upstream.
- one of our locale keys now exists upstream, or upstream drops a language we
  have keys for.

Each run rebuilds the tree from scratch but keeps `build/webmail/node_modules`,
so do not edit files in `build/webmail`. Set `WEBMAIL_VERSION` to override
upstream's `VERSION` file. Releases set it to the tag without the `v`.

## Commands

```bash
git submodule update --init
npm run install:webmail   # prepare, then npm ci in build/webmail
npm run typecheck
npm test                  # vitest; extra arguments go to vitest
npm run lint
LITE_TARGET=stalwart npm run build:lite   # or static
```

`npm test`, `npm run typecheck`, `npm run lint` and `npm run build:lite` prepare
again first, so they always use the current patches and `src/`. To run any
other command in the assembled tree, use `node scripts/run.mjs COMMAND...`. For
example: `node scripts/run.mjs vitest run components/pgp`.

`build:lite` deletes server-only files from `build/webmail`, which is fine
because the next prepare rebuilds the tree. The Stalwart zip is
`build/webmail/bulwark-lite-stalwart.zip`, and the static site is
`build/webmail/out`.

## Changing upstream files

Edit a scratch clone of the pinned upstream commit and write the diff back to
the patch:

```bash
git clone -q upstream/webmail build/edit
git -C build/edit apply ../../patches/0001-pgp-integration.patch
# edit files in build/edit
git -C build/edit diff > patches/0001-pgp-integration.patch
rm -rf build/edit
npm test
```

New files belong in `src/`, not in a patch, and new locale keys belong in
`locales/`.

Upstream locale files mostly use CRLF line endings. The merge writes back each
file's dominant line ending.

## Updating upstream

Every Monday the **Update** workflow moves the submodule to upstream's latest
release on the `update/upstream` branch. It opens or updates a pull request
that says whether the patches still apply, and it starts the checks on that
branch. If they fail, fix the patches on the same branch. The bot adds later
releases on top of commits made by people instead of replacing them. The
workflow needs the repository setting **Allow GitHub Actions to create and
approve pull requests**. GitHub disables scheduled workflows after 60 days
without activity in the repository. If that happens, re-enable **Update** on
the Actions page, or run it by hand.

To update by hand:

```bash
git -C upstream/webmail fetch origin tag 1.19.0
git -C upstream/webmail checkout 1.19.0
npm run prepare:webmail
```

## Releases

Push a tag named `v<upstream version>-<revision>`, such as `v1.18.0-1`, or
`v1.18.0-2` for a rebuild of the same upstream release with our changes. The
**Release** workflow runs the checks, builds both targets with the tag as their
version, and attaches these files to a GitHub release:

- `bulwark-lite-stalwart.zip`
- `bulwark-lite-<version>.zip` (static)
- a `.sha256` file for each zip

Tags matching `v1.2.3` or `v1.2.3-4` are stable releases and become `latest`,
which Stalwart installations follow. Any other tag, such as `v1.19.0-rc1`, is
published as a prerelease. Re-running the workflow for an existing tag
replaces the files.

The build bakes the release's links into the zips: the About dialog links the
source at the tag, and the Stalwart `LITE-README.md` points to this repository's
download URLs.
