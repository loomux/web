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
  await page.goto("/machines?probe=1");
  await expect(page).toHaveURL(/\/login$/);
  await page.getByLabel("Password").fill(process.env.E2E_PASSWORD!);
  await page.getByRole("button", { name: "Log in" }).click();
  await expect(page).toHaveURL(/\/machines\?probe=1$/);
});

test("a moved address still works: /targets goes to Machines, keeping its query", async ({ page }) => {
  await login(page);
  await page.goto("/targets?probe=1");
  await expect(page).toHaveURL(/\/machines\?probe=1$/);
  await page.goto("/credentials");
  await expect(page).toHaveURL(/\/vault$/);
});

test("an unknown address shows a way home", async ({ page }) => {
  await login(page);
  await page.goto("/no-such-page");
  await expect(page.getByRole("heading", { name: /nothing at this address/i })).toBeVisible();
  await page.getByRole("link", { name: "Go to the Inbox" }).click();
  await expect(page).toHaveURL(/\/$/);
});
