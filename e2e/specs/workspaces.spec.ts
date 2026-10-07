import { expect, test } from "@playwright/test";
import { ensureLocalTarget, login, newConversation, send, turnDone } from "./helpers";

test.beforeEach(async ({ page, request }) => {
  await ensureLocalTarget(request);
  await login(page);
});

test("provision a workspace with an agent, follow up, then archive, reopen and delete it", async ({ page }) => {
  const name = `e2e_ws_${Date.now()}`;
  await newConversation(page);

  await send(page, `provision ${name} on local: write hello.txt`);
  // The stand-in agent quotes the prompt's last line, i.e. the message.
  await expect(page.getByText(/e2e agent reply: .*write hello\.txt/)).toBeVisible({ timeout: 45_000 });
  // The header names the new workspace, not its id (web#60).
  await expect(page.getByText(`workspace: ${name}`)).toBeVisible();

  await send(page, `in ${name}: second turn`);
  await expect(page.getByText(/e2e agent reply: .*second turn/)).toBeVisible({ timeout: 45_000 });
  await turnDone(page);

  await page.getByRole("link", { name: "Machines" }).click();
  const row = page.getByRole("listitem").filter({ hasText: name });
  await expect(row.getByText("target: local")).toBeVisible();
  await row.getByRole("button", { name: "Archive" }).click();
  await expect(row.getByText("archived")).toBeVisible();
  await row.getByRole("button", { name: "Reopen" }).click();
  await expect(row.getByText("idle")).toBeVisible();

  await row.getByRole("button", { name: "Delete" }).click();
  await expect(row.getByText(/files on the machine are kept/i)).toBeVisible();
  await row.getByRole("button", { name: /yes, delete/i }).click();
  await expect(page.getByRole("listitem").filter({ hasText: name })).toHaveCount(0);
});
