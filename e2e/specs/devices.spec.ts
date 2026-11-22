import { createHash, randomBytes } from "node:crypto";
import { expect, test } from "@playwright/test";
import { apiToken, login } from "./helpers";

// LOOM-274 (TUI W2): Settings → Devices names each session's client and
// device from what the server says (loomux/server LOOM-268's client_kind
// and label), so the right one is signed out. The terminal here is linked
// the way the /link page approves one: POST /api/v1/sessions with the
// hash of a token only the terminal holds.
test("devices name a linked terminal, and signing it out ends its token", async ({ page, request }) => {
  const web = await apiToken(request);
  const terminal = randomBytes(32).toString("base64url");
  const label = `e2e-${randomBytes(3).toString("hex")}`;
  const linked = await request.post("/api/v1/sessions", {
    headers: { Authorization: `Bearer ${web}` },
    data: { token_hash: createHash("sha256").update(terminal).digest("hex"), label, client_kind: "tui" },
  });
  expect(linked.status()).toBe(201);
  const asTerminal = { Authorization: `Bearer ${terminal}` };
  expect((await request.get("/api/v1/sessions", { headers: asTerminal })).status()).toBe(200);

  await login(page);
  await page.goto("/settings");
  const devices = page.getByRole("region", { name: "Devices" });
  // A password login is the web's.
  await expect(devices.getByRole("listitem").filter({ hasText: /^Web/ }).first()).toBeVisible();
  const row = devices.getByRole("listitem").filter({ hasText: `loomux TUI · ${label}` });
  await expect(row).toBeVisible();

  await row.getByRole("button", { name: "Log out this device" }).click();
  await expect(row).toContainText("It'll need loomux login to sign in again.");
  await row.getByRole("button", { name: "Yes, log it out" }).click();
  await expect(row).toHaveCount(0);
  expect((await request.get("/api/v1/sessions", { headers: asTerminal })).status()).toBe(401);
});
