import { defineConfig } from "@playwright/test";
import { randomBytes } from "node:crypto";

// The e2e suite (e2e/README.md): this checkout's web build served by a real
// loomuxd (the published server image), with a stand-in router model and a
// stand-in agent CLI, on a fresh database. Nothing real: the password is made
// up per run and set in the environment, so the workers (forked after this
// file loads) and e2e/run-server.sh see the same one.
process.env.E2E_PASSWORD ??= randomBytes(18).toString("base64url");

const serverPort = Number(process.env.E2E_SERVER_PORT ?? 18090);
const routerPort = Number(process.env.FAKE_ROUTER_PORT ?? 18091);

export default defineConfig({
  testDir: "e2e/specs",
  globalTeardown: "./e2e/teardown.ts",
  // One server and one database: tests share it, so one at a time.
  workers: 1,
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  timeout: 60_000,
  expect: { timeout: 20_000 },
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: `http://127.0.0.1:${serverPort}`,
    trace: "retain-on-failure",
  },
  webServer: [
    {
      command: "node e2e/fake-router.mjs",
      port: routerPort,
      reuseExistingServer: false,
    },
    {
      command: "sh e2e/run-server.sh",
      url: `http://127.0.0.1:${serverPort}/api/v1/health`,
      timeout: 180_000,
      // Never reuse: a server left running has another run's password.
      reuseExistingServer: false,
      stdout: "ignore",
      stderr: "pipe",
    },
  ],
});
