import { execFileSync } from "node:child_process";

// Playwright stops e2e/run-server.sh without letting its trap run, which
// would leave the loomuxd container (and its port) behind: remove it here.
export default function teardown() {
  try {
    execFileSync("docker", ["rm", "-f", process.env.E2E_CONTAINER ?? "loomux-e2e"], { stdio: "ignore" });
  } catch {
    // Already gone.
  }
}
