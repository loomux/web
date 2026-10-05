# Changelog

All notable changes to the Loomux web client are documented here. The
format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and the web client has its own version line
([Semantic Versioning 2.0.0](https://semver.org/spec/v2.0.0.html); see
loomux/server `docs/release/versioning.md`). Every merge to main is a
patch release whose notes are on its GitHub release; this file has the
curated milestones.

## [Unreleased]

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

[Unreleased]: https://github.com/loomux/web/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/loomux/web/releases/tag/v0.1.0
