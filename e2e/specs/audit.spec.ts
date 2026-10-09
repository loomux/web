import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { ensureLocalTarget, login, newConversation, send, turnDone } from "./helpers";

// LOOM-139 audit regressions. Tests marked test.fail() pin a bug that is
// still open: they pass while the bug is there and go red once it's fixed,
// which is the cue to drop the mark.

const phone = { width: 390, height: 844 };

async function axeSerious(page: Page) {
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
  return results.violations
    .filter((v) => v.impact === "serious" || v.impact === "critical")
    .map((v) => `${v.id}: ${v.nodes.slice(0, 2).map((n) => n.target.join(" ")).join(", ")}`);
}

test("every main screen fits a phone, passes axe and keeps the nav reachable", async ({ page, request }) => {
  test.setTimeout(120_000);
  await ensureLocalTarget(request);
  await login(page);
  await newConversation(page);
  await send(page, "answer: phone check");
  await turnDone(page);
  const conversation = page.url();
  await page.setViewportSize(phone);

  for (const theme of ["light", "dark"]) {
    await page.evaluate((t) => localStorage.setItem("loomux.theme", t), theme);
    for (const path of ["/", "/today", conversation, "/machines", "/vault", "/settings"]) {
      await page.goto(path);
      await page.waitForTimeout(800);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(overflow, `${path} (${theme}) scrolls sideways`).toBeLessThanOrEqual(0);
      expect(await axeSerious(page), `${path} (${theme})`).toEqual([]);
      await expect(page.getByRole("navigation").first()).toBeVisible();
    }
  }
});

// Agent and router output is rendered as markdown: it must never run
// script, load remote images or render raw HTML.
test("hostile markdown in a reply renders inert", async ({ page, baseURL }) => {
  const origin = new URL(baseURL!).origin;
  const dialogs: string[] = [];
  page.on("dialog", (d) => {
    dialogs.push(d.message());
    void d.dismiss();
  });
  const external: string[] = [];
  page.on("request", (r) => {
    if (new URL(r.url()).origin !== origin) external.push(r.url());
  });
  await login(page);
  await newConversation(page);
  await send(
    page,
    "answer: [click](javascript:alert(1)) <img src=x onerror=alert(2)> ![t](http://198.51.100.7/t.png) <script>alert(3)</script>",
  );
  await expect(page.getByText(/e2e answer:/)).toBeVisible();
  await turnDone(page);
  await page.waitForTimeout(500);

  const log = page.getByRole("log");
  expect(await log.locator("img").count()).toBe(0);
  expect(await log.locator("script").count()).toBe(0);
  for (const href of await log.locator("a").evaluateAll((as) => as.map((a) => a.getAttribute("href") ?? ""))) {
    expect(href).not.toMatch(/^\s*javascript:/i);
  }
  await page.getByRole("link", { name: "click" }).click().catch(() => undefined);
  expect(dialogs).toEqual([]);
  expect(external).toEqual([]);
});

// F10: a dispatch that fails with something other than 409 (a 5xx or a
// dropped connection) must give the text back and leave no stuck bubble.
test("a failed send gives the draft back", async ({ page }) => {
  test.fail(true, "LOOM-139 finding F10: the optimistic message sticks and the draft is lost");
  await login(page);
  await newConversation(page);
  await expect(page.getByPlaceholder("Message the agent fleet…")).toBeVisible();
  await page.route("**/api/v1/dispatch", (route) => route.abort("connectionreset"));
  await send(page, "answer: this send will fail");
  await expect(page.getByPlaceholder("Message the agent fleet…")).toHaveValue("answer: this send will fail", { timeout: 5_000 });
});

// F20: while the server is down the stream must back off, not reconnect
// every second for as long as the page is open.
test("the conversation stream backs off while the server is unreachable", async ({ page }) => {
  test.fail(true, "LOOM-139 finding F20: fixed 1s retry, no backoff");
  await login(page);
  await newConversation(page);
  await send(page, "answer: stream check");
  await turnDone(page);
  let attempts = 0;
  await page.route("**/api/v1/conversations/*/stream", (route) => {
    attempts++;
    return route.fulfill({ status: 502, body: "bad gateway" });
  });
  await page.reload();
  await expect(page.getByText("Reconnecting…")).toBeVisible({ timeout: 10_000 });
  // The precondition holds even with the bug, so test.fail() can only
  // be satisfied by the bound below.
  expect(attempts).toBeGreaterThan(0);
  attempts = 0;
  await page.waitForTimeout(12_000);
  // With backoff from 1s doubling, 12s holds at most ~4 attempts.
  expect(attempts).toBeLessThanOrEqual(5);
});

// F32: an impossible date in the URL is not a real day.
test("an impossible date in /today/:date is refused", async ({ page }) => {
  await login(page);
  await page.goto("/today/2026-13-45");
  await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
  await expect(page.getByRole("heading", { level: 1 })).not.toHaveText(/February/);
});

// LOOM-143: the app shell ships browser hardening headers (it holds the
// bearer token in localStorage).
test("the app shell is served with CSP and framing protection", async ({ request }) => {
  const res = await request.get("/");
  const h = res.headers();
  expect(h["content-security-policy"] ?? "").toContain("frame-ancestors");
  expect(h["x-content-type-options"]).toBe("nosniff");
});
