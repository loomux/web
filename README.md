# Loomux — web client

The browser-based single-page app for [Loomux](https://github.com/loomux/server):
log in, see registered workspaces, hold conversations with the agent fleet,
watch a dispatch progress live, and get the attach-info needed to `ssh` +
`tmux attach` for a manual takeover.

**Status: initial scaffold (LOOM-23 design approved, LOOM-24 build-out in
progress).** Auth, routing, the typed API client, and stub pages for every
route exist and are wired up end-to-end against a real `loomuxd`; the pages
themselves are minimal and will keep growing under LOOM-24.

## Design

The design spec lives at [`docs/design/web-client-design.md`](docs/design/web-client-design.md)
— framework/tooling choice, auth flow, page structure, the API surface this
client consumes, real-time updates, hosting model, error handling, and
testing strategy. This is the working reference for ongoing work in this
repo; [`loomux/server`](https://github.com/loomux/server)'s copy of the
same file is the historical record of what was approved (mirrors how that
repo's own `docs/design/core-design.md` relates to command-center's copy).

**Known dependency this design flags, not yet built:** for the "static
files served by `loomuxd`" hosting model to work in production, the server
repo needs a small addition — serving a configured static directory for
non-`/api/*` paths with SPA fallback. See the design doc's "Hosting /
serving integration" section. Until that lands, run this client against a
local `loomuxd` via `npm run dev` (see below).

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
- `src/routes/` — one file per page (`LoginPage`, `WorkspacesPage`,
  `ConversationsPage`, `ConversationDetailPage`)
- `src/components/` — `ProtectedRoute` (auth gate), `VersionBanner`
  (API-version-mismatch warning), `AttachInfo` (on-demand attach command)

## Testing

`src/lib/api.test.ts` covers the API client's success/error/auth-header
behavior against a mocked `fetch`. `src/routes/LoginPage.test.tsx` covers
the login flow (token stored on success, server error message shown on
failure) with React Testing Library. Run with `npx vitest run`.
