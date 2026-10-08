import { expect, test } from "@playwright/test";
import { ensureLocalTarget, login } from "./helpers";

test.beforeEach(async ({ page, request }) => {
  await ensureLocalTarget(request);
  await login(page);
});

test("a machine's settings: test the connection, change what the router models see, save", async ({ page }) => {
  await page.getByRole("link", { name: "Machines" }).click();
  const machine = page.getByRole("region", { name: "local", exact: true });
  await machine.getByRole("link", { name: "Settings and checks" }).click();
  await expect(page.getByRole("heading", { name: "local", level: 1 })).toBeVisible();

  await page.getByRole("button", { name: "Test connection" }).click();
  await expect(page.getByRole("status").filter({ hasText: /^Reachable/ })).toBeVisible({ timeout: 20_000 });

  await page.getByRole("radio", { name: "Final answer only" }).click();
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByRole("button", { name: "Save changes" })).toHaveCount(0);

  await page.getByRole("link", { name: "Machines" }).first().click();
  await expect(page.getByRole("region", { name: "local", exact: true })).toContainText("The router models see: Final answer only");

  // Put it back for the other specs.
  await page.getByRole("region", { name: "local", exact: true }).getByRole("link", { name: "Settings and checks" }).click();
  await page.getByRole("radio", { name: /^Default/ }).click();
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByRole("button", { name: "Save changes" })).toHaveCount(0);
});

test("registering checks the form before it sends", async ({ page }) => {
  await page.goto("/machines/new");
  await page.getByLabel("Name").fill("nowhere");
  await page.getByRole("button", { name: "Register machine" }).click();
  await expect(page.getByRole("alert")).toHaveText("host and user are required for a remote target");
});
