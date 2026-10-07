# Loomux web client redesign: principles

Phase 1 of the full rewrite (2026-10-07). Read with
[`../ui-inventory.md`](../ui-inventory.md), which is the factual brief. This
document says what the product is for, what the new client must get right,
what is wrong with today's information architecture, and the three visual
directions offered for the user to pick from. The mockups live next to it
(`direction-a-shuttle.html`, `direction-b-patchbay.html`,
`direction-c-weave.html`).

## What Loomux is

Loomux lets one person run a fleet of coding agents (Claude Code, Codex,
plain shell) on their own machines by chatting with a router. You write
"in a new workspace on atlas, have claude-code add rate limiting to
ledger-api"; the router picks a machine (a **target**), creates or reuses a
directory there (a **workspace**), starts the agent in a tmux pane, and
relays the agent's answer back into the chat. Each turn of that chat is a
**dispatch**. When the router wants to do something it won't do unasked
(run a command, install an agent, clone a repo you didn't name, start work
on a target that asks first) it makes an **offer** and waits for an
explicit yes. When an agent stops at a prompt in its terminal (a permission
question, a folder-trust dialog, a multiple-choice question) the task
**needs you**. Secrets the agents need live in a write-only **vault**.

It is a single-user tool. The user is technical, runs it from a desktop
browser at a desk and from an installed Android PWA away from it, and is
pulled back in by ntfy notifications that deep-link to a conversation.

## The jobs, in order of how often they happen

1. **Answer what needs me.** An offer to approve, an agent prompt to
   answer, a failed turn to retry. Often from a phone, often straight from a
   notification, often with one thumb. This is the job the whole client is
   ranked around.
2. **Dispatch.** Start a conversation or follow one up. Write a message,
   send it, keep drafting while the turn runs.
3. **Watch live work.** Which stage a turn is at, how long it has run,
   what the agent's pane shows, how to attach to it from a terminal.
4. **Look back.** What happened in a conversation: replies, commands and
   their exit codes, offers and how they were answered, failures.
5. **Manage the fleet.** Register targets, set their policy (purpose,
   relay, what may run unasked), scan and pin host keys, test reachability,
   see health; archive or delete workspaces.
6. **Manage secrets.** Add, replace or delete vault credentials, scoped to
   a workspace or an agent type. Values are never shown.

Jobs 1-3 happen every day on both devices. Jobs 5-6 are setup, mostly at a
desk, but must still work on a phone.

## What is wrong with today's IA

- **Five equal top-level sections** (Dashboard, Workspaces, Conversations,
  Targets, Credentials) in one non-wrapping bar. Daily work and once-a-month
  setup weigh the same; on a 360 px phone the bar overflows.
- **"Needs you" is a section of one page, not the spine of the app.** No
  count anywhere in the shell, no aging (week-old `awaiting_input` items
  stay forever), rows show raw UUIDs instead of what was asked.
- **Workspaces and targets are split** although a workspace only means
  something on its target. Target health, scan/pin and test exist on the
  server but nowhere in the UI.
- **The conversation screen hides the work.** Only the latest task gets an
  attach command; earlier tasks, pane scrollback and the audit trail are
  unreachable; the progress card shows a stage word and a timer only.
- **Two different "answer me" patterns.** Offers sit inline in the
  transcript with an outlined Deny; agent prompts dock above the composer
  with a red Deny. `awaiting_input` and `human_takeover` get no card at all.
- **The phone is an afterthought.** No breakpoints, 24 px touch targets, a
  one-row composer where Enter sends (no newline on a soft keyboard), the
  keyboard pops after every turn, the composer is locked for the whole turn.
- **Raw vocabulary and raw errors.** `awaiting-input`, `human-takeover`,
  `active`, "Failed to fetch" are shown as they come.
- **Login lands on Workspaces**, the least useful screen.

## Principles for the new client

