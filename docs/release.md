# Releases (LOOM-58)

Every commit on `main` that passes CI (lint, tests, build) is published
as a GitHub **pre-release** tagged `web-<short sha>` (7 characters). It
has two assets:

- `loomux-web-<short>.tar.gz`: the built `dist/`, with `index.html` at
  the top level.
- `web-release.json`: what the release is, for whoever consumes it:

  ```json
  {
    "schema": 1,
    "repo": "loomux/web",
    "commit": "<full sha>",
    "short": "<7-char sha>",
    "tag": "web-<short>",
    "tarball": "loomux-web-<short>.tar.gz",
    "sha256": "<sha256 of the tarball>",
    "built_at": "<RFC 3339 UTC>",
    "subject": "<commit subject>"
  }
  ```

Consumers:

- **loomux/server's image build** downloads the release named by its
  `deploy/web-ref` (a commit sha), checks the tarball against `sha256`,
  and bakes the bundle into the image. The server no longer builds this
  repo itself.
- **LOOM-118's updater** (in loomuxd) lists these releases and reads the
  same JSON to offer, verify and install a newer bundle.

Pre-releases, not releases: nothing here is a versioned product release
(semver releases are a separate, later decision). Pull requests build
and test but publish nothing. Re-running CI on a commit that already has
a release is a no-op.

CI's `build` job (which runs npm code) has a read-only token. It hands
the tested `dist/` to a separate `publish` job, which runs only for main
pushes and is the only job that can write the repository.

## Vulnerable dependencies (LOOM-125)

CI's `audit` job runs `npm audit --audit-level=low` on every PR and main
push: any known vulnerability, in a runtime or a dev dependency (the
shipped bundle is built with the dev ones), fails it. On a finding:

- update the package (`npm audit fix`, or bump the dependency that pulls
  it in) and say so in the PR;
- if there's no fix yet, decide whether it can reach the shipped bundle
  or the build. If it can't, pin an `overrides` entry or record the
  advisory here, with why it doesn't apply and when to look again,
  rather than turning the job off.

No advisory is accepted this way today.

## Changelog fragments

A pull request with a user-visible change doesn't edit `CHANGELOG.md`:
it adds `changes/<slug>.md` with its entry under Keep a Changelog
headings (format in `changes/README.md`), so open pull requests never
conflict over `[Unreleased]`. CI checks them (`scripts/changelog.sh
check`). A milestone (each MINOR; later 1.0.0, when API v1 is declared stable) runs
`scripts/changelog.sh release 0.2.0 2026-10-20`, which writes them into
`CHANGELOG.md` as that version's section, updates the links and deletes
them; edit the section, merge, then tag. `scripts/changelog.sh
assemble` previews it.
