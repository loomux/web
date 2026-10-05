# Changelog fragments

A pull request with a user-visible change adds its `CHANGELOG.md` entry
here as its own file instead of editing `CHANGELOG.md`, so open pull
requests never conflict over the same `[Unreleased]` lines. A milestone
(each MINOR, an rc, 1.0.0) folds them into `CHANGELOG.md` with
`scripts/changelog.sh release VERSION DATE`; see
`docs/release.md` and loomux/server `docs/release/versioning.md`.

One file per pull request, named for it (`loom-134-credentials.md`).
Inside, Keep a Changelog sections (`### Added`, `### Changed`,
`### Deprecated`, `### Removed`, `### Fixed`, `### Security`), each with
`- ` entries:

```markdown
### Added

- A Credentials page (LOOM-134): …

### Fixed

- …
```

CI runs `scripts/changelog.sh check`; `scripts/changelog.sh assemble`
prints what the next milestone's section will be.
