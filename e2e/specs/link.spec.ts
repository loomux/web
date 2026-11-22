import AxeBuilder from "@axe-core/playwright";
import { createHash, randomBytes } from "node:crypto";
import { expect, test, type Request } from "@playwright/test";
import { login, password } from "./helpers";

// LOOM-273 (TUI W1): the link flow against a real loomuxd, with this file
// playing the terminal's half as `loomux login` (loomux/tui T2) does it
// (loomux/server docs/design/tui-client-design.md "The link flow"): make a
// token T, open /link#h=<hex(sha256(T))>&label=<host>, show the code, and
// poll GET /api/v1/sessions with T until it's 200.

const BASE32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

// The terminal's code, computed apart from src/lib/link.ts:
// first 8 of base32(sha256("loomux-link-v1:" + H)), as ABCD-EFGH.
function terminalCode(hash: string) {
  const digest = createHash("sha256").update(`loomux-link-v1:${hash}`).digest();
  const bits = [...digest.subarray(0, 5)].map((b) => b.toString(2).padStart(8, "0")).join("");
  let code = "";
  for (let i = 0; i < 40; i += 5) code += BASE32[parseInt(bits.slice(i, i + 5), 2)];
  return `${code.slice(0, 4)}-${code.slice(4)}`;
}

function newTerminal(label: string) {
  const token = randomBytes(32).toString("base64url");
  const hash = createHash("sha256").update(token).digest("hex");
  return { token, hash, code: terminalCode(hash), link: `/link#h=${hash}&label=${label}`, auth: { Authorization: `Bearer ${token}` } };
}

test("a terminal's link: its code shows, Approve signs it in, and the link can't be used twice", async ({ page, request }) => {
  const t = newTerminal("e2e-laptop");
  // The terminal's poll before approval.
  expect((await request.get("/api/v1/sessions", { headers: t.auth })).status()).toBe(401);

  await login(page);
  const calls: Request[] = [];
  page.on("request", (r) => {
    if (r.resourceType() === "fetch" || r.resourceType() === "xhr") calls.push(r);
  });
  await page.goto(t.link);
  await expect(page.getByText(t.code, { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Approve", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Approved");
  // Used up: out of the address.
  await expect(page).toHaveURL(/\/link$/);

  // The terminal's poll now gets in, as the labelled terminal session.
  const res = await request.get("/api/v1/sessions", { headers: t.auth });
  expect(res.status()).toBe(200);
  const current = (await res.json()).sessions.find((s: { current: boolean }) => s.current);
  expect(current).toMatchObject({ label: "e2e-laptop", client_kind: "tui" });

  // The page's only call carrying the link is the approval, with the hash
  // in its body: no URL the page fetched holds the hash or the label.
  expect(calls.filter((r) => r.url().includes(t.hash) || r.url().includes("e2e-laptop")).map((r) => r.url())).toEqual([]);
  const approvals = calls.filter((r) => (r.postData() ?? "").includes(t.hash));
  expect(approvals.map((r) => [r.method(), new URL(r.url()).pathname, r.postDataJSON()])).toEqual([
    ["POST", "/api/v1/sessions", { token_hash: t.hash, label: "e2e-laptop", client_kind: "tui" }],
  ]);

  // The same link again (a replay), in a new tab as a terminal opens it:
  // the server refuses it, and nothing changes.
  const again = await page.context().newPage();
  await again.goto(t.link);
  await expect(again.getByText(t.code, { exact: true })).toBeVisible();
  await again.getByRole("button", { name: "Approve", exact: true }).click();
  await expect(again.getByText(/this link was used already/i)).toBeVisible();
  const sessions = (await (await request.get("/api/v1/sessions", { headers: t.auth })).json()).sessions;
  expect(sessions.filter((s: { label: string }) => s.label === "e2e-laptop")).toHaveLength(1);

  // In the first tab, another terminal's link pasted over the decided one
  // asks for a reload rather than showing the old result.
  await page.goto(newTerminal("e2e-other").link);
  await expect(page.getByText(/the link in the address changed/i)).toBeVisible();
  await expect(page.getByRole("button", { name: "Approve", exact: true })).toHaveCount(0);
});

test("a link opened before the web's login comes back after it, fragment and all", async ({ page }) => {
  const t = newTerminal("e2e-desk");
  await page.goto(t.link);
  await expect(page).toHaveURL(/\/login$/);
  await page.getByLabel("Password").fill(password());
  await page.getByRole("button", { name: "Log in" }).click();
  await expect(page.getByText(t.code, { exact: true })).toBeVisible();
  expect(new URL(page.url()).hash).toBe(`#h=${t.hash}&label=e2e-desk`);
});

test("Don't approve signs nothing in", async ({ page, request }) => {
  const t = newTerminal("e2e-no");
  await login(page);
  await page.goto(t.link);
  await expect(page.getByText(t.code, { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Don't approve" }).click();
  await expect(page.getByText(/not approved/i)).toBeVisible();
  expect((await request.get("/api/v1/sessions", { headers: t.auth })).status()).toBe(401);
});

test("the link page fits a phone and passes axe in light and dark", async ({ page }) => {
  const t = newTerminal("e2e-phone");
  await login(page);
  await page.setViewportSize({ width: 390, height: 844 });
  for (const theme of ["light", "dark"]) {
    await page.evaluate((th) => localStorage.setItem("loomux.theme", th), theme);
    await page.goto(t.link);
    await expect(page.getByText(t.code, { exact: true })).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow, `link (${theme}) scrolls sideways`).toBeLessThanOrEqual(0);
    const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
    const bad = results.violations
      .filter((v) => v.impact === "serious" || v.impact === "critical")
      .map((v) => `${v.id}: ${v.nodes.slice(0, 2).map((n) => n.target.join(" ")).join(", ")}`);
    expect(bad, `link (${theme})`).toEqual([]);
  }
});
