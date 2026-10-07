import { expect, test } from "@playwright/test";
import { ensureLocalTarget, login, newConversation, send } from "./helpers";

test.beforeEach(async ({ page, request }) => {
  await ensureLocalTarget(request);
  await login(page);
});

// An offer made in a conversation waits in the Inbox, and approving it
// there runs it in that conversation.
test("an offer waits in the Inbox and can be approved there", async ({ page }) => {
  await newConversation(page);
  const conversation = page.url();
  await send(page, "propose echo inbox-approved-by-e2e on local");
  await expect(page.getByRole("region", { name: "Confirmation" })).toBeVisible();

  await page.getByRole("link", { name: /^Inbox/ }).click();
  const card = page.getByRole("region", { name: "Confirmation" }).filter({ hasText: "echo inbox-approved-by-e2e" });
  await expect(card).toBeVisible();
  await card.getByRole("button", { name: "Approve" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Approved." })).toBeVisible();

  await page.goto(conversation);
  await expect(page.getByText("inbox-approved-by-e2e", { exact: true })).toBeVisible({ timeout: 45_000 });
});
