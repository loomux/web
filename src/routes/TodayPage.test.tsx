import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthProvider } from "../lib/auth";
import { TodayPage } from "./TodayPage";

const MIN = 60_000;
const iso = (offset: number) => new Date(Date.now() + offset).toISOString();

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status });
}

const conversations = [
  { conversation_id: "ratelimit", workspace_id: "w-ledger", status: "needs_attention", updated_at: iso(-6 * MIN), preview: "Add rate limiting to the ledger-api /transfers endpoint" },
  { conversation_id: "backup", workspace_id: "", status: "completed", updated_at: iso(-30 * MIN), preview: "Why is the nightly backup job slow?" },
  { conversation_id: "old", workspace_id: "w-ledger", status: "completed", updated_at: iso(-3 * 24 * 60 * MIN), preview: "An old one" },
];

function serve() {
  const eventCalls: string[] = [];
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url === "/api/v1/conversations") return jsonResponse({ conversations });
    if (url === "/api/v1/workspaces") return jsonResponse({ workspaces: [{ id: "w-ledger", name: "ledger-api", target_id: "t-atlas", status: "active" }] });
    if (url === "/api/v1/targets") return jsonResponse({ targets: [{ id: "t-atlas", name: "atlas", kind: "remote", host: "atlas.lab.example", user: "dev" }] });
    const events = url.match(/^\/api\/v1\/conversations\/([^/]+)\/events$/);
    if (events) {
      eventCalls.push(events[1]);
      if (events[1] === "ratelimit") {
        return jsonResponse({
          conversation_id: "ratelimit",
          events: [
            { id: "e1", dispatch_id: "d1", kind: "decision", target_id: "t-atlas", created_at: iso(-20 * MIN), duration_ms: 0 },
            { id: "e2", dispatch_id: "d1", kind: "agent_turn", workspace_id: "w-ledger", created_at: iso(-10 * MIN), duration_ms: 4 * MIN },
          ],
        });
      }
      return jsonResponse({ conversation_id: events[1], events: [] });
    }
    if (url === "/api/v1/conversations/ratelimit") {
      return jsonResponse({
        conversation_id: "ratelimit",
        tasks: [{ id: "k1", workspace_id: "w-ledger", kind: "agent", agent_type: "claude-code", status: "needs_attention", created_at: iso(-20 * MIN), updated_at: iso(-6 * MIN) }],
        messages: [],
        dispatches: [],
        confirmations: [],
      });
    }
    if (url.startsWith("/api/v1/conversations/")) {
      return jsonResponse({ conversation_id: url.split("/").pop(), tasks: [], messages: [], dispatches: [], confirmations: [] });
    }
    return jsonResponse({ error: "not found" }, 404);
  }) as typeof fetch;
  return { eventCalls };
}

function renderToday(path = "/today") {
  localStorage.setItem("loomux.token", "tok");
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const router = createMemoryRouter(
    [
      { path: "/today", element: <TodayPage /> },
      { path: "/today/:date", element: <TodayPage /> },
      { path: "/conversations/:id", element: <p>conversation page</p> },
    ],
    { initialEntries: [path] },
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

describe("TodayPage", () => {
  const originalFetch = globalThis.fetch;
  afterEach(() => {
    globalThis.fetch = originalFetch;
    localStorage.clear();
  });

  it("draws today's work and lists every conversation", async () => {
    const { eventCalls } = serve();
    renderToday();
    expect(screen.getByRole("heading", { name: "Today", level: 1 })).toBeInTheDocument();
    const weave = await screen.findByRole("group", { name: /the day's work/i });
    // A stitch for the agent's turn, and a knot for the prompt waiting on you.
    expect(await within(weave).findByRole("link", { name: /Agent turn, 4m 00s, ledger-api on atlas/ })).toBeInTheDocument();
    expect(within(weave).getByRole("link", { name: /Asking you/ })).toBeInTheDocument();
    // Only conversations that moved today are read for the weave.
    await waitFor(() => expect(eventCalls.sort()).toEqual(["backup", "ratelimit"]));

    const list = screen.getByRole("region", { name: "All conversations" });
    expect(within(list).getAllByRole("link")).toHaveLength(3);
  });

  it("opens a stitch at its turn", async () => {
    serve();
    const router = renderToday();
    const weave = await screen.findByRole("group", { name: /the day's work/i });
    await userEvent.click(await within(weave).findByRole("link", { name: /Agent turn/ }));
    expect(router.state.location.pathname).toBe("/conversations/ratelimit");
    expect(router.state.location.search).toBe("?turn=d1");
  });

  it("keeps the search and filter in the address", async () => {
    serve();
    const router = renderToday();
    const list = screen.getByRole("region", { name: "All conversations" });
    await userEvent.type(screen.getByRole("searchbox", { name: "Search conversations" }), "backup");
    await waitFor(() => expect(within(list).getAllByRole("link")).toHaveLength(1));
    expect(router.state.location.search).toBe("?q=backup");
    await userEvent.clear(screen.getByRole("searchbox"));
    await userEvent.click(screen.getByRole("radio", { name: "Needs you" }));
    expect(router.state.location.search).toBe("?status=needs-you");
    expect(within(list).getAllByRole("link")).toHaveLength(1);
    expect(within(list).getByText("Asking you")).toBeInTheDocument();
  });

  it("reads another day from the address, and steps between days", async () => {
    serve();
    const router = renderToday("/today/2026-10-01");
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(/October/);
    await userEvent.click(screen.getByRole("link", { name: /Previous day/ }));
    expect(router.state.location.pathname).toBe("/today/2026-09-30");
    await userEvent.click(screen.getByRole("link", { name: "Today" }));
    expect(router.state.location.pathname).toBe("/today");
    expect(screen.queryByRole("link", { name: /Next day/ })).not.toBeInTheDocument();
  });

  // LOOM-171: no rolling an impossible date over into a real one.
  it.each([["2026-13-45"], ["2026-02-30"], ["2026-00-10"], ["2026-1-5"], ["yesterday"]])("refuses /today/%s", async (date) => {
    serve();
    const router = renderToday(`/today/${date}`);
    const h1 = screen.getAllByRole("heading", { level: 1 });
    expect(h1).toHaveLength(1);
    expect(h1[0]).toHaveTextContent("Not a date");
    await userEvent.click(screen.getByRole("link", { name: "Go to today" }));
    expect(router.state.location.pathname).toBe("/today");
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Today");
  });

  it("takes a leap day", () => {
    serve();
    renderToday("/today/2024-02-29");
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(/29 February|February 29/);
  });
});
