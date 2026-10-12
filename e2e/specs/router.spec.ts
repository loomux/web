import { expect, test, type Page } from "@playwright/test";
import { login, newConversation, send, turnDone } from "./helpers";

// The router model's tiers in Settings (server LOOM-185, LOOM-189): save
// a primary tier over the environment's, route a message with it, and go
// back. The saved tier points at the same stand-in router, so a run that
// stops halfway leaves the other specs' routing as it was.
const ROUTER_URL = `http://127.0.0.1:${process.env.FAKE_ROUTER_PORT ?? "18091"}/v1`;

function primaryCard(page: Page) {
  return page
    .getByRole("region", { name: "Router model" })
    .getByRole("listitem")
    .filter({ has: page.getByRole("heading", { name: "Primary" }) });
}

test("save a primary router tier, route with it, then go back to the environment's", async ({ page }) => {
  const key = `e2e-router-key-${Date.now()}`;
  await login(page);
  await page.getByRole("link", { name: "Settings" }).click();
  const primary = primaryCard(page);
  await expect(primary).toContainText("From the environment");

  await primary.getByRole("button", { name: "Test" }).click();
  await expect(primary.getByRole("status")).toHaveText(/^Works · \d+ ms$/);

  await primary.getByRole("button", { name: "Edit" }).click();
  const form = page.getByRole("form", { name: "Edit Primary tier" });
  await form.getByLabel("Base URL").fill(ROUTER_URL);
  await form.getByRole("combobox", { name: "Model" }).fill("e2e-stored");
  await form.getByLabel("API key").fill(key);
  await form.getByRole("button", { name: "Save" }).click();
  await expect(form).toHaveCount(0);
  await expect(primary).toContainText("Saved in Loomux");
  await expect(primary).toContainText("e2e-stored");
  await expect(primary).toContainText(`•••• ${key.slice(-4)}`);
  // Write-only: the key is never on the page again.
  expect(await page.content()).not.toContain(key);
  await expect(page.getByRole("list", { name: "Recent router changes" })).toContainText(/Primary: .*api_key.* changed/);

  // The saved tier routes the next message, with no restart.
  await newConversation(page);
  await send(page, "answer: routed by the saved tier");
  await expect(page.getByText("e2e answer: routed by the saved tier")).toBeVisible();
  await turnDone(page);

  await page.getByRole("link", { name: "Settings" }).click();
  await primary.getByRole("button", { name: "Use environment settings" }).click();
  await primary.getByRole("button", { name: "Yes, remove them" }).click();
  await expect(primary).toContainText("From the environment");
  await expect(page.getByRole("list", { name: "Recent router changes" })).toContainText("Primary: removed");
});
