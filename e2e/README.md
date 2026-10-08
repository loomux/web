# End-to-end tests

The web client's core flows in a real browser (Playwright, Chromium,
headless), against a real loomuxd. They're the safety net for redesigning
the UI: what they check is what the user does, not how a page is built.

```sh
npm run build            # the bundle under test
npx playwright install chromium   # once
npm run e2e
```

Needs Docker and Node. CI runs it as the `e2e` job.

## What runs

- **loomuxd**: the published server image (`ghcr.io/loomux/server:main`;
  `LOOMUX_SERVER_IMAGE` picks another). `run-server.sh` runs it on
  127.0.0.1:18090 with host networking, serving this checkout's `dist/`
  through `LOOMUX_STATIC_DIR`, with a throwaway database, master key and
  password. The password is made up per run by `playwright.config.ts`
  (`E2E_PASSWORD`), so nothing real is used or kept.
- **A stand-in router model**: `fake-router.mjs`, an OpenAI-compatible
  endpoint on 127.0.0.1:18091. It decides from keywords in the message:
  `answer: …`, `` run `cmd` on local `` (an exact order: runs at once),
  `propose cmd on local` (an offer), `provision <name> on local: …`,
  `in <workspace>: …`. Relay returns the agent's output.
- **A stand-in agent**: `bin/claude`, mounted over the image's PATH. It
  answers Loomux's version and auth probes and, for each turn, prints
  "e2e agent reply: <the prompt's last line>" and does what Claude Code's
  Stop hook does for Loomux (saves the reply beside the marker, touches
  the marker).
- **A local target** named `local`, inside the container, registered by
  the tests through the API. The image turns local targets off by default
  (loomux/server LOOM-141: a local agent runs as the server's own user),
  so `run-server.sh` sets `LOOMUX_LOCAL_TARGETS=on` for this throwaway
  server.

## What's covered

| Spec | Flow |
|---|---|
| `auth` | wrong password refused, login, logout |
| `chat` | a direct answer; an exact command order runs and shows its output and exit status |
| `offers` | an offered command: Approve runs it, Deny runs nothing |
| `workspaces` | provision a workspace with an agent, a follow-up turn, then Archive, Reopen, Delete (with its confirmation) |
| `audit` | LOOM-139: every main screen at phone size in both themes (no sideways scroll, axe clean); hostile markdown renders inert; and `test.fail()` cases pinning open bugs (failed send loses the draft, stream reconnect without backoff, impossible `/today/:date`); the app shell's CSP and framing headers (LOOM-143) |
| `credentials` | add, replace and delete a credential; its value never appears |

Not covered: **restart mid-turn**. The local target's tmux runs inside the
loomuxd container, so restarting the server ends the agent too. It's covered
by the server's own tests and by the release checklist (§8 step 5 of
loomux/server `docs/release/v0.2.0.md`).

Tests share one server and run one at a time. Each uses its own
conversation and names, so their order doesn't matter.
