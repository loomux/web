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

// LOOM-151: someone else's failed logins don't hold off a browser that
// has logged in before: it sends its device token and has its own
// backoff. (Without the token this login would get 429 for a second or
// two.)
test("someone else's failed logins don't lock this browser out", async ({ page, request }) => {
  await login(page);
  await page.getByRole("button", { name: "Log out" }).click();
  await expect(page).toHaveURL(/\/login$/);

  for (const guess of ["stranger-1", "stranger-2"]) {
    const res = await request.post("/api/v1/login", { data: { password: guess } });
    expect([401, 429]).toContain(res.status());
  }
  const blocked = await request.post("/api/v1/login", { data: { password: process.env.E2E_PASSWORD } });
  expect(blocked.status()).toBe(429);

  await login(page);

  // Leave no global backoff for the next spec's device-less API logins:
  // wait it out (a 429 records no failure, so polling is safe).
  await expect
    .poll(async () => (await request.post("/api/v1/login", { data: { password: process.env.E2E_PASSWORD } })).status(), {
      timeout: 10_000,
    })
    .toBe(200);
});
