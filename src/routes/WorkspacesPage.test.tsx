// LOOM-70: archive, reopen and delete a workspace from the Workspaces page.
import { describe, expect, it, vi, afterEach, beforeEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthProvider } from "../lib/auth";
import { WorkspacesPage } from "./WorkspacesPage";

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <MemoryRouter>
          <WorkspacesPage />
        </MemoryRouter>
      </AuthProvider>
    </QueryClientProvider>,
  );
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status });
}

interface Call {
  method: string;
  url: string;
  body?: unknown;
}

function fakeServer(
  workspaces: Record<string, unknown>[],
  respond: (c: Call) => Response | undefined = () => undefined,
) {
  const calls: Call[] = [];
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? "GET";
    if (url === "/api/v1/workspaces" && method === "GET") return jsonResponse({ workspaces });
    const call = { method, url, body: init?.body ? JSON.parse(String(init.body)) : undefined };
    calls.push(call);
    return respond(call) ?? new Response(null, { status: 204 });
  });
  return calls;
}

function rowFor(name: string): HTMLElement {
  const row = screen.getByText(name).closest("li");
  if (!row) throw new Error(`no row for ${name}`);
  return row as HTMLElement;
}

const ws = (id: string, name: string, status: string, extra: Record<string, unknown> = {}) => ({
  id,
  name,
  target_id: "jet01",
  status,
  ...extra,
});

describe("WorkspacesPage (LOOM-70)", () => {
  const originalFetch = globalThis.fetch;
  beforeEach(() => localStorage.setItem("loomux.token", "tok-1"));
  afterEach(() => {
    globalThis.fetch = originalFetch;
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it("shows why a workspace failed, and reopens it", async () => {
    const user = userEvent.setup();
    const calls = fakeServer([ws("w1", "broken-clone", "failed", { status_reason: "git clone exited 128" })]);
    renderPage();
    const row = await screen.findByText("broken-clone").then(() => rowFor("broken-clone"));
    expect(row).toHaveTextContent("git clone exited 128");
    await user.click(within(row).getByRole("button", { name: /reopen/i }));
    await waitFor(() =>
      expect(calls).toContainEqual({ method: "PATCH", url: "/api/v1/workspaces/w1", body: { status: "idle" } }),
    );
  });

  it("archives an idle workspace; an archived one can be reopened, not archived", async () => {
    const user = userEvent.setup();
    const calls = fakeServer([ws("w1", "app", "idle"), ws("w2", "old", "archived")]);
    renderPage();
    await screen.findByText("app");
    expect(within(rowFor("app")).queryByRole("button", { name: /reopen/i })).not.toBeInTheDocument();
    expect(within(rowFor("old")).queryByRole("button", { name: /archive/i })).not.toBeInTheDocument();
    await user.click(within(rowFor("app")).getByRole("button", { name: /archive/i }));
    await waitFor(() =>
      expect(calls).toContainEqual({ method: "PATCH", url: "/api/v1/workspaces/w1", body: { status: "archived" } }),
    );
  });

  it("deletes only after a second, explicit confirmation", async () => {
    const user = userEvent.setup();
    const calls = fakeServer([ws("w1", "scratch", "idle")], (c) =>
      c.method === "DELETE" ? jsonResponse({ sessions_not_killed: [] }) : undefined,
    );
    renderPage();
    await screen.findByText("scratch");
    await user.click(within(rowFor("scratch")).getByRole("button", { name: /^delete$/i }));
    expect(calls).toHaveLength(0);
    expect(rowFor("scratch")).toHaveTextContent(/files on the machine are kept/i);
    await user.click(within(rowFor("scratch")).getByRole("button", { name: /cancel/i }));
    expect(within(rowFor("scratch")).queryByRole("button", { name: /yes, delete/i })).not.toBeInTheDocument();

    await user.click(within(rowFor("scratch")).getByRole("button", { name: /^delete$/i }));
    await user.click(within(rowFor("scratch")).getByRole("button", { name: /yes, delete/i }));
    await waitFor(() => expect(calls).toContainEqual({ method: "DELETE", url: "/api/v1/workspaces/w1", body: undefined }));
  });

  it("shows the server's reason when an action is refused", async () => {
    const user = userEvent.setup();
    fakeServer([ws("w1", "busy", "active")], (c) =>
      c.method === "DELETE"
        ? jsonResponse({ error: "a task in this workspace is mid-turn; cancel it or wait for it to finish" }, 409)
        : undefined,
    );
    renderPage();
    await screen.findByText("busy");
    await user.click(within(rowFor("busy")).getByRole("button", { name: /^delete$/i }));
    await user.click(within(rowFor("busy")).getByRole("button", { name: /yes, delete/i }));
    expect(await within(rowFor("busy")).findByText(/mid-turn; cancel it/i)).toBeInTheDocument();
  });

  it("offers nothing on a workspace still provisioning", async () => {
    fakeServer([ws("w1", "new-one", "provisioning")]);
    renderPage();
    await screen.findByText("new-one");
    expect(within(rowFor("new-one")).queryAllByRole("button")).toHaveLength(0);
  });
});
