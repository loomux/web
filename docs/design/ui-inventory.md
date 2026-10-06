# Loomux web client — UX inventory and design brief

Snapshot of `loomux/web` at `dbf441e` (main, after web#62 e2e suite, web#63
lint hygiene, web#64 single typed API client). Server routes are from
`loomux/server` `api/server.go:341-373`. All `path:line` references are to
the web repo unless prefixed `server:`.

## 1. Purpose and how to use this document

This is a factual inventory of what the Loomux web client does today, written
for the designer who will redesign it. It lists every screen, every action,
every API call and every state the code handles (or does not), plus the
end-to-end flows, the API contract the redesign must stay within, the e2e
accessible names that must be kept or deliberately updated, and the rough
edges seen in testing. Read sections 2-5 to understand the product, section 8
for what is wrong today, and section 9 before changing anything that touches
auth, offers, credentials or the e2e names. Nothing here was guessed; where
the code has no handling for a state it says "not handled".

---

## 2. Global shell

### 2.1 Structure

- Entry: `src/main.tsx` wraps `<App/>` in `QueryClientProvider` (a default
  `new QueryClient()` with no options, `src/main.tsx:10`), `AuthProvider`,
  `BrowserRouter`; then calls `registerServiceWorker()` (`src/main.tsx:24`).
- `src/App.tsx:53-73`: everything sits in `RouteErrorBoundary` and a
  `Suspense` whose fallback is a plain "Loading…" paragraph
  (`src/App.tsx:49-51`). Every route is lazy-loaded (`src/App.tsx:11-23`).
- Routes (`src/App.tsx:57-68`):

| Path | Screen | Auth |
|---|---|---|
| `/login` | LoginPage | public |
| `/` | DashboardPage | protected |
| `/workspaces` | WorkspacesPage | protected |
| `/conversations` | ConversationsPage | protected |
| `/conversations/:id` | ConversationDetailPage | protected |
| `/targets` | TargetsPage | protected |
| `/credentials` | CredentialsPage | protected |

There is no 404 route: an unknown path renders nothing inside the shell
(not handled).

### 2.2 Navigation bar (`src/App.tsx:25-47`)

- One top bar, `flex justify-between`, `px-4 py-2`, bottom border.
- Left: five plain `<Link>`s, `text-sm`, `gap-4`: **Dashboard** (`/`),
  **Workspaces**, **Conversations**, **Targets**, **Credentials**.
  They are `Link`, not `NavLink`: no active/current-page styling and no
  `aria-current` (`src/App.tsx:32-36`).
- Right: **Log out** button, `text-sm text-neutral-500 hover:underline`
  (`src/App.tsx:38-40`). No confirmation.
- No app name/logo in the bar, no responsive/collapsed variant, no wrap: on a
  360 px phone the five links plus Log out are on one non-wrapping row.

### 2.3 Version banner (`src/components/VersionBanner.tsx`)

- Rendered above the nav on every protected screen (not on Login).
- Calls `GET /api/v1/version` unauthenticated via `api.getVersion`
  (`VersionBanner.tsx:12-16`, `retry: false`).
- Expected API version is the constant `"v1"` (`VersionBanner.tsx:9`).
- States: request failed → amber full-width bar "Could not reach the Loomux
  server to check API compatibility." (`:18-24`); version mismatch → amber bar
  naming both versions (`:26-34`); otherwise nothing. Not dismissible. Because
  of React Query's default refetch-on-window-focus it can appear/disappear as
  the tab regains focus.

### 2.4 Auth flow

- Token storage: `localStorage["loomux.token"]` (`src/lib/auth.tsx:15`),
  read once at startup (`auth.tsx:28-30`).
- Guard: `ProtectedRoute` redirects to `/login` with
  `state.from = location.pathname` when there is no token
  (`src/components/ProtectedRoute.tsx:8-10`).
- Login (`src/routes/LoginPage.tsx`): `POST /api/v1/login {password}` →
  `{token}`; stored, then **always** `navigate("/workspaces")`
  (`LoginPage.tsx:25`). The `state.from` saved by the guard is only honoured
  when the login page is opened while already holding a token
  (`LoginPage.tsx:14-17`, fallback also `/workspaces`). So after a fresh login
  the user lands on Workspaces, not the Dashboard and not the page they were
  sent from (including a conversation link from a notification).
- 401 handling: every authenticated call goes through
  `useApiClient().guarded` (`src/lib/useApiClient.ts:13-26`); a 401 clears the
  token (`auth.tsx:49-52`) and the guard redirects to `/login`. The SSE stream
  does the same via `onUnauthorized` (`src/lib/api.ts:437-441`). No message
  tells the user why they were logged out.
- Logout (`auth.tsx:38-47`): clears the token locally at once, then
  best-effort `POST /api/v1/logout`; failures ignored. Guard redirects to
  `/login`.

### 2.5 Theming

- Dark mode follows the OS only: `:root { color-scheme: light dark }`
  (`src/index.css:3-5`) and Tailwind `dark:` variants (media-query based,
  Tailwind v4 default) throughout. No in-app toggle.
- Palette: Tailwind neutral greys; status colours amber/red/orange/blue/green
  (`src/lib/conversations.ts:41-58`); primary buttons are near-black in light
  mode and near-white in dark mode.
- Code blocks: always a dark `pre` (`MessageContent.tsx:99-103`) with a
  hand-written highlight theme (`src/index.css:31-95`); inline code tinted per
  scheme (`index.css:18-29`).
- No design tokens, no shared component library: classes are inlined per
  file, with small per-file constants (`INPUT_CLASSES`,
  `PRIMARY_BUTTON_CLASSES`, `buttonClass`).

### 2.6 Layout widths

- Shell: full width, `min-h-svh flex flex-col` (`src/App.tsx:28`).
- Pages: `p-4`, full width, **no max-width**, except Credentials
  (`mx-auto max-w-3xl`, `CredentialsPage.tsx:103`) and the Login card
  (`max-w-sm`, `LoginPage.tsx:37`).
- Conversation page: fixed height `h-[calc(100svh-3rem)]`
  (`ConversationDetailPage.tsx:273`), assuming the nav is 3 rem tall; the
  version banner, when shown, pushes the composer below the fold.
- Chat bubbles and cards: `max-w-[75%]`.
- No Tailwind breakpoint classes (`sm:`/`md:`/`lg:`) are used anywhere in
  `src/`.

### 2.7 Global error boundary (`src/components/RouteErrorBoundary.tsx`)

- Any render error: centred "Something went wrong loading this page." with a
  **Reload** button (`:56-71`).
- Chunk-load errors (a tab left open across a deploy) auto-reload once,
  guarded by `sessionStorage["loomux.chunkReloadAt"]` for 10 s (`:18-54`).

---

## 3. Screens

Notes that apply to every screen below:

- Lists come from React Query with library defaults: data refetches when the
  screen mounts and when the browser window regains focus; failed queries
  retry 3 times with backoff before an error shows (so "loading" can last
  several seconds on a dead server). Only the conversation page polls, and
  only the conversation page has a live stream.
- No screen sets `document.title`; every tab is titled "Loomux"
  (`index.html:10`).
- Offline / network loss is not handled anywhere specifically: no
  `navigator.onLine` check, no offline banner. A failed fetch shows the
  screen's generic error text (usually the browser's raw "Failed to fetch").

### 3.1 Login — `/login` (`src/routes/LoginPage.tsx`)

- **Purpose:** exchange the single shared password for a bearer token.
- **Shows:** centred bordered card: heading "Loomux", label **Password**
  (password input, autofocused), error line, full-width button **Log in**.
- **Actions:** type password; submit (button or Enter). Button is disabled
  while the field is empty or while submitting.
- **API:** `POST /api/v1/login` (`api.login`, `src/lib/api.ts:295`) via
  `useAuth().login`.
