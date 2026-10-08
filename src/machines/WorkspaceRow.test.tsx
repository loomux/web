import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthProvider } from "../lib/auth";
import type { WorkspaceSummary } from "../lib/api";
import { WorkspaceRow } from "./WorkspaceRow";

// LOOM-70's rules for what can be done to a workspace, ported from the old
// Workspaces page's tests: deleting is irreversible, so its guard is pinned.

function jsonResponse(body: unknown, status = 200) {
  return status === 204 ? new Response(null, { status }) : new Response(JSON.stringify(body), { status });
}

interface Call {
  method: string;
  url: string;
  body?: unknown;
}

function setup(ws: Partial<WorkspaceSummary>, respond: (c: Call) => Response = () => jsonResponse(null, 204)) {
  localStorage.setItem("loomux.token", "tok");
  const calls: Call[] = [];
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const c = { method: init?.method ?? "GET", url: String(input), body: init?.body ? JSON.parse(String(init.body)) : undefined };
    calls.push(c);
    return respond(c);
  }) as typeof fetch;
  const onChanged = vi.fn();
  const onDeleted = vi.fn();
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <ul>
          <WorkspaceRow ws={{ id: "w1", name: "ledger-api", target_id: "t1", status: "idle", ...ws }} onChanged={onChanged} onDeleted={onDeleted} />
        </ul>
      </AuthProvider>
    </QueryClientProvider>,
  );
  return { calls, onChanged, onDeleted };
}

describe("WorkspaceRow", () => {
  const originalFetch = globalThis.fetch;
  afterEach(() => {
    globalThis.fetch = originalFetch;
    localStorage.clear();
  });

  it("deletes only after a second, explicit confirmation", async () => {
    const { calls, onDeleted } = setup({}, () => jsonResponse({ sessions_not_killed: ["loomux-w1-a"] }));
    await userEvent.click(screen.getByRole("button", { name: "Delete" }));
    expect(calls).toHaveLength(0);
    expect(screen.getByText(/files on the machine are kept/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Yes, delete" }));
    await waitFor(() => expect(calls).toEqual([{ method: "DELETE", url: "/api/v1/workspaces/w1", body: undefined }]));
    await waitFor(() => expect(onDeleted).toHaveBeenCalledWith("ledger-api", 1));
  });

  it("sends nothing when the delete is cancelled", async () => {
    const { calls } = setup({});
    await userEvent.click(screen.getByRole("button", { name: "Delete" }));
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(calls).toHaveLength(0);
    expect(screen.queryByText(/files on the machine are kept/)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Delete" })).toBeInTheDocument();
  });

  it("shows why a workspace is broken, and reopens it", async () => {
    const { calls, onChanged } = setup({ status: "failed", status_reason: "workspace root is not writable" });
    expect(screen.getByText("Broken")).toBeInTheDocument();
    expect(screen.getByText("workspace root is not writable")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Reopen" }));
    await waitFor(() => expect(calls).toEqual([{ method: "PATCH", url: "/api/v1/workspaces/w1", body: { status: "idle" } }]));
    await waitFor(() => expect(onChanged).toHaveBeenCalled());
  });

  it("archives an idle workspace", async () => {
    const { calls } = setup({ status: "idle" });
    expect(screen.queryByRole("button", { name: "Reopen" })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Archive" }));
    await waitFor(() => expect(calls[0]).toMatchObject({ method: "PATCH", body: { status: "archived" } }));
  });

  it("offers Reopen, not Archive, on an archived workspace", () => {
    setup({ status: "archived" });
    expect(screen.getByRole("button", { name: "Reopen" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Archive" })).not.toBeInTheDocument();
  });

  it("offers only Delete on a workspace with an agent attached", () => {
    setup({ status: "active" });
    expect(screen.getByText("Agent attached")).toBeInTheDocument();
    expect(screen.getAllByRole("button").map((b) => b.textContent)).toEqual(["Delete"]);
  });

  it("offers nothing on a workspace still being set up", () => {
    setup({ status: "provisioning" });
    expect(screen.getByText("Setting up")).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("shows the server's reason when an action is refused", async () => {
    setup({ status: "idle" }, () => jsonResponse({ error: "workspace has a task still running" }, 409));
    await userEvent.click(screen.getByRole("button", { name: "Archive" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("workspace has a task still running");
  });
});
