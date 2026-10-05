import { describe, expect, it, vi, afterEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthProvider } from "../lib/auth";
import { CredentialsPage } from "./CredentialsPage";

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <MemoryRouter>
          <CredentialsPage />
        </MemoryRouter>
      </AuthProvider>
    </QueryClientProvider>,
  );
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status });
}

const CRED = {
  id: "cred-1",
  name: "GITHUB_TOKEN",
  workspace_id: "ws-1",
  agent_type: "claude-code",
  created_at: "2026-10-05T10:00:00Z",
  updated_at: "2026-10-05T10:00:00Z",
};

type Call = { method: string; url: string; body?: string };

// fakeServer answers the page's calls and records them.
function fakeServer(credentials: unknown[] = [CRED]) {
  const calls: Call[] = [];
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? "GET";
    calls.push({ method, url, body: init?.body as string | undefined });
    if (url === "/api/v1/workspaces")
      return jsonResponse({ workspaces: [{ id: "ws-1", name: "loomux-web", target_id: "t", status: "idle" }] });
    if (url === "/api/v1/credentials" && method === "GET") return jsonResponse({ credentials });
    if (url === "/api/v1/credentials" && method === "POST") return jsonResponse({ ...CRED, id: "cred-2" }, 201);
    if (method === "PUT" || method === "DELETE") return new Response(null, { status: 204 });
    throw new Error(`unexpected fetch: ${method} ${url}`);
  });
  return calls;
}

describe("CredentialsPage (LOOM-134)", () => {
  const originalFetch = globalThis.fetch;
  afterEach(() => {
    globalThis.fetch = originalFetch;
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it("lists names and scopes, never values", async () => {
    localStorage.setItem("loomux.token", "tok-1");
    fakeServer();
    renderPage();
    expect(await screen.findByText("GITHUB_TOKEN")).toBeInTheDocument();
    expect(screen.getByText(/workspace loomux-web, agent claude-code/)).toBeInTheDocument();
  });

  it("adds a credential, sending the value once", async () => {
    localStorage.setItem("loomux.token", "tok-1");
    const calls = fakeServer([]);
    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByRole("button", { name: "Add credential" }));
    const form = screen.getByRole("form", { name: "Add credential" });
    await user.type(within(form).getByLabelText(/Name/), "OPENAI_API_KEY");
    await user.type(within(form).getByLabelText("Value"), "sk-secret");
    expect(within(form).getByLabelText("Value")).toHaveAttribute("type", "password");
    await user.click(within(form).getByRole("button", { name: "Save" }));
    const post = calls.find((c) => c.method === "POST");
    expect(JSON.parse(post!.body!)).toEqual({ name: "OPENAI_API_KEY", value: "sk-secret" });
  });

  it("refuses a name that isn't an environment variable before sending", async () => {
    localStorage.setItem("loomux.token", "tok-1");
    const calls = fakeServer([]);
    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByRole("button", { name: "Add credential" }));
    const form = screen.getByRole("form", { name: "Add credential" });
    await user.type(within(form).getByLabelText(/Name/), "my-token");
    await user.type(within(form).getByLabelText("Value"), "x");
    await user.click(within(form).getByRole("button", { name: "Save" }));
    expect(await within(form).findByRole("alert")).toHaveTextContent(/environment variable/);
    expect(calls.some((c) => c.method === "POST")).toBe(false);
  });

  it("replaces a value and deletes after confirming", async () => {
    localStorage.setItem("loomux.token", "tok-1");
    const calls = fakeServer();
    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByRole("button", { name: "Replace value" }));
    await user.type(screen.getByLabelText("New value"), "ghp-new");
    await user.click(
      within(screen.getByRole("form", { name: "New value for GITHUB_TOKEN" })).getByRole("button", { name: "Save" }),
    );
    const put = calls.find((c) => c.method === "PUT");
    expect(put?.url).toBe("/api/v1/credentials/cred-1/value");
    expect(JSON.parse(put!.body!)).toEqual({ value: "ghp-new" });

    await user.click(screen.getByRole("button", { name: "Delete" }));
    expect(calls.some((c) => c.method === "DELETE")).toBe(false);
    await user.click(screen.getByRole("button", { name: "Delete GITHUB_TOKEN" }));
    expect(calls.find((c) => c.method === "DELETE")?.url).toBe("/api/v1/credentials/cred-1");
  });
});
