import { expect, test } from "@playwright/test";
import { login } from "./helpers";

test("a wrong password is refused, the right one logs in, logout returns to login", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/login$/);
  await page.getByLabel("Password").fill("not-the-password");
  await page.getByRole("button", { name: "Log in" }).click();
  await expect(page.getByText(/invalid password/i)).toBeVisible();
  // A failed login holds off the next one for a second (login backoff).
  await page.waitForTimeout(1_500);

  await login(page);
  await page.getByRole("button", { name: "Log out" }).click();
  await expect(page).toHaveURL(/\/login$/);
});

test("a deep link survives the login: it lands on the page asked for", async ({ page }) => {
  await page.goto("/targets?probe=1");
  await expect(page).toHaveURL(/\/login$/);
  await page.getByLabel("Password").fill(process.env.E2E_PASSWORD!);
  await page.getByRole("button", { name: "Log in" }).click();
  await expect(page).toHaveURL(/\/targets\?probe=1$/);
});
