# Changelog

All notable changes to the Loomux web client are documented here. The
format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and the web client has its own version line
([Semantic Versioning 2.0.0](https://semver.org/spec/v2.0.0.html); see
loomux/server `docs/release/versioning.md`). Every merge to main is a
patch release whose notes are on its GitHub release; this file has the
curated milestones.

## [Unreleased]

What's coming waits in [`changes/`](changes/), one file per pull
request, until the next milestone folds it in here.

## [0.2.0] - 2026-10-06

The first MINOR after the base: everything merged since 0.1.0 (the 0.1.x
patch releases). loomux/server 0.2.0 pins this version.

### Added

- A Credentials page (LOOM-134): add the API keys and tokens agents get as
  environment variables, optionally only for one workspace or agent type,
  replace a value, or delete one. Values are typed into password fields
  (`autocomplete=new-password`) and never shown again (the server doesn't
  return them).
- A turn that failed on the agent's usage limit says so and when it
  resets, with what to do (LOOM-109; server class `agent_rate_limited`).
- Each published bundle carries a GitHub build-provenance attestation,
  which loomux/server checks before installing it in place (LOOM-118).
- CI fails on any known-vulnerable npm package (`npm audit`), dev
  dependencies included (LOOM-125). Changelog entries are files in
  `changes/`.

### Changed

- The chat scrolls to the newest message; a cancelled turn's card and
  the update panel use neutral wording (LOOM-130).

### Fixed

- A conversation that just provisioned a workspace shows its name, not its
  id: an id the cached workspace list lacks fetches the list again.
- The Workspaces page names each workspace's target instead of showing its id.

### Security

- source-map-js 1.2.1 → 1.2.2 (GHSA-68fv-2mgg-jv7q, high: event-loop
  denial of service through indexed source-map offsets). Build-time only,
  through vite, postcss and jsdom; the shipped bundle doesn't include it.

## [0.1.0] - 2026-10-05

The first release, collecting everything built so far. From here on,
every merge to main is a patch release with its own notes.

### Added
- Login, dashboard (attention list, workspace health), conversations,
  workspaces and targets pages.
- Chat with markdown and highlighted code, a live progress card for a
  turn in flight, cancel, plain-language failures with retry, and late
  agent reports.
- Approvals: answer an agent's prompt, or Approve / Deny a router offer,
  from a card.
- Workspace reopen, archive, delete; target policy editing.
- The attach command for taking over an agent's terminal.
- Installable as a PWA; a dashboard section with the web client's
  version, update and rollback.

### Fixed
- After a server restart mid-turn, the page reconnects and shows how the
  turn ended instead of staying on "Running".

[Unreleased]: https://github.com/loomux/web/compare/v0.2.0...HEAD
[0.2.0]: https://github.com/loomux/web/releases/tag/v0.2.0
[0.1.0]: https://github.com/loomux/web/releases/tag/v0.1.0
