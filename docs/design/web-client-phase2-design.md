# Loomux — Web Client Design, Phase 2 (post-LOOM-24)

## Overview

LOOM-24 ("build to approved design") is Done: the scaffold from
`docs/design/web-client-design.md` (LOOM-23) shipped and is wired up
end-to-end against a real `loomuxd` — auth, routing, the typed API client,
SSE streaming, and one page per route. LOOM-31 (persisted message
transcript) and LOOM-33 (static-file hosting) landed on top of it and both
docs and README are current as of `main` (commit `041a1dd` here,
`cdca6dc` in `loomux/server`).

No ticket currently defines what happens *after* the scaffold. This spec
is that definition: what each existing page should actually grow into, and
what new pages/capabilities are missing for this to be a genuinely usable
daily-driver chat-with-agents client, not just a working demo of the API.

This spec covers the client only, same boundary as LOOM-23. Where an item
below needs a server-side change, it's called out explicitly under
"Server-side dependencies" — those are candidate `loomux-server` tickets,
not part of this repo's own scope.

**Framing constraint carried over from Phase 1, worth restating because it
shapes several decisions below:** this is a personal, single-user tool
"checked from a phone throughout the day" (`loomux-server`'s
`api/README.md`). Phase 1 optimized for "does the data flow end to end."
Phase 2 optimizes for "can I glance at this on my phone and immediately
know what needs me."

## Current state (what's actually built today)

Read directly from `main` before writing this spec, not from memory of
LOOM-23/24's own design intent:

- **`/login`** — password form. Matches spec, nothing missing.
- **`/workspaces`** — flat list: name, `target_id` (raw UUID), status
  badge. Nothing else. `workspaceSummary` in `api/server.go` is
  deliberately trimmed — `registry.Workspace` actually carries `Tags`,
  `Description`, `Capabilities`, `RollingSummary`, `IsDynamic`,
  `LastUsedAt`, none of which reach the client today (the handler's own
  comment says so explicitly: "not yet client-facing").
- **`/conversations`** — flat list: raw `conversation_id`, raw
  `workspace_id`, status badge, most-recently-updated first. "New
  conversation" just generates a client-side UUID and navigates — no way
  to hint a workspace.
- **`/conversations/:id`** — the chat view. Message transcript renders as
  plain-text bubbles (no markdown/code formatting, no timestamps). Only
  the conversation's *latest* task's status and attach-info are shown —
  `history.tasks` (the full task history) is fetched but everything
  except the last element is discarded. Composer is a single-line input.
  SSE gives a live status string and a connected/disconnected boolean.
- **Cross-cutting:** `VersionBanner` (API version mismatch warning),
  `ProtectedRoute` (auth gate), logout button in the nav. `/` redirects
  straight to `/workspaces`.
- **A gap versus Phase 1's *own* spec, not just new scope:** Phase 1's
  design doc promises "a 'reconnecting…' indicator shown if disconnected
  for more than 5 seconds" for SSE drops. `useConversationStream.ts` only
  exposes a `connected` boolean with no time-since-disconnect tracking,
  and `ConversationDetailPage.tsx` only renders a green dot when
  connected — nothing at all when it isn't. This was speced but never
  built; closing it is listed below alongside genuinely new work, since a
  reader comparing this repo to its own design doc would otherwise assume
  it exists.

The API surface itself is **fully consumed already** — every endpoint in
`web-client-design.md`'s "API surface consumed" section has a caller in
`src/lib/api.ts` and a route that calls it. The opportunity here isn't
"wire up something unused"; it's that the *server* holds richer data than
the *API* exposes (workspace metadata above) in a couple of places, and
that the client's UI layer hasn't grown past "prove the plumbing works"
even where the data it needs already round-trips today.

## Page-by-page: what each should become

### `/conversations` → the real home page

Currently a flat, UUID-labeled list. Target:

