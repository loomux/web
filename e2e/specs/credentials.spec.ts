import { expect, test } from "@playwright/test";
import { login } from "./helpers";

test("add, replace and delete a credential; its value is never shown", async ({ page }) => {
  await login(page);
  await page.getByRole("link", { name: "Vault" }).click();
  const name = `E2E_TOKEN_${Date.now()}`;

  await page.getByRole("button", { name: "Add credential" }).click();
  const form = page.getByRole("form", { name: "Add credential" });
  await form.getByLabel(/Name/).fill(name);
  await form.getByLabel("Value").fill("first-secret-value");
  await form.getByRole("button", { name: "Save" }).click();
  const row = page.getByRole("listitem").filter({ hasText: name });
  await expect(row).toBeVisible();
  await expect(page.getByText("first-secret-value")).toHaveCount(0);

  await row.getByRole("button", { name: "Replace value" }).click();
  await row.getByRole("textbox", { name: "New value", exact: true }).fill("second-secret-value");
  await row.getByRole("button", { name: "Save" }).click();
  await expect(row.getByRole("textbox", { name: "New value", exact: true })).toHaveCount(0);

  await row.getByRole("button", { name: "Delete" }).click();
  await row.getByRole("button", { name: `Delete ${name}` }).click();
  await expect(page.getByRole("listitem").filter({ hasText: name })).toHaveCount(0);
  await expect(page.getByText(/second-secret-value/)).toHaveCount(0);
});
