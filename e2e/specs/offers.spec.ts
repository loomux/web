import { expect, test } from "@playwright/test";
import { ensureLocalTarget, login, newConversation, send } from "./helpers";

test.beforeEach(async ({ page, request }) => {
  await ensureLocalTarget(request);
  await login(page);
});

test("Approve runs an offered command", async ({ page }) => {
  await newConversation(page);
  await send(page, "propose echo approved-by-e2e on local");
  const card = page.getByRole("region", { name: "Confirmation" });
  await expect(card).toBeVisible();
  await card.getByRole("button", { name: "Approve" }).click();
  await expect(card).toContainText("Approved");
  await expect(page.getByText("approved-by-e2e", { exact: true })).toBeVisible();
});

test("Deny runs nothing", async ({ page }) => {
  await newConversation(page);
  await send(page, "propose echo denied-by-e2e on local");
  const card = page.getByRole("region", { name: "Confirmation" });
  await card.getByRole("button", { name: "Deny" }).click();
  await expect(card).toContainText("Denied");
  await expect(page.getByText(/exit \d+/)).toHaveCount(0);
});
