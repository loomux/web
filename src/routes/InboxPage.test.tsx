import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthProvider } from "../lib/auth";
import { InboxPage } from "./InboxPage";

const MIN = 60_000;
const DAY = 24 * 60 * MIN;
const iso = (offset: number) => new Date(Date.now() + offset).toISOString();

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status });
}

const conversations = [
  { conversation_id: "restart", workspace_id: "w-infra", status: "completed", updated_at: iso(-2 * MIN), preview: "Restart the staging ledger deploy" },
  { conversation_id: "changelog", workspace_id: "w-blog", status: "running", updated_at: iso(-3 * MIN), preview: "Draft the October changelog post" },
  { conversation_id: "backup", workspace_id: "", status: "completed", updated_at: iso(-60 * MIN), preview: "Why is the nightly backup job slow?" },
  { conversation_id: "notebook", workspace_id: "w-nb", status: "awaiting_input", updated_at: iso(-2 * DAY), preview: "Clean up old notebook outputs" },
];

function serve() {
  const dispatched: unknown[] = [];
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url === "/api/v1/conversations") return jsonResponse({ conversations });
    if (url === "/api/v1/workspaces") {
      return jsonResponse({
        workspaces: [
          { id: "w-infra", name: "infra-terraform", target_id: "t", status: "idle" },
          { id: "w-blog", name: "blog-rewrite", target_id: "t", status: "active" },
        ],
      });
    }
    if (url === "/api/v1/conversations/restart") {
      return jsonResponse({
        conversation_id: "restart",
        tasks: [],
        messages: [],
        dispatches: [],
        confirmations: [
          {
            id: "o1",
            kind: "run_command",
            command: "kubectl -n staging rollout restart deploy/ledger-api",
            target_name: "kestrel",
            status: "pending",
            created_at: iso(-2 * MIN),
            expires_at: iso(4 * MIN),
          },
        ],
      });
    }
    if (url === "/api/v1/conversations/notebook") {
      return jsonResponse({
        conversation_id: "notebook",
        tasks: [
          { id: "k-nb", workspace_id: "w-nb", kind: "agent", agent_type: "claude-code", status: "awaiting_input", created_at: iso(-3 * DAY), updated_at: iso(-2 * DAY) },
        ],
        messages: [],
        dispatches: [],
        confirmations: [],
      });
    }
    if (url.startsWith("/api/v1/conversations/")) {
      return jsonResponse({ conversation_id: url.split("/").pop(), tasks: [], messages: [], dispatches: [], confirmations: [] });
    }
    if (url === "/api/v1/dispatch") {
      dispatched.push(JSON.parse(String(init?.body)));
      return jsonResponse({ dispatch_id: "d9", status: "queued" }, 202);
    }
    return jsonResponse({ error: "not found" }, 404);
  }) as typeof fetch;
  return dispatched;
}

function renderInbox() {
  localStorage.setItem("loomux.token", "tok");
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const router = createMemoryRouter(
    [
      { path: "/", element: <InboxPage /> },
      { path: "/conversations/:id", element: <p>conversation page</p> },
      { path: "/today", element: <p>today page</p> },
    ],
    { initialEntries: ["/"] },
  );
  render(
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <RouterProvider router={router} />
      </AuthProvider>
    </QueryClientProvider>,
  );
  return router;
}

describe("InboxPage", () => {
  const originalFetch = globalThis.fetch;
  afterEach(() => {
    globalThis.fetch = originalFetch;
    localStorage.clear();
  });

  it("puts what needs you first, folds what's been waiting a day, and shows activity beside it", async () => {
    serve();
    renderInbox();
    expect(await screen.findByRole("heading", { name: "Inbox" })).toBeInTheDocument();
    const offer = await screen.findByRole("region", { name: "Confirmation" });
    expect(offer).toHaveTextContent("kubectl -n staging rollout restart deploy/ledger-api");
    expect(screen.getByText("Older, still waiting (1)")).toBeInTheDocument();
    expect(screen.getByText("2 things need you.")).toBeInTheDocument();

    const activity = screen.getByRole("complementary", { name: "Activity" });
    const working = within(activity).getByRole("region", { name: "Working" });
    expect(within(working).getByRole("link", { name: /Draft the October changelog post/ })).toHaveTextContent("blog-rewrite");
    const done = within(activity).getByRole("region", { name: "Done today" });
    expect(within(done).getByText("Why is the nightly backup job slow?")).toBeInTheDocument();
  });

  it("approves from the Inbox and leaves a note of what happened", async () => {
    const dispatched = serve();
    renderInbox();
    const offer = await screen.findByRole("region", { name: "Confirmation" });
    await userEvent.click(within(offer).getByRole("button", { name: "Approve" }));
    expect(dispatched).toEqual([expect.objectContaining({ conversation_id: "restart", message: "yes", confirmation_id: "o1" })]);
    const note = await screen.findByRole("status");
    expect(note).toHaveTextContent("Approved.");
    expect(screen.queryByRole("button", { name: "Approve" })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Dismiss" }));
    expect(screen.queryByText("Approved.")).not.toBeInTheDocument();
  });

  it("snoozes until tomorrow, and can bring it back", async () => {
    serve();
    renderInbox();
    await userEvent.click(await screen.findByText("Older, still waiting (1)"));
    await userEvent.click(screen.getByRole("button", { name: "Snooze until tomorrow" }));
    await waitFor(() => expect(screen.getByText("1 thing needs you.")).toBeInTheDocument());
    expect(screen.queryByText(/Older, still waiting/)).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "1 snoozed (show)" }));
    await userEvent.click(screen.getByRole("button", { name: "Unsnooze" }));
    await waitFor(() => expect(screen.getByText("2 things need you.")).toBeInTheDocument());
  });

  it("starts a new conversation at a fresh id", async () => {
    serve();
    const router = renderInbox();
    await userEvent.click(await screen.findByRole("button", { name: "New conversation" }));
    expect(router.state.location.pathname).toMatch(/^\/conversations\/[0-9a-f-]{36}$/);
  });

  it("says when everything is answered", async () => {
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) =>
      String(input) === "/api/v1/conversations" ? jsonResponse({ conversations: [] }) : jsonResponse({ workspaces: [] }),
    ) as typeof fetch;
    renderInbox();
    expect(await screen.findByText("You're all caught up.")).toBeInTheDocument();
    expect(screen.getByText("Nothing needs you right now.")).toBeInTheDocument();
  });
});
