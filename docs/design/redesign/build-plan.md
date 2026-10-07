# Loomux web client rewrite: build plan

Phase 2 of the redesign (2026-10-08). The user picked **Shuttle** (direction
A) as the base and added **Weave's** time graph and read-back affordances
(direction C). The merged mockup is `merged-shuttle-weave.html`; the
principles, vocabulary and IA are in [`principles.md`](principles.md).
Nothing here is built until the user confirms the merged mockup.

## 1. Stack

**Keep the current stack and rewrite inside it:** React 19, TypeScript,
Vite, TanStack Query, React Router 7, Vitest + Testing Library, Playwright,
oxlint. Add three libraries:

| Add | For | Why this one |
|---|---|---|
| `react-aria-components` | dialogs, the More sheet, menus, segmented controls (relay, filters), disclosures, toasts, tooltips on weave stitches | Accessible, touch-aware primitives without a visual style of their own, so the tokens below stay the only look. Handles focus, `aria-pressed`, Escape, and press-vs-scroll on phones, all of which today's client gets wrong. |
| `d3-scale` + `d3-time` (≈15 kB) | the weave's time axis and ticks | The weave is hand-drawn SVG; only the scale maths comes from d3. No d3 DOM code. |
| `@fontsource/atkinson-hyperlegible-next`, `…-mono` | fonts | Self-hosted in the bundle: the PWA must not depend on Google Fonts at runtime. |

Keep `react-markdown`, `remark-gfm`, `rehype-highlight` (and the C/C++
exclusion), `@microsoft/fetch-event-source`.

Why not change more:

- **The constraints favour staying.** The API boundary (`src/lib/api.ts`
  and its `apiBoundary.test.ts`), the 401 handling, the SSE client, the
  offer and retry rules and their unit tests are correct and
  contract-checked. A new framework would mean rewriting the riskiest code
  for no user-visible gain.
- **Nothing needs a server runtime.** The bundle is a static SPA, baked
  into the server image and swapped by the in-app updater (`/web/*`).
  Next/Remix/SvelteKit bring server rendering and a different build output
  that the release pipeline (`docs/release.md`) would have to learn.
- **Svelte or Solid** would be smaller and faster, but the client is small
  either way. The cost is a second ecosystem for a single-maintainer
  project, and losing Testing Library and React Query parity.

**Styling: Tailwind v4 stays, driven by tokens.** Tokens are CSS custom
properties declared once in `src/styles/tokens.css` and exposed to Tailwind
through `@theme`, so utilities read `bg-surface text-ink border-line`, never
raw palette names. Components live in `src/ui/`; screens compose them and
contain no colour literals. A lint rule (an `oxlint` restriction or a small
grep test like `apiBoundary.test.ts`) fails on hex literals and
`neutral-*`/`amber-*` classes outside `tokens.css`.

## 2. Design tokens

From the merged mockup. Light values first; dark redefines the same names.
Theme is System / Light / Dark (Settings), stored in
`localStorage["loomux.theme"]`, applied as `data-theme` on `<html>`.
`<meta name="theme-color">` gets one value per scheme.

| Group | Tokens |
|---|---|
| Ground and surfaces | `--ground`, `--surface`, `--surface-2`, `--sunken`, `--line` |
| Ink | `--ink`, `--ink-2`, `--ink-3` |
| Accent (kingfisher) | `--accent`, `--accent-hover`, `--accent-ink`, `--accent-soft` |
| Needs you (marigold) | `--mari`, `--mari-2`, `--mari-soft`, `--mari-ink`, `--mari-on` |
| Outcomes | `--bad`, `--bad-soft`, `--good`, `--good-soft` |
| Pane / code | `--pane`, `--pane-ink`, `--pane-dim`, `--pane-hi` |
| Weave | `--thread-working` (accent), `--thread-idle` (`--ink-3` at 40%), `--knot` (mari), `--stitch-done` (`--good`), `--stitch-failed` (`--bad`), `--now` |
| Focus, scrim, elevation | `--focus`, `--scrim`, `--shadow-1`, `--shadow-2` |
| Type | `--f-ui` Atkinson Hyperlegible Next; `--f-mono` Atkinson Hyperlegible Mono. Scale (rem): 0.8125, 0.9375, 1, 1.125, 1.375, 1.75, 2.25 |
| Space | 4-pt steps: `--s-1` 4px … `--s-8` 48px |
| Radius | `--r-control` 10px, `--r-card` 14px, `--r-sheet` 20px; pills full |
| Touch | `--hit` 44px minimum on coarse pointers |