1. **One queue rules the app.** "Needs you" is the home screen on both
   devices and a count in the shell everywhere else. Items carry what was
   asked, not ids. Items older than a day fold into "Older, still waiting"
   and can be snoozed (a client-side choice; the server status is untouched).
2. **One answer pattern.** Offers, agent prompts, `awaiting_input`,
   `human_takeover` and failed turns share one "decision" component with
   the same anatomy: who is asking, where (target, workspace, agent), the
   exact thing that will happen (command in full, never truncated), and the
   answers. Deny always looks the same. Approve is never the default focus,
   never a swipe, never triggered by Enter: an explicit tap or click only.
   Offers show their expiry and become inert the moment `expires_at` passes.
3. **Machines own workspaces.** Targets and their workspaces are one
   section ("Machines"). A target shows health, policy in plain words, relay
   (what the router models may see), pinned host keys and its workspaces.
4. **Setup is out of the way.** Daily nav: Inbox, Conversations, Machines.
   Vault and Settings (devices/sessions, web client version, theme) sit one
   step down. On phones: a bottom bar of three plus a "More" sheet.
5. **Show the work.** A running turn shows its stages as a short timeline,
   elapsed time, Cancel, the attach command (the server's
   `attach_command`, with a working copy fallback) and the agent's pane.
   Every task in the conversation is listed, each with its own attach and
   transcript.
6. **Phone is a first-class layout, not a squeezed desktop.** 44 px
   targets, safe-area insets, a growing composer whose Enter key inserts a
   newline on touch devices (Send is a button; Ctrl/Cmd+Enter on desktop),
   no autofocus after a turn, drafting allowed while a turn runs (the send
   is held until the turn ends, and says so).
7. **Plain words.** Statuses get human labels and a shape as well as a
   colour. Errors say what happened and what to do; the server's text sits
   behind a "Details" disclosure.
8. **Write-only means write-only.** Credential values are typed into
   password fields, never echoed, never in URLs, never in the DOM after save.

### Status vocabulary

| Server value | Shown as | Group |
|---|---|---|
| pending offer (`confirmations[].status: pending`) | Wants approval | Needs you |
| `needs_attention` (with `attention`) | Asking you | Needs you |
| `awaiting_input` | Waiting for your reply | Needs you |
| `human_takeover` | You're driving | Needs you (low) |
| failed dispatch, not yet retried | Failed | Needs you (low) |
| `running` | Working | Running |
| `completed` | Done | Done |
| `failed` (task) | Failed | Done |
| workspace `idle` / `active` / `provisioning` / `archived` / `failed` | Idle / Agent attached / Setting up / Archived / Broken | |
| relay `full` / `last_message` / `none` | Everything / Final answer only / Nothing | |

### Contract notes (post-freeze `/api/v1`)

- Statuses are snake_case (`needs_attention`, `awaiting_input`,
  `human_takeover`); errors carry a machine `code` beside `error`;
  `confirmations[].workspace_name`; `ssh_key_ref` and `is_dynamic` are
  gone, so the target form loses the key field and the dashboard badge.
- Targets: `relay` + `relay_effective`, `ssh_port`, `pinned_host_keys`,
  `health {status, reachable, latency_ms, tmux_version, disk_free_bytes,
  last_probed_at, error}`; onboarding via `POST /targets/{id}/scan-host-key`
  (returns keys + `expires_at`, trusts nothing), `POST /targets/{id}/pin
  {fingerprint}` (must be from a scan under 10 minutes old, else 409),
  `DELETE /targets/{id}/pin`, `POST /targets/{id}/test`, `POST
  /targets/{id}/probe`.
- Sessions: `GET /sessions`, `DELETE /sessions/{id}` power a Devices list.
- **Live pane output is the one gap.** `GET /tasks/{id}/transcript`
  returns each turn's pane scrollback *as captured at the turn's end*;
  nothing serves the pane mid-turn. The mockups show a live tail because
  the user asked for one, and mark it. Two ways to get it: (a) an additive
  post-1.0 endpoint (e.g. `GET /tasks/{id}/pane`, redacted like
  transcripts, polled while a turn runs), or (b) ship without it and show
  the last turn's capture with its time. Choosing the direction does not
  choose this; it is a separate server question.

