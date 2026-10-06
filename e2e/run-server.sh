#!/bin/sh
# Runs loomuxd for the e2e suite (e2e/README.md), in the foreground so
# Playwright can stop it: the published server image, serving this checkout's
# dist/ (the web build under test), talking to e2e/fake-router.mjs, with the
# stand-in claude (e2e/bin/claude) on PATH for agent turns on a local target.
# A fresh, throwaway database and secrets every run: the password comes from
# E2E_PASSWORD (Playwright makes one up), nothing real is used or stored.
set -eu

IMAGE="${LOOMUX_SERVER_IMAGE:-ghcr.io/loomux/server:main}"
PORT="${E2E_SERVER_PORT:-18090}"
ROUTER_PORT="${FAKE_ROUTER_PORT:-18091}"
NAME="${E2E_CONTAINER:-loomux-e2e}"
: "${E2E_PASSWORD:?set E2E_PASSWORD}"
root="$(cd "$(dirname "$0")/.." && pwd)"
[ -f "$root/dist/index.html" ] || { echo "run-server: build the web client first (npm run build)" >&2; exit 1; }

hash="$(printf '%s' "$E2E_PASSWORD" | docker run --rm -i "$IMAGE" -hash-password | tail -n 1)"
data="$(mktemp -d)"
trap 'docker rm -f "$NAME" >/dev/null 2>&1 || true; rm -rf "$data"' EXIT INT TERM
docker rm -f "$NAME" >/dev/null 2>&1 || true

# Host networking: loomuxd reaches the fake router on 127.0.0.1, and the
# browser reaches loomuxd there. It runs as this user so it can write the
# throwaway data dir; HOME=/tmp holds its workspaces and tmux state.
docker run --rm --name "$NAME" --network host \
  --user "$(id -u):$(id -g)" -e HOME=/tmp \
  -v "$data:/data" \
  -v "$root/dist:/srv/loomux/web:ro" \
  -v "$root/e2e/bin/claude:/usr/local/bin/claude:ro" \
  -e LOOMUX_DB_PATH=/data/loomux.db \
  -e LOOMUX_HTTP_ADDR="127.0.0.1:$PORT" \
  -e LOOMUX_METRICS_ADDR="127.0.0.1:$((PORT + 2))" \
  -e LOOMUX_AUTH_PASSWORD_HASH="$hash" \
  -e LOOMUX_MASTER_KEY="$(head -c 32 /dev/urandom | base64)" \
  -e LOOMUX_ROUTER_PRIMARY_BASE_URL="http://127.0.0.1:$ROUTER_PORT/v1" \
  -e LOOMUX_ROUTER_PRIMARY_API_KEY=e2e \
  -e LOOMUX_ROUTER_PRIMARY_MODEL=e2e \
  -e LOOMUX_WEB_UPDATES=off \
  -e LOOMUX_AGENT_PROFILES='{"claude-code":{"pre_trust":false}}' \
  "$IMAGE" &
wait $!