**Status is never colour alone.** Each status has a token pair and a
shape: needs you is a marigold diamond with a hatched band, working is a
filled kingfisher dot, failed is a red ✕, done is a green check, idle is
a hollow ring.

## 3. Component system (`src/ui/`)

Primitives, built on react-aria-components where noted:

- `Button` (primary, secondary, quiet, danger; sizes; a `pendingLabel`
  prop so every in-flight state says what it is doing).
- `IconButton`; `Field`, `TextField`, `PasswordField` (never echoes;
  clears its value on success); `Select`.
- `Segmented` (relay, filters; `aria-pressed`); `Switch` (policy).
- `Sheet` (phone More, filters); `Dialog`; `Disclosure` (Details, Turn
  steps); `Toast`; `Tooltip`.
- `StatusMark` (shape + label from the vocabulary); `Time` (relative with
  the absolute in a tooltip, one formatter app-wide).
- `CodeBlock` (copy button, horizontal scroll); `CopyText` (clipboard,
  falling back to select-all when the Clipboard API is missing, e.g. on
  plain HTTP).
- `EmptyState`, `ErrorState` (plain message, server text behind Details,
  retry), `Skeleton`.

Domain components:

- `DecisionCard`: the one answer pattern, with kinds `offer`, `prompt`,
  `awaiting`, `takeover` and `failed`. It shows who is asking, where, the
  exact action and the answers. Approve is never default focus and Enter
  never submits it. An offer counts down to `expires_at`, then goes inert.
  It is used in the Inbox, inline in the thread, and in the Day strip
  popover.
- `TurnCard`: queued, deciding, working, waiting on you or relaying. It
  shows the stage timeline, elapsed time, Cancel and `AttachCommand`.
- `AttachCommand`: shows the server's `attach_command` (it carries
  `tmux -L loomux`), with copy. It never assembles the command itself.
- `PanePanel`: the last-turn capture now, and the live tail once the API
  has it (see section 7).
- `Composer`: auto-growing. On coarse pointers Enter inserts a newline and
  Send is a button; on fine pointers Ctrl/Cmd+Enter sends. It has a
  visible label and `enterKeyHint`. It keeps the draft per conversation in
  `sessionStorage`. While a turn runs it holds a draft until the turn ends,
  and it never autofocuses after a turn.
- `Weave` (desktop), `DayStrip` (Inbox), `DayTimeline` (phone Today), and
  `TurnRail` (the conversation margin; inline step markers on phone).
- `MachineCard`, `HealthReadout`, `RelayControl`, `HostKeyFlow` (scan,
  compare, pin, unpin), `PolicyEditor`, `WorkspaceRow`.
- `CredentialRow`, `CredentialForm`.
- `AppShell`: desktop sidebar; phone bottom bar (Inbox, Today, Machines,
  More), with the needs-you count in both. It also carries the version
  and offline banners.

## 4. Route map

| Path | Screen | Notes |
|---|---|---|
| `/login` | Login | Public. After login, returns to `state.from` (path and query), else `/`. A 401 lands here with "You were signed out. Sign in to continue." |
| `/` | Inbox (home) | The decision queue, Day strip, and working and recent turns. On desktop, the queue and the selected item are shown side by side. |
| `/inbox/:itemId` | Inbox with an item selected | Desktop: opens in the thread column. Phone: goes to the conversation. |
| `/today` | Today | Shows the weave for today plus All conversations. |
| `/today/:date` | Today for another day | `YYYY-MM-DD`. Filters for the list go in `?q=&status=`. |
| `/conversations` | redirect | Goes to `/today#all`, keeping `?status=`. |
| `/conversations/:id` | Conversation | **Unchanged: ntfy deep links.** `?turn=<dispatch_id>` scrolls to that turn (used by weave stitches). |
| `/machines` | Machines | Lists targets with their workspaces. |
| `/machines/new` | Register machine | |
| `/machines/:targetId` | Machine detail | Health, policy, relay, host key, workspaces. |
| `/targets`, `/targets/:id`, `/workspaces` | redirects | Go to `/machines…`, keeping the query. |
| `/vault` | Vault | |
| `/credentials` | redirect | Goes to `/vault`. |
| `/settings` | Settings | Theme, devices (`/sessions`), web client version and update, server version. |
| `*` | Not found | Has a link home. |