- **States:**
  - Loading/in-flight: button text "Logging in…" (`:58`).
  - Error: red line with the server's error text verbatim, e.g. "invalid
    password" (`:27`, `:52`); non-API errors show "Login failed".
  - Already logged in: redirects immediately (`:14-17`).
  - Success: navigates to `/workspaces` (`:25`).
  - Empty / offline / needs-attention: n/a / not handled.
- No "show password", no rate-limit messaging, no version banner here.

### 3.2 Dashboard — `/` (`src/routes/DashboardPage.tsx`)

- **Purpose:** the landing view: what needs you, how the fleet looks, and the
  "new conversation" entry point. (Note: login does not land here; see 2.4.)
- **Shows:**
  1. Heading **Dashboard** and a primary button **New conversation**
     (`:49-57`).
  2. Section "NEEDS ATTENTION" (`:59-92`): conversations whose status is
     `needs-attention`, `awaiting-input` or `human-takeover`
     (`matchesStatusFilter(…, "needs-you")`, `src/lib/conversations.ts:60-71`),
     sorted by `compareConversationSummaries` (urgency, then newest). Each row
     is a link: workspace name (or raw workspace id if unknown) over the raw
     **conversation id** (not the preview — `:81`), and a coloured status
     pill.
  3. Section "WORKSPACE HEALTH" (`:94-146`): a horizontally scrolling row of
     cards (`min-w-[16rem]`), one per workspace: name, status pill
     (uncoloured, bordered — `:113`), `rolling_summary` (2-line clamp), tags,
     "Last used: <locale date>" and a "dynamic" chip.
  4. "WEB CLIENT" panel — `WebClientUpdate` (see 4.5), `:148`.
- **Actions:** New conversation (navigates to
  `/conversations/<crypto.randomUUID()>`, `:52`); click an attention row
  (opens that conversation). Workspace cards are not clickable.
- **API:** `GET /api/v1/conversations` (`listConversations`), `GET
  /api/v1/workspaces` (`listWorkspaces`), plus WebClientUpdate's
  `GET /api/v1/web/version`.
- **Live updates:** none beyond React Query mount/focus refetch.
- **States:**
  - Loading: "Loading conversations…" / "Loading workspaces…" per section.
  - Empty: "No conversations need your attention right now." / "No
    workspaces registered."
  - Error: red raw error message per section (`:66`, `:101`).
  - Needs-you: this whole section *is* the needs-you state; there is no
    count badge in the nav or elsewhere.
  - Stale attention: not handled — an `awaiting-input` conversation stays
    listed forever (see 8).
  - Offline / in-flight: not handled.

### 3.3 Workspaces — `/workspaces` (`src/routes/WorkspacesPage.tsx`)

- **Purpose:** list every workspace (a directory on a target where agents
  run) and manage its lifecycle.
- **Shows:** heading **Workspaces**; a divided list, one `<li>` per
  workspace (`:29-38`): name, "target: <target name>" (falls back to the
  target id until targets load, `:16-18`, `:34`), status pill (uncoloured,
  `:88-90`), action buttons, and `status_reason` text when present (`:108`).
  Tags, description, summary, last used are **not** shown here (only on the
  Dashboard cards).
- **Actions per row** (`:76-78`, rules from LOOM-70):

| Button | Shown when status is | Call |
|---|---|---|
| **Reopen** | `failed`, `archived` | `PATCH /api/v1/workspaces/{id}` `{status:"idle"}` (`setWorkspaceStatus`) |
| **Archive** | `idle`, `failed` | `PATCH /api/v1/workspaces/{id}` `{status:"archived"}` |
| **Delete** | anything except `provisioning` | first click reveals a confirm row |
| **Yes, delete** / **Cancel** | after Delete | `DELETE /api/v1/workspaces/{id}` (`deleteWorkspace`) |

  Confirm text: "Delete <name> and its tasks? The conversation history stays,
  and its files on the machine are kept." (`:112`). An `active` workspace
  shows only Delete.
- **API:** `GET /api/v1/workspaces`, `GET /api/v1/targets` (for names), the
  PATCH/DELETE above. After a mutation the `["workspaces"]` query is
  invalidated (`:35`).
- **Live updates:** none. Status is read on arrival (and on window focus);
  no stream or polling.
- **States:**
  - Loading: whole page replaced by "Loading workspaces…" (`:20`).
  - Error (list): whole page replaced by raw red error (`:21`).
  - Empty: "No workspaces registered yet." (`:26-28`).
  - In-flight (mutation): all row buttons disabled (`busy`), no spinner or
    label change.
  - Mutation error: raw server text under the row (`:130`), e.g. a 409 reason.
  - Delete with leftover tmux sessions: neutral notice "Deleted. N tmux
    session(s) couldn't be stopped yet; they're cleaned up later." (`:66-69`,
    `:131`) — but the row disappears on refetch, so the notice is rarely seen.
  - Needs-attention / offline: not handled.
- Workspace statuses that exist server-side: `idle`, `active`,
  `provisioning`, `archived`, `failed` (server:`registry/registry.go:167-176`).
  The client has no labels or colours for them; the raw word is shown.
- There is no "create workspace" action by design: workspaces are provisioned
  by the router from chat (`docs/design/web-client-phase2-design.md`
  "Explicitly not proposed here").

### 3.4 Conversations list — `/conversations` (`src/routes/ConversationsPage.tsx`)

- **Purpose:** every conversation, attention first.
- **Shows:** heading **Conversations**, button **New conversation**
  (`:46-51`), filter chips **All / Needs you / Running / Done**
  (`:54-69`, from `FILTER_OPTIONS`, `src/lib/conversations.ts:5-10`), and a
  list of links: workspace name (or id) over the preview (first message,
  server-truncated) or the conversation id when there is no preview (`:84`),
  plus a coloured status pill.
- **Order:** needs-attention / awaiting-input / human-takeover first, then
  running, then completed/failed; newest first within a group
  (`conversations.ts:15-39`).
- **Status → colour** (`conversations.ts:41-58`): needs-attention amber,
  awaiting-input red, human-takeover orange, running blue, completed green,
  failed grey, other neutral. Labels are the raw status with dashes replaced
  by spaces (`formatStatusLabel`).
- **Filter rules:** Needs you = the three attention statuses; Running =
  `running`; Done = `completed` + `failed` (`conversations.ts:60-71`).
- **Actions:** New conversation (random UUID route), pick a filter (local
  state, not in the URL), open a conversation.
- **API:** `GET /api/v1/conversations`, `GET /api/v1/workspaces`.
- **Live updates:** none (mount/focus refetch only).
- **States:** loading "Loading…"; error raw red text; empty "No conversations
  yet — start one above." or "No conversations match this filter."
  (`:71-79`); no pagination, no search, no workspace filter. Chips have no
  `aria-pressed`.
- A conversation is not a stored object: it exists once its first message is
  dispatched. A "New conversation" that is never sent leaves nothing behind.

### 3.5 Conversation detail — `/conversations/:id` (`src/routes/ConversationDetailPage.tsx`)

The core screen. Layout top to bottom (`:272-387`): header strip, scrolling
transcript, error line, optional agent-attention card, composer.

**Header (`:274-296`)**
- "Conversation <raw UUID>" (`:276`), then "· workspace: **<name>**" for the
  latest task's workspace (name resolved from `/workspaces`, refetching the
  list once for an unknown id so a just-provisioned workspace gets its name,
  `:30-56`), then "· status: **<status>**" from the latest `task_update`
  stream event only, and a green "●" when the stream is connected (`:282-287`).
  Before any task event arrives, neither status nor the dot is shown.
- "Show attach command" (AttachInfo, 4.4) for the latest task when no turn is
  in flight and its status is running / needs-attention / awaiting-input /
  human-takeover (`:28`, `:290-294`).