- **Resolve `workspace_id` → workspace name** by joining against
  `GET /workspaces` client-side (already fetched elsewhere; a shared
  TanStack Query cache entry makes this free). No raw UUIDs in the
  primary list.
- **Attention-first ordering/filtering.** `conversationSummary.status` is
  already the conversation's latest task's status — `running`,
  `awaiting-input`, `human-takeover`, `completed`, `failed` are all
  already there today, unused for anything but a neutral badge. Surface
  `awaiting-input`/`human-takeover` conversations first (or as a filter
  chip: "needs you" / "running" / "done"), color-coded by urgency. This
  is the single highest-value change for the stated "phone glance" use
  case and requires **zero server changes** — the data's already in the
  response.
- **`/` should land here, not on `/workspaces`.** Conversations are the
  daily-use surface; workspaces are closer to infrastructure you check
  occasionally. (Small change, but worth calling out since it's the
  literal first thing anyone sees.)
- **Search/filter by workspace.** Not pagination yet — conversation
  counts at personal-tool scale don't need it; revisit if that stops
  being true.

### `/conversations/:id` — the chat view itself

This is where most of the value is. Target:

- **Markdown + code rendering for message content.** Agent replies are
  routinely code-heavy; today they render as an unstyled text blob in a
  chat bubble. This is the single biggest quality gap between "a working
  demo" and "a tool you'd actually want to read agent output in." Needs
  a rendering dependency (e.g. `react-markdown` + a code-highlighting
  plugin) — nothing server-side changes, `content` is already plain
  text/markdown-ish today.
- **Message timestamps.** `created_at` is already in every
  `ConversationMessage` and simply isn't rendered. Relative time
  ("2m ago") with an absolute-time tooltip.
