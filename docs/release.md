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