**Transcript (`:297-349`)**
- Messages from `GET /conversations/{id}` plus an optimistic copy of the
  message being sent (`pendingUser`).
- User bubble: right-aligned, dark fill, plain text (no markdown). Assistant
  bubble: left, light grey, rendered markdown (MessageContent, 4.6). Each has
  a relative time ("just now", "5m ago", "3d ago"; `src/lib/time.ts`) with the
  absolute time as tooltip.
- Under an assistant message that made an offer: ConfirmationCard (4.2).
- Under a user message whose turn failed or was interrupted:
  DispatchErrorCard with Retry (4.1).
- At the end, while a turn is in flight: DispatchProgressCard (4.1).
- Auto-scrolls to the end whenever a message, card or in-flight state changes
  (`:258-262`), even if the user had scrolled up to read.

**Agent attention card** (`:353-360`) — AttentionCard (4.3), docked above the
composer when the latest needs-attention task carries a parsed prompt, hidden
while an answer is being sent.

**Composer** (`:362-386`)
- One-row `textarea` (`rows={1}`, `resize-none`, no auto-grow), placeholder
  **"Message the agent fleet…"**, no visible label or `aria-label`.
- Enter sends, Shift+Enter inserts a newline (`:366-371`).
- Button **Send**; label becomes **Sending…** while the POST is open and
  **Working…** while a turn is in flight (`:383`). Disabled when busy or the
  draft is blank. The textarea is also disabled while busy.
- Autofocus: focused on open and again whenever it stops being busy
  (`:154-156`).

**Actions and calls**