- **Full task-history panel**, not just the latest task. `history.tasks`
  already carries every task in the conversation, oldest first; today
  everything but the last one is thrown away. An expandable panel
  showing each task's kind/agent_type/status/timestamps, each with its
  own attach-info affordance (not just the latest task's) — this is what
  actually lets a conversation that spans multiple tasks (a continuation,
  or the router handing a later turn to a different workspace) be
  inspected at all.
- **Show which workspace(s) this conversation has touched**, joined by
  name from `/workspaces` (same join as the conversations list).
- **Close the reconnecting-indicator gap** described above: track
  time-since-disconnect in `useConversationStream`, surface a
  "reconnecting…" state distinctly from both "connected" and "never
  connected."
- **Multiline composer**: textarea with shift+enter for a newline,
  enter to send. The current single-line `<input>` makes anything but a
  one-line message awkward to compose from a phone keyboard.
- **Copy-to-clipboard on the attach-info command** — small, but it's a
  command meant to be pasted into a terminal, and right now it's
  select-and-copy from a `<code>` block.

### `/workspaces` → an actual fleet-status view

Today this page shows less than what the server already tracks. Target
(needs a server-side change — see below):

- Workspace detail (tags, description, capabilities, rolling summary,
  `is_dynamic`, `last_used_at`) — this is genuinely useful state ("what
  does the router think this workspace is for, what happened here last,"
  i.e. exactly what a human glancing at their fleet wants) that exists in
  `registry.Workspace` today and is invisible end-to-end.
- Resolve `target_id` → target name/host/kind, so "where does this
  actually run" is visible without cross-referencing anything.

## New: a real landing/attention view

Replacing the bare `/` → `/workspaces` redirect with a dashboard that
combines: conversations currently needing attention (top), a compact
workspace-health strip, and the "new conversation" entry point. This
follows directly from the attention-first conversations list above — once
that data is being surfaced at all, giving it the literal front page is a
small step, and matches "checked from a phone throughout the day" better
than landing on an infrastructure list.

## Server-side dependencies (candidate `loomux-server` changes)

Everything above the line is client-only. These need a `loomux-server`
change first — flagging them here (not filing them) per the task:

1. **Expose workspace metadata.** Extend `workspaceSummary` (or add
   `GET /workspaces/{id}`) to include `tags`, `description`,
   `capabilities`, `rolling_summary`, `is_dynamic`, `last_used_at`, and
   resolved target info. Small, additive — the data already exists in
   `registry.Workspace`; nothing to design, just to stop trimming it.
   Blocks the richer `/workspaces` page above.
2. **A human-readable hint per conversation in the list.** Right now
   `GET /conversations` returns nothing text-like — no way to show
   "what is this conversation about" without opening it. Cheapest fix:
   have `listConversationsResponse` include a short preview of the first
   message (a few dozen characters), computed at listing time from
   already-stored `Message` rows. (Alternative considered: have the
   client fetch each conversation's first message individually — rejected
   as N+1 against `GET /conversations/{id}` for a purely cosmetic label.)
3. **Optional workspace hint on dispatch.** `POST /dispatch` today takes
   only `{conversation_id, message}`; the router picks the workspace
   purely from message content + registry metadata. Letting a "new
   conversation" flow suggest a workspace would need an additive optional
   field. Lower priority than #1/#2 — router-only routing has worked
   fine so far, per Phase 1's own framing — but worth having on the list
   since it's the natural next ask once someone's staring at the
   workspaces page wanting to talk to a *specific* one.
4. **Session listing / device management.** `SessionStore` today only
   supports create/get-by-hash/touch/delete — no way to list a user's own
   active sessions. A second-device login (phone + laptop, both
   long-lived per the 30-day sliding TTL) has no way to be seen or
   individually revoked from the client today short of blowing away
   *all* sessions via a password change. Lower priority — flagging
   because "second device" is explicitly a real scenario in this design
   (LOOM-31's own note about "opening one from a second device"), not
   because it's urgent.

## Explicitly not proposed here, and why

- **Client-triggered workspace creation.** Dynamic workspace provisioning
  is deliberately router-triggered (`core-design.md` §2/§3), not a
  user-facing action — adding a "create workspace" button would cut
  against that design, not extend it.
- **Task cancel/interrupt from the client.** The only human-intervention
  path today is SSH takeover, by design (`core-design.md` §4: "attaching
  is something a human does directly against the target, outside
  Loomux's client/server boundary entirely"). A "cancel" button implies a
  new server capability to kill a running tmux pane via API, which is a
  real safety/semantics question on its own (what does "cancel" mean for
  a native-interactive-mode agent mid-turn?) — worth its own design pass
  if it's wanted, not a checkbox item in this spec.
- **PWA install / push notifications for attention-needed tasks.**
  Phase 1 already named this and deferred it explicitly ("Offline
  support / PWA install"). Given this phase's own "attention-first"
  theme, it's the natural next escalation after the in-app attention
  list above — but service worker + manifest + (likely) a server-side
  push-subscription endpoint is real scope on its own, not a page tweak.
  Recommend it as a separate future design spec once the in-app
  attention view above has shipped and proven the underlying signal is
  the right one to notify on.
- **Multi-user support.** Out of scope server-wide (`core-design.md`
  §9); nothing here assumes or works toward it.

## Testing strategy (unchanged in kind, grown in coverage)

Same approach as Phase 1 — Vitest + React Testing Library, API client
against a mocked `fetch`, no E2E tooling yet (still YAGNI at this scale,
per Phase 1's own reasoning) — extended to cover the new page behavior:
attention-ordering/filtering logic in the conversations list, the
task-history panel's per-task attach-info affordance, and markdown
rendering (at least: that it renders code blocks distinctly from prose,
not full visual regression testing).

## Deferred (separate future work)

- PWA install / push notifications (see above — recommend its own spec).
- Session/device management UI (blocked on the server-side change above;
  low urgency).
- Task cancel/interrupt (needs its own design pass if ever pursued).
- Android/iOS clients, SSO/OAuth, GitHub-provisioning UI, multi-user —
  all carried over unchanged from Phase 1's own deferred list.