## Shared fake data

All three mockups use the same invented fleet so they can be compared.
Hostnames use `.example` / `.test`; fingerprints and keys are made up.

- Targets: **atlas** (remote, `dev@atlas.lab.example`, port 22, personal,
  relay default → Everything, pinned ED25519, healthy 38 ms, tmux 3.5a,
  212 GB free); **kestrel** (remote, `ci@kestrel.corp.example`, port 2222,
  work, relay default → Nothing, asks before new work, shell off, only
  claude-code, **host key not pinned yet**); **this host** (local, healthy).
- Workspaces: ledger-api (atlas, Agent attached), infra-terraform
  (kestrel, Idle), blog-rewrite (this host, Idle), ml-notebook (atlas,
  Archived), payments-sandbox (kestrel, Broken: "workspace root is not
  writable").
- Conversations: "Add rate limiting to the ledger-api /transfers endpoint"
  (ledger-api, claude-code asking to edit `src/middleware/ratelimit.ts`);
  "Restart the staging ledger deploy" (infra-terraform, offer: `kubectl -n
  staging rollout restart deploy/ledger-api` on kestrel, expires in 4 min);
  "Draft the October changelog post" (blog-rewrite, Working 3m 12s);
  "Why is the nightly backup job slow?" (Done, answered directly);
  "Bump terraform providers" (Failed: agent hit its usage limit, resets
  5pm); "Clean up old notebook outputs" (awaiting reply, 2 days old → Older).
- Credentials: GITHUB_TOKEN (everywhere), ANTHROPIC_API_KEY (agent
  claude-code), NPM_TOKEN (workspace blog-rewrite), KUBECONFIG_STAGING
  (workspace infra-terraform, agent claude-code).
- Devices: this browser (Linux, now), Pixel 9 PWA (12 min ago), an old
  laptop (19 days ago).

## The three directions

Each mockup is one self-contained clickable page with a toolbar to switch
screen, frame (phone, desktop, both) and theme (light, dark).

### A. Shuttle: a messenger for your agents

Loomux behaves like a messaging app. Home is the inbox: everything that
needs you as answerable cards with large, explicit buttons and reply chips,
then running work, then the rest. Each agent and the router speak as named
participants with their own glyph; offers and prompts are structured
messages in the thread, answered in place. Phone-native first; on desktop
it opens into three columns (queue, thread, context panel with tasks, pane
and attach). Calm, high-legibility, soft geometry, one typeface family
designed for legibility (Atkinson Hyperlegible Next, with its mono for
panes and commands), cool porcelain and night-blue grounds, kingfisher
accent, marigold for "needs you".

### B. Patchbay: the console that tmux deserves

Loomux looks like the thing it drives. Home is a wall of pane tiles grouped
by machine, each showing its agent's tail, status lamp and elapsed time;
whatever needs you lights its tile and the lamp strip at the top. The
conversation is a command line docked under the selected pane. A tmux-style
status line runs along the bottom on desktop. On phones: the lamp strip,
then a stack of tiles; tapping one opens the pane full-screen with the
composer under it. Instrument-panel look: aluminium greys with dark pane
glass in light mode, slate in dark, signal lamps, IBM Plex Sans Condensed
for the UI and IBM Plex Mono for pane content.

### C. Weave: the loom in Loomux

The product's name made literal. Machines are the warp, conversations the
weft, every turn, offer and prompt a stitch. Home on desktop is today's
weave: one lane per workspace across a time axis, needs-you shown as
madder-red knots. On phones the same day reads as a vertical timeline. The
conversation reads like a document: assistant prose in a book serif, the
stitches of the turn (routing, provisioning, offer, agent turn) in the
margin. Indigo, woad, madder and weld on cool undyed cotton, with an
indigo-night dark mode; Familjen Grotesk for the UI, Newsreader for prose.