| Action | Call (lib function) | Notes |
|---|---|---|
| Send a message | `POST /api/v1/dispatch` (`dispatch`), headers `Prefer: respond-async`, `Idempotency-Key: <uuid>`; body `conversation_id`, `message`, `workspace_hint` (latest *agent* task's workspace, `:179`) | 202 → page follows the returned dispatch |
| Approve / Deny an offer | same, message `"yes"`/`"no"` plus `confirmation_id` | from ConfirmationCard |
| Answer an agent prompt | same, message `"approve"`, `"deny"`, an option number, or free text | from AttentionCard |
| Retry a failed turn | same, resending the failed message's text (`:335`) | new idempotency key; no `confirmation_id` |
| Cancel the turn | `POST /api/v1/dispatches/{id}/cancel` (`cancelDispatch`) | 202; turn later fails with class `cancelled` |
| Show attach command | `GET /api/v1/tasks/{id}/attach-info` (`getAttachInfo`) | on click |
| (load) | `GET /api/v1/conversations/{id}` (`getConversation`), `GET /api/v1/workspaces` | |
| (live) | `GET /api/v1/conversations/{id}/stream` SSE (`openConversationStream`, `src/lib/api.ts:432-468`) | |

**Live updates** (`src/lib/useConversationStream.ts`, `src/lib/api.ts:414-468`)
- SSE via `fetchEventSource` with the bearer header; events `task_update`,
  `dispatch_update`, `message_added` (typed `StreamEvent` union,
  `api.ts:414-417`). Reconnects with backoff on drop or server close; 401
  logs out.
- Reactions: `dispatch_update` for the active turn overrides its status
  (`:92-103`); a terminal status triggers a refetch and stops following
  (`:109-118`); reconnect triggers a refetch (`:122-124`); a `task_update`
  while in flight refetches (stage changes, `:126-131`); `message_added`
  refetches (late agent reports, `:133-137`).
- Fallback polling: every 3 s, only while a turn is in flight **and** the
  stream is down (`:79-82`).

**States**

| State | What the user sees |
|---|---|
| Loading | Not handled: "No messages yet — send one to get started." shows until data arrives (`:298-300`). |
| Empty (new conversation) | Same text; the 404 for an unknown conversation is expected and swallowed (`retry: false`, no error read). |
| Load error (500, network) | Not handled: indistinguishable from empty. |
| In-flight | Progress card (stage + timer + Cancel + attach), composer disabled, button "Working…". |
| Sending | Optimistic user bubble, button "Sending…". |
| Turn already running (409) | Draft restored, red line "A turn is still running in this conversation. Your message wasn't sent; send it once that one finishes." and the page follows that turn (`:191-205`). |
| Server restarting (503) | "Loomux is restarting. Your message wasn't sent; try again in a moment." (`:206-207`). |
| Other send error | Raw error text in red (`:209`). |
| Cancel error | 409 → "That turn had already finished, so there was nothing to cancel."; else "Couldn't cancel: <raw>" (`:219-234`). |
| Failed / interrupted turn | DispatchErrorCard under that user message, kept permanently in the transcript. |
| Needs-you: agent prompt | AttentionCard above the composer. |
| Needs-you: offer | ConfirmationCard under the reply, amber while pending. |
| Needs-you: `awaiting-input` / `human-takeover` without a parsed prompt | Only the header status word and the attach command; no card. |
| Stream disconnected | The green dot disappears (only if a task event had been seen). No "reconnecting" text; polling takes over only while in flight. |
| Offline | Not handled. |

### 3.6 Targets — `/targets` (`src/routes/TargetsPage.tsx`)

- **Purpose:** register and edit the machines (local or over SSH) that
  workspaces live on, including what Loomux may do there.
- **Shows:** heading **Targets**; a primary button **Register target** that
  toggles to **Cancel** while the form is open (`:164-169`); kind filter chips
  **All / Remote / Local** (`:172-187`); the form when open; the list.
- **Row** (`:383-462`): name; destination (`user@host`, or "this host" for
  local, `src/lib/targets.ts:217-221`); "Policy: …" one-liner when not default
  (e.g. "work machine · no shell commands · only claude-code · asks before new
  work", `targets.ts:204-214`); "Permissions: <mode>" when set; "N workspaces
  reference this target"; kind pill; text buttons **Edit** and **Delete**.
- **Delete:** first click shows **Confirm delete** / **Keep** inline
  (`:418-444`); if workspaces still reference the target a warning explains
  the server will refuse (`:448-453`). Errors: "Could not delete “name”:
  <raw>" plus a hint on 409 (`:455-461`).
- **Form** (`:189-365`, `aria-label` "Register target" or "Edit <name>"):

| Field | Control | Notes |
|---|---|---|
| Name | text | required |
| Kind | select local/remote | Host/User hidden for local |
| Host, User | text | remote only; both required |
| SSH key reference (optional) | text | a vault reference, never key material |
| Workspace root (optional) | text, placeholder `/home/agent/loomux-workspaces` | must be absolute, clean, not `/` |
| Permission mode | select: Agent default / Auto / Accept edits / Manual, with a one-line description under it (`targets.ts:11-33`) | |
| Policy › Purpose | select: "Personal (default)" / "Work — agents run under your work logins" | |
| Policy › Allowed agent types (optional, comma-separated) | text, placeholder "all agent types" | |
| Policy › Allow new workspaces here | checkbox, default on | |
| Policy › Allow plain shell commands here | checkbox, default on | |
| Policy › Ask me before starting new work here | checkbox, default off | |

  Submit **Register** / **Save changes** ("Saving…" in flight), plus
  **Cancel**. Client-side validation mirrors the server's rules and wording
  (`targets.ts:149-178`, e.g. "host and user are required for a remote
  target"). PUT replaces the whole record, so the edit form carries every
  field back (`targets.ts:89-104`).
- **API:** `GET /api/v1/targets`, `GET /api/v1/workspaces` (reference
  counts), `POST /api/v1/targets` (`createTarget`), `PUT
  /api/v1/targets/{id}` (`updateTarget`), `DELETE /api/v1/targets/{id}`
  (`deleteTarget`; 409 when referenced).
- **States:** loading "Loading…"; error raw text; empty "No targets
  registered yet — register one above." / "No targets match this filter.";
  form error `role="alert"` with client or raw server text; delete in-flight
  "Deleting…". Target **health** is returned by the server (`health` field,
  server:`api/server.go:1379-1381`) but not shown; probing is not offered.
  Live updates: none.

### 3.7 Credentials — `/credentials` (`src/routes/CredentialsPage.tsx`)

- **Purpose:** the secret vault: API keys/tokens injected into an agent's
  environment at launch. Values are write-only.
- **Shows:** heading **Credentials**, button **Add credential** (hidden while
  the add form is open, `:106-110`), an explanatory paragraph (`:112-115`),
  the add form, and the list. Each row: the name in monospace, scope
  ("every workspace and agent", or "workspace <name>, agent <type>"), "updated
  <locale datetime>", and text buttons **Replace value** and **Delete**.
- **Add form** (`:118-188`, `aria-label` **"Add credential"**): **Name
  (environment variable)** (placeholder `GITHUB_TOKEN`), **Value** (password
  input, `autocomplete=new-password`), **Only for workspace (optional)**
  (select, "Any workspace" + workspace names), **Only for agent type
  (optional)** (free text, placeholder `claude-code`); **Save** and
  **Cancel**. Client checks: name must match `^[A-Za-z_][A-Za-z0-9_]*$`
  ("The name becomes an environment variable: …"), value non-empty.
- **Replace value:** inline form under the row (`aria-label` "New value for
  <NAME>") with a password textbox **New value** and **Save** / **Cancel**
  (`:239-272`).
- **Delete:** first click shows **Delete <NAME>** / **Keep** (`:217-236`).
- **API:** `GET /api/v1/credentials`, `GET /api/v1/workspaces`, `POST
  /api/v1/credentials` (`createCredential`), `PUT
  /api/v1/credentials/{id}/value` (`setCredentialValue`, 204), `DELETE
  /api/v1/credentials/{id}` (`deleteCredential`, 204).
- **States:** loading "Loading…"; error "Couldn't load credentials: <raw>"
  (a server without a vault answers 404 "credentials are not available on
  this server", shown as this error); empty "No credentials yet."; add/replace/
  delete errors as raw server text in `role="alert"` lines (server messages
  include "a credential with that name already exists at this scope; set its
  value instead" and "that name is used by the shell or by Loomux itself").
  In-flight: add Save and replace Save are disabled but keep their label; the
  delete confirm button is not disabled while pending. Live updates: none.

---

## 4. Cross-cutting components

### 4.1 DispatchCards (`src/components/DispatchCards.tsx`)

**DispatchProgressCard** (`:7-51`) — the turn in flight, shown at the end of
the transcript.
- `role="status"`, `aria-label="Turn in progress"`; left-aligned, bordered,
  `max-w-[75%]`.
- Pulsing blue dot, stage label, elapsed time ticking every second
  ("12s", "3m 05s", "1h 02m"; `src/lib/dispatchTurn.ts:141-147`), and a
  small **Cancel** button (**Cancelling…** after click, disabled).
- Once the turn's task is known: the attach command (AttachInfo) below.
- Stage labels (`dispatchTurn.ts:120-139`, read off dispatch + task status
  because the server sends no per-stage events):

| Condition | Label |
|---|---|
| dispatch `queued` | Queued |
| no task touched yet | Deciding where this goes… |
| task kind `command` | Running a command in <workspace>… |
| task `needs-attention` / `awaiting-input` | <agent> is waiting for you |
| task `human-takeover` | Someone has taken over the session |
| task `completed` | Relaying the answer… |
| otherwise | <agent> is working in <workspace>… |

  The card shows no pane output or partial reply.

**DispatchErrorCard** (`:55-90`) — a failed turn, kept under the user message
that started it.
- `role="alert"`, red border/fill. Plain-language message + hint per
  `error_class` (`dispatchTurn.ts:27-99`), a collapsed **Details** disclosure
  with the raw server error, and a filled red **Retry** button (disabled while
  any turn is busy).

| error_class | Message (hint abbreviated) |
|---|---|
| target_unreachable | Couldn't reach the machine[: reason]. (check SSH, retry) |
| target_unhealthy | The machine isn't usable right now[: reason]. (see Targets) |
| timeout | The agent took too long and the turn was stopped. |
| agent_exited | The agent exited before it finished. |
| wait_failed | Loomux lost track of the turn while waiting for the agent. |
| interrupted | The turn was interrupted when Loomux restarted. |
| cancelled | You cancelled this turn. (session kept, attach to see) |
| agent_rate_limited | The agent hit its usage limit[. It resets <time>]. |
| login_required | The agent needs to be signed in on that machine. |
| anything else | Something went wrong while handling this message. |

  Every failed turn in history keeps its own Retry button.

### 4.2 ConfirmationCard (`src/components/ConfirmationCard.tsx`)

An offer the router made and is waiting on (LOOM-123), under the assistant
reply that made it.
- `<section aria-label="Confirmation">` (`:41-48`); amber while pending,
  neutral once resolved.
- Heading by kind (`:3-15`): "Run this command[ on <target>]?", "Install
  <agent>[ on <target>]?", "Clone a repository you didn't name[ on
  <target>]?", otherwise "Start this work[ on <target>]?".
- Body: the command or git remote in a `pre`; "Workspace <name> · <agent
  type>" line.
- Pending: **Approve** (green filled) and **Deny** (outlined) (`:62-80`),
  disabled while any turn is busy. Each sends a chat message `"yes"` or
  `"no"` with the offer's `confirmation_id`, so a late click cannot approve
  a different offer.
- Resolved (`role="status"`, `:17-22`, `:81-85`): approved → "Approved";
  denied → "Denied: nothing was run"; expired → "Expired: nothing was run.
  Send the request again if you still want it."
- Stale/expired: the client never reads `expires_at`; a pending card stays
  clickable until a refetch brings the server's `expired` status. There is
  no countdown and no in-card "sending" state (the composer shows it).

### 4.3 AttentionCard (`src/components/AttentionCard.tsx`)

An agent stopped at a prompt in its terminal (LOOM-97), docked above the
composer.
- `<section aria-label="Agent needs attention">`, amber.
- Heading (`:24-28`): "<agent> needs your approval" (kind `permission`),
  "<agent> asks whether to trust this folder" (`trust`), else "<agent> is
  asking you something" (`question`, `login`). Then the prompt's title,
  detail (`pre`) and question.
- Buttons: permission/trust → **Approve** (or **Trust**) green and **Deny**
  red, sending `"approve"`/`"deny"` (`:53-72`); for non-trust prompts, one
  outlined button per listed option, "1. <label>", sending the option number
  (options labelled "Type something…" are skipped; description as `title`
  tooltip, `:73-87`).
- Non-trust prompts also get a free-text input (`aria-label="Reply to the
  agent"`, placeholder "Or tell it what to do instead…" / "Or type your own
  answer…") and **Reply** (`:90-108`).
- Disabled only while a send is open (`disabled={sending}`).
- Note the visual split: the offer card sits in the transcript, the agent
  prompt card is docked; the code comment says they are meant to look alike.
  Deny is red-filled here and outlined on ConfirmationCard.

### 4.4 AttachInfo (`src/components/AttachInfo.tsx`)

- Collapsed: underlined text button **Show attach command** (**Loading attach
  info…** while fetching). An error is rendered *inside* the button in red;
  clicking again retries (`:28-39`).
- Expanded: a `code` block with `ssh <user>@<host> tmux attach -t <session>`
  and an overlaid **Copy** button (**Copied** for 2 s) (`:41-66`).
- Call: `GET /api/v1/tasks/{id}/attach-info`.
- Problems (see section 8): the command is assembled client-side and omits
  the tmux socket; for a local target it renders `ssh @ tmux attach …`;
  Copy silently does nothing where the Clipboard API is unavailable (plain
  HTTP).

### 4.5 WebClientUpdate (`src/components/WebClientUpdate.tsx`)

Dashboard panel "WEB CLIENT" (LOOM-118).
- Reads `GET /api/v1/web/version` (`retry: false`). On 404 (old server) the
  panel is hidden (`:35`).
- Shows "Running <tag> (<subject>), installed by an update | from the server
  image" (or "an unversioned build"); then one of: "Updates aren't set up on
  this server."; "Couldn't check for updates: <raw latest_error>" (amber);
  "Up to date."; or "<tag> is available." with **Update** (**Updating…**).
- **Roll back to <previous tag>** link-style button when a previous bundle
  exists (**Rolling back…**).
- After either succeeds: `role="status"` "The server now serves <release>.
  Reload to use it." with **Reload**; the Update/Roll back controls hide.
- Errors: read error "Couldn't read the web client's version: <raw>";
  mutation errors raw (`:86`), e.g. 409 "the web client is already up to
  date", 503 "web updates are not configured on this server", 502 "update
  failed: …".
- Calls: `POST /api/v1/web/update`, `POST /api/v1/web/rollback`.

### 4.6 MessageContent (`src/components/MessageContent.tsx`)

- User text: plain `whitespace-pre-wrap` paragraph, never parsed as markdown
  (`:116-119`).
- Assistant text: `react-markdown` + GFM (tables, task lists, strikethrough,
  autolinks) + `rehype-highlight` (`:60-64`). Styled elements (`:71-108`):
  paragraphs, bullet/numbered lists, links (new tab, `noopener`), blockquote,
  horizontally scrolling tables, dark `pre` code blocks (horizontal scroll),
  tinted inline code.
- Images are dropped (no tracking pixels, `:107`). C/C++/Arduino fences are
  rendered unhighlighted to avoid a highlight.js ReDoS (`:49-58`).
- Headings (`h1`-`h6`) and `hr` have no custom styling (Tailwind preflight
  makes headings look like body text). No copy button on code blocks.

### 4.7 Other shared pieces

- VersionBanner (2.3), RouteErrorBoundary (2.7), ProtectedRoute (2.4).
- Status pill: coloured on conversation lists (`statusBadgeClasses`),
  uncoloured bordered on workspace lists and cards.
- Filter chips: duplicated markup in ConversationsPage `:54-69` and
  TargetsPage `:172-187`.

---

## 5. Flows

Screens: L = Login, D = Dashboard, W = Workspaces, C = Conversations list,
CD = Conversation detail, T = Targets, K = Credentials.

### 5.1 Log in
1. Open any URL without a token → redirected to L (state remembers the
   path).
2. Type password, **Log in** → `POST /login`.
3. Wrong password → red "invalid password"; stays on L.
4. Right password → token saved → **W** (always `/workspaces`, not D and not
   the remembered path).
5. Later, any 401 → token cleared → L, without explanation.

### 5.2 Start a conversation and get an answer
1. D (or C) → **New conversation** → CD at a fresh random UUID; composer
   focused; "No messages yet…".
2. Type, Enter or **Send** → optimistic bubble, button "Sending…" →
   `POST /dispatch` 202.
3. Progress card "Queued" → "Deciding where this goes…"; button "Working…".
4. Router answers directly → `dispatch_update` succeeded → refetch → assistant
   bubble (markdown); progress card disappears; composer re-enabled and
   focused.

### 5.3 A command run at once
1. In CD, send an exact command request (e.g. "run `echo hi` on local").
2. Progress card: "Running a command in <workspace>…" with Cancel and the
   attach command.
3. Reply bubble shows the output and exit status (e2e checks "exit 0").

### 5.4 An offered command (Approve / Deny)
1. Send a request the router won't run unasked (policy
   `require_confirmation`, a command that needs a yes, an agent install, an
   unnamed clone).
2. Turn ends with an assistant reply plus an amber ConfirmationCard
   ("Run this command on <target>?" + command).
3. **Approve** → sends `"yes"` + `confirmation_id` → a new turn (user bubble
   "yes", progress card) → output reply; card turns neutral "Approved".
4. **Deny** → sends `"no"` + `confirmation_id` → card "Denied: nothing was
   run"; nothing executes.
5. If left too long → server marks it expired → after a refetch the card
   reads "Expired: nothing was run…". Never auto-approved.

### 5.5 Provision a workspace with an agent, then follow up
1. In CD, ask for work in a new project (e.g. "in a new workspace X, have
   claude-code write hello.txt").
2. Progress: "Deciding where this goes…" → "<agent> is working in
   <workspace>…" with elapsed time and attach command. (If policy requires
   it, an offer card appears first; see 5.4.)
3. Reply appears; header shows "workspace: <name>" (the e2e asserts this
   text).
4. Send a follow-up: the client passes the latest agent task's workspace as
   `workspace_hint`, so the same agent/workspace continues the work.
5. W now lists the workspace with "target: <name>"; its status may still read
   "active" until reload (section 8).

### 5.6 Agent stopped at a prompt (needs attention → answer)
1. During a turn the agent hits a permission/question/trust prompt; the turn
   ends with a reply describing it and the task becomes `needs-attention`.
2. (Optional) ntfy notification "needs you" with a link to CD, if the turn
   ran at least the server's notify minimum (30 s default).
3. CD shows the AttentionCard above the composer: heading, detail, buttons.
4. Click **Approve**/**Deny**/an option, or type a reply → sent as the next
   chat message → server types the matching keys into the pane → task back
   to running → progress card → final reply. Card disappears.
5. On D/C the conversation appears under Needs attention / "needs you" until
   then.

### 5.7 Cancel a turn
1. While the progress card is showing, **Cancel** → "Cancelling…" →
   `POST /dispatches/{id}/cancel` 202.
2. Turn ends failed with class `cancelled` → error card "You cancelled this
   turn." + hint that the session is kept + **Retry**.
3. If it had already ended: red line "That turn had already finished, so
   there was nothing to cancel."

### 5.8 A failed turn and retry
1. A turn fails (target unreachable, timeout, rate limit, restart…) →
   red DispatchErrorCard under the user message with plain message, hint,
   Details.
2. **Retry** → the same text is sent again as a new turn (new idempotency
   key) → normal progress.
3. The old error card stays in the transcript with its own Retry.

### 5.9 Workspace archive / reopen / delete
1. W → row with status `idle` (or `failed`) → **Archive** → PATCH → row shows
   `archived` and **Reopen**.
2. **Reopen** → PATCH `idle` → row `idle`.
3. **Delete** → inline confirm "Delete <name> and its tasks? … files on the
   machine are kept." → **Yes, delete** → DELETE → row gone.
4. A 409 (e.g. a task still running) shows the server's reason under the row.

### 5.10 Target register / edit (policy fields)
1. T → **Register target** → form opens (button becomes Cancel).
2. Fill Name, Kind; for remote Host + User; optional key ref, workspace root;
   Permission mode; Policy (purpose, allowed agent types, three checkboxes).
3. **Register** → client validation → `POST /targets` → form closes, list
   refetches; or red alert with the problem.
4. Edit: **Edit** on a row → same form prefilled, heading "Edit <name>" →
   **Save changes** → `PUT /targets/{id}` (whole record).
5. Delete: **Delete** → **Confirm delete** / **Keep**; refused with a hint
   while workspaces reference it.

### 5.11 Credentials add / replace / delete
1. K → **Add credential** → form "Add credential".
2. Name (env var), Value, optional workspace and agent-type scope →
   **Save** → `POST /credentials` → row appears; value never shown again.
3. **Replace value** → inline "New value" → **Save** → `PUT
   /credentials/{id}/value`.
4. **Delete** → **Delete <NAME>** / **Keep** → `DELETE /credentials/{id}`.

### 5.12 Web client update / rollback
1. D → "WEB CLIENT" panel shows the running release and, if newer exists,
   "<tag> is available." **Update**.
2. **Update** → `POST /web/update` → "The server now serves <tag>. Reload to
   use it." **Reload** → page reloads onto the new bundle (the service worker
   caches nothing, so no stale copy).
3. **Roll back to <tag>** → `POST /web/rollback` → same reload prompt.
4. Tabs left open on the old bundle that hit a missing chunk auto-reload once
   (2.7).

### 5.13 Install as a PWA
1. Visit over HTTPS in a production build; the service worker registers on
   `load` (`src/lib/serviceWorker.ts:9-14`).
2. The browser offers install from its own menu (Chrome "Install app",
   Safari "Add to Home Screen"); the app has no install button or
   `beforeinstallprompt` handling.
3. Launches standalone at `/` → Dashboard (or Login).
4. Notifications arrive via the user's ntfy app; tapping one opens
   `<public URL>/conversations/<id>` (server:`app/notify.go:143`), in the
   installed app if the OS routes the link there.

---

## 6. API surface

All calls go through `src/lib/api.ts` (`api` object `:293-410`, plus
`openConversationStream` `:432-468`); screens use them via `useApiClient`
(`src/lib/useApiClient.ts`), which adds the token and 401 handling. A test
(`src/lib/apiBoundary.test.ts`) fails if any other file calls `fetch`,
`EventSource` or names `/api/v1`. Errors are JSON `{error: string}`
(plus `dispatch_id` on a dispatch 409) and surface as `ApiError(status,
message)`.

### 6.1 Endpoints the web client calls

| Method | Path | lib function | Used by | Request → response essentials |
|---|---|---|---|---|
| POST | `/login` | `login` | Login | `{password}` → `{token}`; 401 "invalid password" |
| POST | `/logout` | `logout` | Nav Log out | → 204; failures ignored |
| GET | `/version` | `getVersion` | VersionBanner | no auth → `{server_version, api_version}` |
| POST | `/dispatch` | `dispatch` | CD composer, Retry, ConfirmationCard, AttentionCard | headers `Prefer: respond-async`, `Idempotency-Key`; `{conversation_id, message, workspace_hint?, confirmation_id?}` → 202 `Dispatch {dispatch_id, status, …}`; 409 `{error, dispatch_id}` when a turn is running; 503 restarting; 422 idempotency key reused; 400 invalid |
| POST | `/dispatches/{id}/cancel` | `cancelDispatch` | Progress card Cancel | → 202 `{dispatch_id}`; 409 not running |
| GET | `/dispatches/{id}` | `getDispatch` | **defined but unused** | → `Dispatch` |
| GET | `/conversations` | `listConversations` | Dashboard, Conversations | → `{conversations: [{conversation_id, workspace_id, status, updated_at, preview}]}` (all, unpaged) |
| GET | `/conversations/{id}` | `getConversation` | CD | → `{conversation_id, tasks[], messages[], dispatches[], confirmations[]}` (all, unpaged); 404 for a new conversation |
| GET | `/conversations/{id}/stream` | `openConversationStream` | CD | SSE: `task_update {task_id, workspace_id, status, updated_at, failure_reason?, error_class?}`, `dispatch_update {dispatch_id, status, reply?, error?, error_class?, updated_at}`, `message_added {message_id, task_id?, role, created_at}` |
| GET | `/workspaces` | `listWorkspaces` | Dashboard, Workspaces, Conversations, CD, Targets, Credentials | → `{workspaces: [{id, name, target_id, status, tags, description, capabilities, rolling_summary, is_dynamic, last_used_at?, status_reason?}]}` |
| PATCH | `/workspaces/{id}` | `setWorkspaceStatus` | Workspaces Archive/Reopen | `{status: "idle"|"archived"}` → 204; 409 with reason |
| DELETE | `/workspaces/{id}` | `deleteWorkspace` | Workspaces Yes, delete | → `{sessions_not_killed: []}`; 409 with reason |
| GET | `/targets` | `listTargets` | Targets, Workspaces | → `{targets: [Target]}` (Target includes `health`, unused by the client) |
| POST | `/targets` | `createTarget` | Targets | `TargetRequest` (name, kind, host, user, ssh_key_ref, workspace_root, permission_mode, purpose, allowed_agent_types, allow_provision, allow_shell, require_confirmation) → `Target` |
| PUT | `/targets/{id}` | `updateTarget` | Targets Edit | full `TargetRequest` (replaces the record) → `Target` |
| DELETE | `/targets/{id}` | `deleteTarget` | Targets | → 204; 409 while referenced |
| GET | `/credentials` | `listCredentials` | Credentials | → `{credentials: [{id, name, workspace_id?, agent_type?, created_at, updated_at}]}` (never values); 404 if no vault |
| POST | `/credentials` | `createCredential` | Credentials Add | `{name, value, workspace_id?, agent_type?}` → 201 credential; 400/409 with reason |
| PUT | `/credentials/{id}/value` | `setCredentialValue` | Credentials Replace value | `{value}` → 204 |
| DELETE | `/credentials/{id}` | `deleteCredential` | Credentials Delete | → 204 |
| GET | `/tasks/{id}/attach-info` | `getAttachInfo` | AttachInfo | → `{task_id, tmux_session, tmux_socket, attach_command, target {id, name, kind, host, user}}` — the client ignores `tmux_socket` and `attach_command` |
| GET | `/web/version` | `getWebVersion` | WebClientUpdate | → `{current, source, previous?, latest?, latest_error?, update_available, updates_enabled}`; 404 on old servers |
| POST | `/web/update` | `updateWeb` | WebClientUpdate | → same shape; 409 up to date; 503 not configured; 502 failed |
| POST | `/web/rollback` | `rollbackWeb` | WebClientUpdate | → same shape; 409 nothing to roll back to |

### 6.2 Server endpoints the web client does not use (server:`api/server.go:341-373`)

| Method | Path | What it offers |
|---|---|---|
| GET | `/sessions` | every active login session (device), most recent first |
| DELETE | `/sessions/{id}` | revoke one session ("log out that device") |
| GET | `/dispatches/{id}` | one turn's status (wrapped in the client, never called) |
| GET | `/tasks/{id}/transcript` | per-turn record of a task: message sent, agent's final message, pane scrollback (credentials redacted); paged `?limit=` (≤100) `&before=` |
| POST | `/tasks/{id}/cancel` | stop a running task directly (pane kept) |
| GET | `/targets/{id}/agents` | agent CLIs found on a target at last probe |
| POST | `/targets/{id}/agents/refresh` | probe a target's agent CLIs now |
| POST | `/targets/{id}/probe` | probe a target's health and agents now |
| GET | `/health` | unauthenticated liveness/readiness |
| GET | `/health/deep` | authenticated per-target reachability and sidecar checks |

---

## 7. Mobile / PWA constraints

**Manifest** (`public/manifest.json`): name/short_name "Loomux",
description "Chat with your coding-agent fleet.", `id` and `start_url` and
`scope` all `/`, `display: standalone`, `background_color` and `theme_color`
`#171717` (near-black, same in light and dark), icons 192 and 512 PNG, a
512 maskable PNG, and an SVG (`sizes: any`). No `shortcuts`, `screenshots`,
`orientation` or `categories`.

**HTML head** (`index.html`): `<meta name="viewport"
content="width=device-width, initial-scale=1.0">` (no `viewport-fit=cover`,
so no safe-area handling; no `env(safe-area-inset-*)` anywhere), `<meta
name="theme-color" content="#171717">` (single value, not per scheme), SVG
favicon, `apple-touch-icon.png`, manifest link. No
`apple-mobile-web-app-*` metas.

**Service worker** (`public/sw.js`, registered by
`src/lib/serviceWorker.ts:9-14` in production builds only, on `load`):
`skipWaiting` on install, `clients.claim` on activate, **no fetch handler,
no caching**. It exists only to make the app installable and openable from
a link. Consequences: every page load and API call goes to the network (a
deploy is never hidden behind a stale copy; the in-app update flow is just
"reload"); an installed app launched offline shows the browser's offline
error. No Web Push: notifications come from ntfy (server-side, LOOM-102),
with a link to `<LOOMUX public URL>/conversations/<id>`
(server:`app/notify.go:133-145`). Notification kinds: done, needs-you (agent
prompt or pending offer), failed. Turns shorter than the notify minimum
(default 30 s, server:`app/config.go:136-138`) or cancelled by the user never
notify (server:`app/notify.go:84-93`).

**Responsive classes:** none (`sm:`/`md:`/`lg:` unused). Things that matter
on a phone:
- Nav: five links + Log out on one non-wrapping row (`src/App.tsx:30-41`).
- Dashboard workspace strip scrolls horizontally with 16 rem cards.
- List rows put name, pill and up to three buttons on one `flex
  justify-between` line (`WorkspacesPage.tsx:82-107`); long names squeeze the
  buttons.
- Chat bubbles cap at 75% width; code blocks and tables scroll sideways.
- Conversation page height is `100svh - 3rem`; the version banner or browser
  chrome changes break that assumption; the on-screen keyboard is not
  accounted for (svh does not shrink with it).

**Touch targets:** many controls are well under 44 px: workspace row buttons
`px-2 py-0.5 text-xs` (`WorkspacesPage.tsx:6-7`), progress card Cancel
(`DispatchCards.tsx:38`), AttachInfo Copy, text-only Edit/Delete/Keep/Replace
value links on Targets and Credentials, nav links (`text-sm`, no padding),
filter chips `py-1`.

**Composer on mobile:** a one-row textarea that never grows; Enter sends and
only Shift+Enter makes a newline (`ConversationDetailPage.tsx:366-371`), so on
a soft keyboard there is effectively no way to type a newline; no
`enterKeyHint`. It is focused programmatically on open and after every turn
(`:154-156`), which pops the keyboard on phones each time a turn ends. The
textarea and Send are disabled for the whole turn, so the user cannot draft
the next message while waiting.

**Secure context:** "New conversation" and every send use
`crypto.randomUUID()` (`DashboardPage.tsx:52`, `ConversationsPage.tsx:47`,
`ConversationDetailPage.tsx:184`), which exists only on HTTPS or localhost;
the service worker and Clipboard API have the same requirement. Over plain
HTTP on a LAN these break.

---

## 8. Rough edges seen in testing

### 8.1 Observed on the live test instance and in tests

1. **Login lands on Workspaces.** After logging in from `/login` the app
   goes to `/workspaces`, not the Dashboard (`LoginPage.tsx:25`; the
   already-logged-in fallback is also `/workspaces`, `:16`). It also drops
   the page the user was redirected from, so a notification link opened while
   logged out ends on Workspaces instead of the conversation.
2. **Reply before "finished"; stale workspace status.** An agent's reply can
   appear on the conversation page (the progress card shows the live pane) a
   moment before its turn is recorded as finished: `message_added` triggers a
   refetch that shows the reply while the dispatch is still `running`, so the
   reply and the progress card are visible together
   (`ConversationDetailPage.tsx:133-137`, `:340-348`). The Workspaces page
   reads status once on arrival and doesn't refresh live (no stream, no
   polling; only React Query mount/focus refetch), so a just-finished
   workspace can show "active" until reload.
3. **Needs attention never ages out.** The Dashboard's "Needs attention" list
   shows old conversations "awaiting input" indefinitely (e.g. test
   conversations days old). A conversation's status is its latest task's
   status (server:`api/server.go:721-745`), and the dashboard filters on
   status alone with no age cutoff or dismiss (`DashboardPage.tsx:40-45`).
4. **Resolved (web#60):** the Workspaces row shows the target *name*
   ("target: <name>"), and the conversation header shows a new workspace's
   name instead of its id (the one-time refetch in
   `ConversationDetailPage.tsx:30-56`). Keep both behaviours.
5. **Offer notifications practically never fire.** An offer waiting on
   Approve only notifies if the turn ran past the server's 30 s notify
   minimum (server:`app/notify.go:88-93`, `:109-111`;
   server:`app/config.go:138`). Offers are usually made in a few seconds, so
   the user is not told one is waiting. Deferred product question.
6. **Composer focus unreliable after navigation.** On the live instance,
   programmatic focus/typing into the composer was unreliable right after
   navigation (the composer is autofocused, `ConversationDetailPage.tsx:154-156`).
   Worth checking for real users on mobile, where autofocus also raises the
   keyboard.
7. **Active workspaces can only be deleted.** The Workspaces page only offers
   Archive on `idle`/`failed` workspaces (`WorkspacesPage.tsx:77`); an
   `active` one (agent pane in its grace period) can only be deleted.
8. **Raw server error text** is shown directly in:
   - `LoginPage.tsx:27` (e.g. "invalid password");
   - `DashboardPage.tsx:66`, `:101`; `ConversationsPage.tsx:72`;
     `WorkspacesPage.tsx:21`, `:130`;
   - `ConversationDetailPage.tsx:209` (send), `:231` ("Couldn't cancel:
     <raw>");
   - `AttachInfo.tsx:22`, `:36` (inside the button);
   - `TargetsPage.tsx:342-346`, `:368`, `:457`;
   - `CredentialsPage.tsx:167-169`, `:193`, `:275`;
   - `WebClientUpdate.tsx:41`, `:54` (`latest_error`), `:86`;
   - DispatchErrorCard "Details" (`DispatchCards.tsx:74-79`) — deliberate,
     behind a disclosure.
   Network failures show the browser's own text (e.g. "Failed to fetch").
9. **No pagination anywhere.** Unbounded lists: conversations
   (`GET /conversations`, rendered in full by `ConversationsPage.tsx:82-102`
   and `DashboardPage.tsx:71-89`), workspaces (`WorkspacesPage.tsx:30-37`,
   dashboard strip `DashboardPage.tsx:106-143`), targets
   (`TargetsPage.tsx:378-464`), credentials (`CredentialsPage.tsx:198-279`),
   and the full message/task/dispatch/confirmation history of a conversation
   (`GET /conversations/{id}`, `ConversationDetailPage.tsx:301-339`). The
   server offers paging only for task transcripts, which the client doesn't
   use.

### 8.2 Found in the code

Correctness
- **Attach command is wrong for real sessions.** The client builds `ssh
  user@host tmux attach -t <session>` itself (`AttachInfo.tsx:41`) and ignores
  the server's `attach_command` / `tmux_socket`. Loomux runs sessions on its
  own tmux server (`tmux -L loomux`, server:`targets/targets.go:28-36`), so
  the copied command won't find the session. For a local target (empty host
  and user) it renders `ssh @ tmux attach …`.
- **Retry of a failed offer answer drops the offer id.** Retry resends the
  message text only (`ConversationDetailPage.tsx:335`), so retrying a failed
  "yes" sends a bare "yes" without `confirmation_id`. Whether the server can
  ever treat that as approval needs checking against "offers must never
  auto-approve".
- **Conversation load errors are invisible.** Only `data` is read from the
  history query (`:72-83`); a 500 or network error looks like an empty
  conversation ("No messages yet…"). There is no loading state either.
- **Stream status is only partially shown.** The green dot appears only after
  a `task_update` has been seen and there is no "reconnecting…" state
  (`:282-287`), although the design doc asks for one
  (`docs/design/web-client-design.md` "Error handling").
- **AttentionCard during a turn.** The card is shown whenever the latest
  needs-attention task has a prompt, but `send()` silently returns while any
  turn is in flight (`:168-170`); its buttons are only disabled for
  `sending`, not `inFlight` (`:354-359`), so a click during a turn does
  nothing with no feedback.
- **`crypto.randomUUID()`** fails outside secure contexts (section 7).
- **No 404 route** (`src/App.tsx:57-68`).
- **Delete notice is lost:** the "sessions couldn't be stopped" notice lives
  in the row that the refetch removes (`WorkspacesPage.tsx:65-71`).
- **Expired offers stay clickable** until refetch; `expires_at` is unused
  (`ConfirmationCard.tsx`).

Missing states
- No loading indicator on the conversation page; no error state for its
  load; no offline state anywhere.
- Credentials add **Save** has no in-flight label; delete confirm is not
  disabled while pending (`CredentialsPage.tsx:172-174`, `:219`).
- Workspace mutations show no in-flight label (`WorkspacesPage.tsx:91-105`).
- `awaiting-input` and `human-takeover` have no card in the conversation —
  only a header word and the attach link.
- Only the latest task gets an attach command; earlier tasks in a
  multi-task conversation are not listed (task-history panel from the phase-2
  design was not built).
- Target health is returned but never shown; no probe button.
- No session/device list, though the server supports it.
- No search, no workspace filter, filters not reflected in the URL.

Accessibility
- Composer textarea has no label, only a placeholder
  (`ConversationDetailPage.tsx:363-378`).
- Nav links have no current-page indication (`Link` not `NavLink`).
- Filter chips have no `aria-pressed` (`ConversationsPage.tsx:55-68`,
  `TargetsPage.tsx:173-186`).
- Connected "●" has no text alternative (`ConversationDetailPage.tsx:285`).
- No custom focus styles anywhere (zero `focus:`/`focus-visible:` classes);
  default outlines only.
- Only Credentials uses a `<main>` landmark (`CredentialsPage.tsx:103`).
- The AttachInfo error lives inside the button label (`AttachInfo.tsx:36`).
- Auto-scroll to the end on every update can yank screen-reader and
  keyboard users away from what they were reading (`:258-262`).
- Colour-only status distinctions (awaiting-input red vs needs-attention
  amber vs human-takeover orange).

Inconsistent styling
- Delete: bordered xs button (Workspaces), grey text link (Targets), red text
  link (Credentials). Confirm wording: "Yes, delete"/"Cancel" vs "Confirm
  delete"/"Keep" vs "Delete <NAME>"/"Keep".
- Deny: red filled (AttentionCard) vs outlined (ConfirmationCard).
- Status pills: coloured on conversation lists, uncoloured on workspaces.
- Dashboard attention rows show the conversation id; the Conversations list
  shows the preview (`DashboardPage.tsx:81` vs `ConversationsPage.tsx:84`).
- Dates: relative in chat, `toLocaleDateString` on dashboard cards,
  `toLocaleString` on credentials.
- Page widths: Credentials is centred `max-w-3xl`, every other page is full
  width.
- "Register target" toggles into "Cancel" in place; "Add credential"
  disappears instead.

Duplicated logic
- Workspace id → name maps built separately in Dashboard (`:34-38`),
  Conversations (`:29-33`), ConversationDetail (`:34-56`), Credentials
  (`:38-41`); target name / count maps in Workspaces (`:16-18`) and Targets
  (`:63-69`).
- Conversation list row markup duplicated (Dashboard `:71-89`,
  Conversations `:82-102`); "New conversation" button duplicated.
- Filter chip markup duplicated (Conversations, Targets).
- `INPUT_CLASSES`, `PRIMARY_BUTTON_CLASSES`, `errorMessage()` duplicated in
  `TargetsPage.tsx:27-34` and `CredentialsPage.tsx:11-21`.
- `useApiClient().getDispatch` is defined but unused.

---

## 9. Constraints the redesign must keep

- **Auth:** single user, one shared password. `POST /login` returns a bearer
  token stored in `localStorage["loomux.token"]` and sent as
  `Authorization: Bearer …` on every call including the SSE stream. Any 401
  logs out to `/login`. No accounts, no sign-up, no SSO.
- **API contract is fixed:** no server changes are assumed. Everything must
  be built from the endpoints in 6.1 (6.2 is available but unused). All
  server access stays in `src/lib/api.ts`; `apiBoundary.test.ts` enforces it.
- **Conversations are implicit:** a new one is a client-generated UUID; it
  exists once the first message is dispatched; a 404 on a new id is normal.
- **One turn at a time per conversation:** a second send gets 409 with the
  running `dispatch_id`; the UI must follow that turn, not lose the user's
  text.
- **Credential values are write-only:** never displayed, never echoed back,
  never placed in URLs; only replace or delete.
- **Offers must never auto-approve.** Only an explicit user click sends an
  approval.
- **Approve/Deny semantics:** Approve sends the chat message `"yes"` and Deny
  sends `"no"`, each with the offer's `confirmation_id`
  (`ConfirmationCard.tsx`, `ConversationDetailPage.tsx:324-329`). Agent
  prompts are answered by sending `"approve"`, `"deny"`, an option number or
  free text as the next message.
- **Attach is informational:** the client shows a command to copy; it never
  opens SSH itself.
- **Workspace creation stays router-driven** (from chat), not a form.
- **User text is never rendered as markdown; assistant images stay
  dropped; the C/C++ highlight exclusion stays.**
- **Notifications are ntfy links** to `/conversations/<id>`; that route must
  keep working as a deep link.
- **e2e accessible names** (`e2e/specs/*.spec.ts`, from web#62; keep them or
  update the specs with the redesign):

| Where | Name / text the specs use |
|---|---|
| Login | label **Password**; button **Log in**; error text matching /invalid password/i |
| Shell | button **Log out**; nav links **Workspaces**, **Credentials**; `/` redirects to `/login` when logged out |
| Dashboard | heading **Dashboard**; button **New conversation** (navigates to `/conversations/…`) |
| Conversation | placeholder **Message the agent fleet…**; button **Send** (exact; **Sending…** / **Working…** while busy); text **workspace: <name>** in the header; reply text visible on the page; command output with "exit N" |
| Offers | region **Confirmation** with buttons **Approve** / **Deny** |
| Workspaces | list items containing **target: <name>** and the status words **archived** / **idle**; buttons **Archive**, **Reopen**, **Delete**, then text /files on the machine are kept/ and button **Yes, delete** |
| Credentials | button **Add credential**; form **Add credential** with labels matching /Name/ and **Value**, button **Save**; list item with button **Replace value**, textbox **New value** (exact), **Save**; button **Delete** then **Delete <NAME>**; the secret value never appears as text |

---

## 10. Open questions for the designer

1. Where should login land: Dashboard, the page the user came from, or
   Conversations (phase-2 design said `/` should be conversations)? Should a
   notification deep link survive a re-login?
2. How should "needs attention" age out or be dismissed, given conversation
   status is just the latest task's status?
3. Should workspace status refresh live (polling the list), or is
   refresh-on-focus enough? Should Archive be offered for `active`?
4. Agent prompts (docked card) and offers (inline card) — one pattern or two?
   And should Deny look the same in both?
5. How should a turn in flight look on a phone: is the progress card enough,
   should the user be able to draft while waiting, and should the composer
   stop auto-focusing?
6. How much of the unused server surface belongs in this redesign: target
   health/probe, task transcripts (pane scrollback), session/device list,
   per-task history and attach?
7. Status vocabulary: the raw words (`awaiting-input`, `human-takeover`,
   `needs-attention`, workspace `active`) are shown as-is. What should users
   see, and how are they ranked visually?
8. Navigation on mobile: bottom tabs, a menu, or fewer top-level sections
   (Targets and Credentials are setup screens, rarely visited)?
9. Should long lists get paging/search now, or only the conversation list?
10. Offer notifications: should the UI make up for the 30 s rule (e.g. a
    pending-offer badge), or is that a server question?
