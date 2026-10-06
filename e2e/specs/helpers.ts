import { expect, type APIRequestContext, type Page } from "@playwright/test";

export const password = () => process.env.E2E_PASSWORD!;

// Logs in through the login page and waits for the app behind it (the
// page it lands on depends on where the login was asked from).
export async function login(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Password").fill(password());
  await page.getByRole("button", { name: "Log in" }).click();
  await expect(page.getByRole("button", { name: "Log out" })).toBeVisible();
}

// A session token for API calls a test makes behind the UI's back
// (registering a target, reading state).
export async function apiToken(request: APIRequestContext): Promise<string> {
  const res = await request.post("/api/v1/login", { data: { password: password() } });
  expect(res.ok()).toBeTruthy();
  return (await res.json()).token;
}

// The local target every test works on: inside the loomuxd container, with
// the stand-in claude on its PATH. Registered once per database.
export async function ensureLocalTarget(request: APIRequestContext) {
  const token = await apiToken(request);
  const headers = { Authorization: `Bearer ${token}` };
  const list = await (await request.get("/api/v1/targets", { headers })).json();
  if (!list.targets.some((t: { name: string }) => t.name === "local")) {
    const res = await request.post("/api/v1/targets", { headers, data: { name: "local", kind: "local" } });
    expect(res.status()).toBe(201);
  }
}

// Opens a new conversation from the dashboard.
export async function newConversation(page: Page) {
  await page.goto("/");
  await page.getByRole("button", { name: "New conversation" }).click();
  await expect(page).toHaveURL(/\/conversations\//);
  await expect(page.getByPlaceholder("Message the agent fleet…")).toBeVisible();
}

// Waits for the turn in flight to end: the composer's button reads "Send"
// again. A reply can show before its task is recorded as finished.
export async function turnDone(page: Page) {
  await expect(page.getByRole("button", { name: "Send", exact: true })).toBeVisible({ timeout: 45_000 });
}

// Sends a message from the conversation page's composer.
export async function send(page: Page, text: string) {
  const composer = page.getByPlaceholder("Message the agent fleet…");
  await composer.fill(text);
  await page.getByRole("button", { name: "Send", exact: true }).click();
}