Every screen sets `document.title` (e.g. "Inbox (3) · Loomux").

## 5. e2e names: kept, and the few that change

Kept as-is (the new UI uses the same accessible names):

- **Login:** "Password", "Log in", /invalid password/.
- **Shell:** "Log out" (sidebar on desktop, the More sheet on phone; the
  specs run at desktop width).
- **Inbox:** "New conversation".
- **Conversation:** "Message the agent fleet…" as the placeholder and also
  the label; "Send", "Sending…", "Working…"; "workspace: <name>"; reply
  text; "exit N".
- **Offers:** region "Confirmation", "Approve", "Deny", "Approved",
  "Denied".
- **Workspaces:** "Archive", "Reopen", "Delete", /files on the machine are
  kept/, "Yes, delete"; the status words "archived" and "idle" stay in the
  row as the `StatusMark` label. Lowercase is kept by matching
  case-insensitively in the spec, because the UI shows "Archived" and
  "Idle".
- **Credentials:** "Add credential" (button and form), /Name/, "Value",
  "Save", "Replace value", "New value", "Delete", "Delete <NAME>".

How the Composer keeps "Working…": while a turn runs, an empty draft
shows a disabled **Working…**. Once the user types, the button reads
**Send when done**. The spec only sees the empty case.

Changed, each with its reason (the specs are updated in the same PR as the
screen):

| Spec | Old | New | Reason |
|---|---|---|---|
| auth | `goto("/targets?probe=1")` and expect that URL after login | `goto("/machines?probe=1")`, same assertion; plus a test that `/targets?probe=1` redirects with the query | Targets and Workspaces merge into Machines (principle 3). The old path keeps working as a redirect. |
| workspaces | link "Workspaces" | link **"Machines"**, then the "local" machine's group | Same merge. |
| workspaces | `row.getByText("target: local")` | the row sits inside `region` "local" (the machine card) | A nested row doesn't repeat its machine; the region says it. |
| workspaces | `getByText("archived")` / `"idle"` | the same text, case-insensitive | The vocabulary shows sentence case. |
| credentials | link "Credentials" | link **"Vault"** (desktop sidebar) | Setup moves one step down under a shorter name. A visually hidden "Credentials" in the link text was considered and rejected, because it would read twice to screen readers. |

New specs added along the way: Inbox shows a pending offer and approving
it from the Inbox works; an expired offer is inert; `/conversations/:id`
deep link survives a re-login; Today lists a conversation and its stitch
opens the right turn; host-key scan → pin (against the e2e server, if it
runs with `WithHostKeyPinning`; otherwise a mocked-API component test).

## 6. Phased PR plan

Each PR leaves `main` shippable (every merge publishes a `web-<sha>`
release). Old screens keep working inside the new shell until their
replacement lands, so nothing is half-migrated in production.

1. **Foundation.** Tokens, fonts, Tailwind `@theme`, the colour-literal
   lint, the `src/ui` primitives with Vitest, `AppShell` (sidebar, bottom
   bar, More sheet, count badge), the theme setting, `viewport-fit=cover`
   and safe areas, per-scheme `theme-color`, the full route map with
   redirects and 404, `document.title`. The old pages render inside the
   new shell. e2e: the nav link changes from section 5.
2. **Data layer.** Extend `api.ts` with sessions, transcript, events,
   scan-host-key, pin, unpin, test, probe and deep health. Add a
   status-vocabulary module, plus a needs-you model that derives decision
   items from conversations and their offers, prompts and failures, with
   aging and client-side snooze. Query keys and stale times (lists poll
   every 15 s while the window is visible; the conversation stays
   SSE-driven). Unit tests only; no UI change.
