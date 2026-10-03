# Loomux — web client

The browser-based single-page app for [Loomux](https://github.com/loomux/server):
log in, see registered workspaces, hold conversations with the agent fleet,
watch a dispatch progress live, and get the attach-info needed to `ssh` +
`tmux attach` for a manual takeover.

**Status: LOOM-24 build-out.** Auth, the attention-first dashboard,
workspaces, the conversations list, the conversation detail view (live
SSE task status, persisted transcript, Markdown + syntax-highlighted
rendering, attach-info surfacing), and target registration (LOOM-69:
register/edit/remove the hosts workspaces live on) are all shipped and
wired up end-to-end against a real `loomuxd`.

## Design

The design spec lives at [`docs/design/web-client-design.md`](docs/design/web-client-design.md)
— framework/tooling choice, auth flow, page structure, the API surface this
client consumes, real-time updates, hosting model, error handling, and
testing strategy. This is the working reference for ongoing work in this
repo; [`loomux/server`](https://github.com/loomux/server)'s copy of the
same file is the historical record of what was approved (mirrors how that
repo's own `docs/design/core-design.md` relates to command-center's copy).

The hosting dependency the design originally flagged — `loomuxd` serving
this client's static build for production — has since shipped server-side
(LOOM-33). For local development, run this client against a `loomuxd` via
`npm run dev` (see below).

## Development

```sh
npm install
npm run dev      # Vite dev server; proxies /api to http://localhost:8080
npm run build    # typecheck + production build (dist/)
npm run lint      # oxlint
npx vitest run    # test suite
```

Point `npm run dev` at a running `loomuxd` (see
[`loomux/server`'s `cmd/loomuxd` README](https://github.com/loomux/server/blob/main/cmd/loomuxd/README.md)
for how to start one, including generating the auth password hash) — the
dev server proxies `/api/*` to `http://localhost:8080` by default
(`vite.config.ts`).

## Layout

- `src/lib/api.ts` — typed client for every `/api/v1/*` endpoint, DTOs
  mirrored exactly from `api/server.go` in the server repo
- `src/lib/auth.tsx` — `AuthProvider`/`useAuth`: login, token storage
  (`localStorage`), logout
- `src/lib/useApiClient.ts` — binds `api.ts` calls to the current session
  token and routes a `401` through `handleUnauthorized`
- `src/lib/useConversationStream.ts` — SSE client for
  `/conversations/{id}/stream` via `@microsoft/fetch-event-source` (not
  native `EventSource` — see the design doc for why)
- `src/lib/conversations.ts` — shared sorting/filtering/status-label logic
  for the dashboard and conversations list
- `src/lib/targets.ts` — target form state, and the client-side mirror of
  the server's `registry.Target.Validate` so the register/edit form
  previews the exact message a `400` would carry
- `src/routes/` — one file per page (`LoginPage`, `DashboardPage`,
  `WorkspacesPage`, `ConversationsPage`, `ConversationDetailPage`,
  `TargetsPage`), lazy-loaded per route in `App.tsx`
- `src/components/` — `ProtectedRoute` (auth gate), `VersionBanner`
  (API-version-mismatch warning), `AttachInfo` (on-demand attach command),
  `MessageContent` (Markdown/GFM + syntax-highlighted rendering of
  assistant replies, with a denylist of ReDoS-affected languages that are
  rendered unhighlighted — see the comments in that file), `RouteErrorBoundary`
  (catches a failed lazy-route chunk fetch — e.g. an old tab open across a
  redeploy — and offers a reload instead of a blank screen)

## Testing

Vitest + React Testing Library. Every route except `WorkspacesPage`, plus
`src/lib/api.ts`, `src/lib/conversations.ts` and `src/lib/targets.ts`, has
a co-located `*.test.ts(x)` file — the API client's success/error/auth-header
behavior against a mocked `fetch`, the login flow, dashboard/conversations
sorting and filtering, the conversation detail view's message rendering and
live-stream handling, and the targets page's validation gate, PUT
round-tripping and delete-conflict surfacing. Run with `npx vitest run`.
