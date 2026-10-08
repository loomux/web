import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { ensureLocalTarget, login, newConversation, send } from "./helpers";

// Every main screen, in both themes, has no serious or critical axe
// violations (build-plan §6 PR 8).
async function check(page: Page, what: string) {
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
  const bad = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
  expect(
    bad.map((v) => `${what}: ${v.id} (${v.impact}) ${v.nodes.slice(0, 3).map((n) => `${n.target.join(" ")} [${(n.failureSummary ?? "").replace(/\s+/g, " ").slice(0, 160)}] ${n.html.slice(0, 80)}`).join(" | ")}`),
  ).toEqual([]);
}

test("the main screens pass axe in light and dark", async ({ page, request }) => {
  test.setTimeout(120_000);
  await ensureLocalTarget(request);
  await page.goto("/login");
  await check(page, "login");
  await login(page);
  await newConversation(page);
  await send(page, "propose echo a11y-check on local");
  await expect(page.getByRole("region", { name: "Confirmation" })).toBeVisible();
  const conversation = page.url();

  for (const theme of ["light", "dark"]) {
    await page.evaluate((t) => localStorage.setItem("loomux.theme", t), theme);
    for (const [path, what] of [
      ["/", "inbox"],
      ["/today", "today"],
      [conversation, "conversation"],
      ["/machines", "machines"],
      ["/vault", "vault"],
      ["/settings", "settings"],
    ]) {
      await page.goto(path);
      await page.waitForTimeout(800);
      await check(page, `${what} (${theme})`);
    }
  }
});
