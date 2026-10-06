import { expect, test } from "@playwright/test";
import { ensureLocalTarget, login, newConversation, send } from "./helpers";

test.beforeEach(async ({ page, request }) => {
  await ensureLocalTarget(request);
  await login(page);
});

test("a message gets a direct answer", async ({ page }) => {
  await newConversation(page);
  await send(page, "answer: the sky is blue");
  await expect(page.getByText("e2e answer: the sky is blue")).toBeVisible();
});

test("an exact order runs at once and shows its output and exit status", async ({ page }) => {
  await newConversation(page);
  await send(page, "run `echo hello-from-e2e` on local");
  await expect(page.getByText(/exit 0/)).toBeVisible();
  await expect(page.getByText("hello-from-e2e", { exact: true })).toBeVisible();
});
