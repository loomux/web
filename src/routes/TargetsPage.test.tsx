import { describe, expect, it, vi, afterEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthProvider } from "../lib/auth";
import { TargetsPage } from "./TargetsPage";

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <MemoryRouter>
          <TargetsPage />
        </MemoryRouter>
      </AuthProvider>
    </QueryClientProvider>,
  );
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status });
}

const REMOTE_TARGET = {
  id: "tgt-remote",
  name: "beta-remote",
  kind: "remote",
  host: "beta.example",
  user: "agent",
  // A pre-1.0 server still returns it; the client ignores it (API v1 drops it).
  ssh_key_ref: "vault://keys/beta",
  workspace_root: "/srv/loomux",
  permission_mode: "auto",
  purpose: "",
  allowed_agent_types: [],
  allow_provision: true,
  allow_shell: true,
  require_confirmation: false,
  created_at: "2026-09-01T00:00:00Z",
  updated_at: "2026-09-01T00:00:00Z",
};

const LOCAL_TARGET = {
  id: "tgt-local",
  name: "alpha-local",
  kind: "local",
  host: "",
  user: "",
  created_at: "2026-09-01T00:00:00Z",
  updated_at: "2026-09-01T00:00:00Z",
};

function rowFor(name: string): HTMLElement {
  const row = screen.getByText(name).closest("li");
  if (!row) throw new Error(`no row for ${name}`);
  return row as HTMLElement;
}