3. **Decision card + Inbox.** `DecisionCard` and the Inbox (home), with
   the Day strip as a static placeholder. Login lands on `/`. e2e: the
   Dashboard heading changes to Inbox, and the new Inbox offer spec is
   added.
4. **Conversation.** Thread, inline decisions, `TurnCard`,
   `AttachCommand` (the server's command), `PanePanel` (last capture), the
   Composer rules, the desktop context panel listing every task with
   attach and transcript, loading and error states, and scrolling that
   doesn't yank the reader. e2e: chat and offers unchanged.
5. **Today.** `Weave`, `DayTimeline`, All conversations (search, filters
   in the URL, `#all`), the `TurnRail` in the conversation, and the live
   Day strip on the Inbox. Data: `/conversations` for the day window,
   then `/conversations/{id}/events` for each one, at most 6 concurrent
   requests and cached. See section 8.
6. **Machines.** Merged list, detail, `HealthReadout` with Test and Probe,
   `HostKeyFlow`, `RelayControl`, `PolicyEditor`, register and edit (no
   SSH key field; `PATCH` if the server has it, else the full `PUT`).
   Workspace rows with Archive, Reopen and Delete, and the delete notice
   kept at the machine level so the refetch doesn't eat it. e2e: the
   workspaces spec updates.
7. **Vault + Settings.** Credentials, devices (list and revoke), the web
   client update and rollback panel. e2e: the credentials spec updates.
8. **PWA and clean-up.** Manifest shortcuts (Inbox, New conversation),
   per-scheme icons and colours, an offline banner (`navigator.onLine`
   plus failed-fetch detection), no autofocus on phones, a
   secure-context fallback for `crypto.randomUUID`. Delete the old routes
   and components. Run an accessibility pass (axe in Playwright on every
   screen).

PRs 3, 4 and 6 are the big ones; 5 can run in parallel with 6 and 7 once
4 is in.

## 7. Live pane output until the API has it

The API today records each turn's pane once, at the turn's end
(`GET /tasks/{id}/transcript`, `turns[].pane`); nothing serves it
mid-turn.

- **Ship without it.** `PanePanel` shows the latest turn's capture
  (`transcript?limit=1`) titled "Terminal at the end of the last turn,
  14:02". While a turn runs, the panel keeps that capture dimmed, under
  the stage timeline and "Live output isn't available from this server;
  attach to watch it live", with the attach command right there. Nothing
  in the UI claims to be live when it isn't.
- **Light up when the server has it.** Ask the server for an additive
  post-1.0 endpoint, for example `GET /tasks/{id}/pane?since=<cursor>`.
  It would be redacted like transcripts, return the last N lines plus a
  cursor, `204` when unchanged, and `404` or `501` when unsupported. The
  client probes it once per task: on `200` it polls every 1.5 s while the
  turn runs and the tab is visible; on `404` or `501` it falls back as
  above. No feature flag and no version sniffing. A `pane` event on the
  existing SSE stream would be the better long-term shape, and the client
  can accept either.
- Relay policy doesn't limit this. The pane goes to the user's own
  browser, not to the router models.

## 8. Weave data and its limits

- A day's weave is built from `GET /conversations` (filtered client-side
  to `updated_at` in or after the day), then `GET
  /conversations/{id}/events` for each one. Events give `kind`
  (`decision`, `command`, `provision`, `offer`, `offer_answered`,
  `agent_turn`, `relay`, `outcome`), `workspace_id`, `target_id`,
  `created_at`, `duration_ms` and `error_class`, which is enough for lanes
  and stitches. Pending needs-you knots come from the needs-you model.
- **Retention:** events older than `LOOMUX_EVENT_RETENTION` are gone. A
  day past retention falls back to the coarser stitches in `GET
  /conversations/{id}` (messages, dispatches, confirmations, task times)
  and says so ("Turn details older than N days aren't kept").
- **Cost:** one request per conversation in the day. That is fine at
  single-user volume (tens a day). Past about 60 conversations the weave
  draws the first 60 by recency and says how many it left out. An
  additive cross-conversation `GET /events?since=&until=` would make it
  one call; it goes on the same post-1.0 server wish list as the pane
  endpoint.
- `/conversations` is unpaged today; if the freeze adds `has_more`, the
  Today list pages with it.