describe("TargetsPage", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it("lists targets alphabetically with kind, destination and workspace counts", async () => {
    localStorage.setItem("loomux.token", "tok-1");

    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === "/api/v1/targets") {
        return jsonResponse({ targets: [REMOTE_TARGET, LOCAL_TARGET] });
      }
      if (url === "/api/v1/workspaces") {
        return jsonResponse({
          workspaces: [
            { id: "ws-1", name: "One", target_id: "tgt-remote", status: "online" },
            { id: "ws-2", name: "Two", target_id: "tgt-remote", status: "online" },
          ],
        });
      }
      throw new Error(`unexpected fetch: ${url}`);
    });

    renderPage();

    const names = await screen.findAllByText(/alpha-local|beta-remote/);
    expect(names.map((n) => n.textContent)).toEqual(["alpha-local", "beta-remote"]);

    const local = rowFor("alpha-local");
    expect(within(local).getByText("local")).toBeInTheDocument();
    expect(within(local).getByText("this host")).toBeInTheDocument();

    const remote = rowFor("beta-remote");
    expect(within(remote).getByText("remote")).toBeInTheDocument();
    expect(within(remote).getByText("agent@beta.example")).toBeInTheDocument();
    expect(within(remote).getByText(/2 workspaces reference this target/)).toBeInTheDocument();
    // A target's permission mode shows on its row; the default shows nothing.
    expect(within(remote).getByText("Permissions: auto")).toBeInTheDocument();
    expect(within(local).queryByText(/Permissions:/)).not.toBeInTheDocument();
    expect(within(remote).queryByText(/Policy:/)).not.toBeInTheDocument();
  });

  it("filters by kind when a chip is clicked", async () => {
    localStorage.setItem("loomux.token", "tok-1");
    const user = userEvent.setup();

    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === "/api/v1/targets") {
        return jsonResponse({ targets: [REMOTE_TARGET, LOCAL_TARGET] });
      }
      if (url === "/api/v1/workspaces") return jsonResponse({ workspaces: [] });
      throw new Error(`unexpected fetch: ${url}`);
    });

    renderPage();

    expect(await screen.findByText("alpha-local")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Remote" }));

    expect(screen.queryByText("alpha-local")).not.toBeInTheDocument();
    expect(screen.getByText("beta-remote")).toBeInTheDocument();
  });

  it("registers a remote target and sends the trimmed body", async () => {
    localStorage.setItem("loomux.token", "tok-1");
    const user = userEvent.setup();
    let created: unknown = null;

    globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === "/api/v1/targets" && init?.method === "POST") {
        created = JSON.parse(String(init.body));
        return jsonResponse({ ...REMOTE_TARGET, id: "tgt-new", name: "gamma" }, 201);
      }
      if (url === "/api/v1/targets") {
        return jsonResponse({ targets: created ? [{ ...REMOTE_TARGET, id: "tgt-new", name: "gamma" }] : [] });
      }
      if (url === "/api/v1/workspaces") return jsonResponse({ workspaces: [] });
      throw new Error(`unexpected fetch: ${url}`);
    });

    renderPage();

    await user.click(await screen.findByRole("button", { name: "Register target" }));
    await user.type(screen.getByLabelText("Name"), "  gamma  ");
    await user.type(screen.getByLabelText("Host"), "gamma.example");
    await user.type(screen.getByLabelText("User"), "agent");
    await user.click(screen.getByRole("button", { name: "Register" }));

    await screen.findByText("gamma");
    expect(created).toEqual({
      name: "gamma",
      kind: "remote",
      host: "gamma.example",
      user: "agent",
      workspace_root: "",
      permission_mode: "",
      purpose: "",
      allowed_agent_types: [],
      allow_provision: true,
      allow_shell: true,
      require_confirmation: false,
    });
  });

  it("hides host and user for a local target and never sends them", async () => {
    localStorage.setItem("loomux.token", "tok-1");
    const user = userEvent.setup();
    let created: Record<string, unknown> | null = null;

    globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === "/api/v1/targets" && init?.method === "POST") {
        created = JSON.parse(String(init.body));
        return jsonResponse({ ...LOCAL_TARGET, id: "tgt-new", name: "box" }, 201);
      }
      if (url === "/api/v1/targets") return jsonResponse({ targets: [] });
      if (url === "/api/v1/workspaces") return jsonResponse({ workspaces: [] });
      throw new Error(`unexpected fetch: ${url}`);
    });

    renderPage();

    await user.click(await screen.findByRole("button", { name: "Register target" }));
    await user.type(screen.getByLabelText("Name"), "box");
    expect(screen.getByLabelText("Host")).toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText("Kind"), "local");
    expect(screen.queryByLabelText("Host")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("User")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Register" }));

    expect(created).toEqual({
      name: "box",
      kind: "local",
      host: "",
      user: "",
      workspace_root: "",
      permission_mode: "",
      purpose: "",
      allowed_agent_types: [],
      allow_provision: true,
      allow_shell: true,
      require_confirmation: false,
    });
  });

  it("rejects a remote target with no host before calling the server", async () => {
    localStorage.setItem("loomux.token", "tok-1");
    const user = userEvent.setup();

    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (init?.method === "POST") throw new Error("the client should not have submitted");
      if (url === "/api/v1/targets") return jsonResponse({ targets: [] });
      if (url === "/api/v1/workspaces") return jsonResponse({ workspaces: [] });
      throw new Error(`unexpected fetch: ${url}`);
    });
    globalThis.fetch = fetchMock;

    renderPage();

    await user.click(await screen.findByRole("button", { name: "Register target" }));
    await user.type(screen.getByLabelText("Name"), "gamma");
    await user.click(screen.getByRole("button", { name: "Register" }));

    expect(
      await screen.findByText("host and user are required for a remote target"),
    ).toBeInTheDocument();
    expect(fetchMock.mock.calls.some((call) => call[1]?.method === "POST")).toBe(false);
  });

  it("surfaces the server's duplicate-name 409", async () => {
    localStorage.setItem("loomux.token", "tok-1");
    const user = userEvent.setup();

    globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === "/api/v1/targets" && init?.method === "POST") {
        return jsonResponse({ error: "a target with that name already exists" }, 409);
      }
      if (url === "/api/v1/targets") return jsonResponse({ targets: [REMOTE_TARGET] });
      if (url === "/api/v1/workspaces") return jsonResponse({ workspaces: [] });
      throw new Error(`unexpected fetch: ${url}`);
    });

    renderPage();

    await user.click(await screen.findByRole("button", { name: "Register target" }));
    await user.type(screen.getByLabelText("Name"), "beta-remote");
    await user.type(screen.getByLabelText("Host"), "beta.example");
    await user.type(screen.getByLabelText("User"), "agent");
    await user.click(screen.getByRole("button", { name: "Register" }));

    expect(
      await screen.findByText("a target with that name already exists"),
    ).toBeInTheDocument();
  });

  it("edits via PUT, round-tripping workspace_root, and sets permission_mode", async () => {
    localStorage.setItem("loomux.token", "tok-1");
    const user = userEvent.setup();
    let put: unknown = null;

    globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === "/api/v1/targets/tgt-remote" && init?.method === "PUT") {
        put = JSON.parse(String(init.body));
        return jsonResponse({ ...REMOTE_TARGET, user: "runner" });
      }
      if (url === "/api/v1/targets") return jsonResponse({ targets: [REMOTE_TARGET] });
      if (url === "/api/v1/workspaces") return jsonResponse({ workspaces: [] });
      throw new Error(`unexpected fetch: ${url}`);
    });

    renderPage();

    await user.click(await screen.findByRole("button", { name: "Edit" }));

    // The form is pre-filled from the stored row, including the field the
    // UI would otherwise drop — PUT replaces the record wholesale. The SSH
    // key reference is gone from the API (v1) and from the form.
    expect(screen.getByLabelText("Name")).toHaveValue("beta-remote");
    expect(screen.queryByLabelText(/SSH key reference/)).not.toBeInTheDocument();
    expect(screen.getByLabelText(/Workspace root/)).toHaveValue("/srv/loomux");

    expect(screen.getByLabelText(/Permission mode/)).toHaveValue("auto");

    await user.clear(screen.getByLabelText("User"));
    await user.type(screen.getByLabelText("User"), "runner");
    await user.selectOptions(screen.getByLabelText(/Permission mode/), "manual");
    await user.selectOptions(screen.getByLabelText(/Purpose/), "work");
    await user.type(screen.getByLabelText(/Allowed agent types/), "claude-code");
    await user.click(screen.getByLabelText(/Allow new workspaces/));
    await user.click(screen.getByLabelText(/Ask me before starting new work/));
    // Each mode says what it means.
    expect(screen.getByText(/Every file edit and command waits for approval/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Save changes" }));

    await vi.waitFor(() => expect(put).not.toBeNull());
    expect(put).toEqual({
      name: "beta-remote",
      kind: "remote",
      host: "beta.example",
      user: "runner",
      workspace_root: "/srv/loomux",
      permission_mode: "manual",
      purpose: "work",
      allowed_agent_types: ["claude-code"],
      allow_provision: false,
      allow_shell: true,
      require_confirmation: true,
    });
  });

  it("deletes a target after confirmation", async () => {
    localStorage.setItem("loomux.token", "tok-1");
    const user = userEvent.setup();
    let deleted = false;

    globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === "/api/v1/targets/tgt-remote" && init?.method === "DELETE") {
        deleted = true;
        return new Response(null, { status: 204 });
      }
      if (url === "/api/v1/targets") {
        return jsonResponse({ targets: deleted ? [] : [REMOTE_TARGET] });
      }
      if (url === "/api/v1/workspaces") return jsonResponse({ workspaces: [] });
      throw new Error(`unexpected fetch: ${url}`);
    });

    renderPage();

    await user.click(await screen.findByRole("button", { name: "Delete" }));
    await user.click(screen.getByRole("button", { name: "Confirm delete" }));

    await vi.waitFor(() => expect(deleted).toBe(true));
    expect(await screen.findByText(/No targets registered yet/)).toBeInTheDocument();
  });

  it("surfaces the FK-RESTRICT 409 with an actionable hint", async () => {
    localStorage.setItem("loomux.token", "tok-1");
    const user = userEvent.setup();

    globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === "/api/v1/targets/tgt-remote" && init?.method === "DELETE") {
        return jsonResponse({ error: "target still has workspaces referencing it" }, 409);
      }
      if (url === "/api/v1/targets") return jsonResponse({ targets: [REMOTE_TARGET] });
      if (url === "/api/v1/workspaces") {
        return jsonResponse({
          workspaces: [{ id: "ws-1", name: "One", target_id: "tgt-remote", status: "online" }],
        });
      }
      throw new Error(`unexpected fetch: ${url}`);
    });

    renderPage();

    await user.click(await screen.findByRole("button", { name: "Delete" }));

    // The reference count warns before the click, not only after the failure.
    expect(screen.getByText(/The server will refuse this/)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Confirm delete" }));

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("target still has workspaces referencing it");
    expect(alert.textContent).toContain("remove or repoint those workspaces first");
    expect(screen.getByText("beta-remote")).toBeInTheDocument();
  });

  it("does not show the empty state when the targets fetch fails", async () => {
    localStorage.setItem("loomux.token", "tok-1");

    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === "/api/v1/targets") return jsonResponse({ error: "server error" }, 500);
      if (url === "/api/v1/workspaces") return jsonResponse({ workspaces: [] });
      throw new Error(`unexpected fetch: ${url}`);
    });

    renderPage();

    expect(await screen.findByText(/server error/i)).toBeInTheDocument();
    expect(screen.queryByText(/No targets registered yet/i)).not.toBeInTheDocument();
  });
});
