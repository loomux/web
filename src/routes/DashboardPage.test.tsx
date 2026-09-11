import { describe, expect, it, vi, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthProvider } from "../lib/auth";
import { DashboardPage } from "./DashboardPage";

function renderDashboard() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const router = createMemoryRouter([
    { path: "/", element: <DashboardPage /> },
    { path: "/conversations/:id", element: <div data-testid="conversation-route">Conversation route</div> },
  ], { initialEntries: ["/"] });

  return {
    router,
    ...render(
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <RouterProvider router={router} />
        </AuthProvider>
      </QueryClientProvider>,
    ),
  };
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status });
}

describe("DashboardPage", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it("renders attention-first conversations at the top", async () => {
    localStorage.setItem("loomux.token", "tok-1");

    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === "/api/v1/conversations") {
        return jsonResponse({
          conversations: [
            { conversation_id: "running-1", workspace_id: "ws-a", status: "running", updated_at: "2026-09-10T12:00:00Z" },
            { conversation_id: "completed-1", workspace_id: "ws-a", status: "completed", updated_at: "2026-09-10T11:00:00Z" },
            { conversation_id: "awaiting-1", workspace_id: "ws-a", status: "awaiting-input", updated_at: "2026-09-10T10:00:00Z" },
            { conversation_id: "takeover-1", workspace_id: "ws-b", status: "human-takeover", updated_at: "2026-09-10T09:00:00Z" },
          ],
        });
      }
      if (url === "/api/v1/workspaces") {
        return jsonResponse({
          workspaces: [
            { id: "ws-a", name: "Alpha", target_id: "tgt-a", status: "online" },
            { id: "ws-b", name: "Beta", target_id: "tgt-b", status: "online" },
          ],
        });
      }
      throw new Error(`unexpected fetch: ${url}`);
    });

    renderDashboard();

    // Only attention statuses are shown.
    expect(await screen.findByText("awaiting input")).toBeInTheDocument();
    expect(screen.getByText("human takeover")).toBeInTheDocument();
    expect(screen.queryByText("running")).not.toBeInTheDocument();
    expect(screen.queryByText("completed")).not.toBeInTheDocument();

    // Attention-first ordering: awaiting-input before human-takeover (more recent).
    const items = screen.getAllByText(/Alpha|Beta/);
    expect(items[0]?.textContent).toBe("Alpha");
    expect(items[1]?.textContent).toBe("Beta");
  });

  it("renders a compact workspace-health strip", async () => {
    localStorage.setItem("loomux.token", "tok-1");

    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === "/api/v1/conversations") {
        return jsonResponse({ conversations: [] });
      }
      if (url === "/api/v1/workspaces") {
        return jsonResponse({
          workspaces: [
            {
              id: "ws-a",
              name: "Alpha Workspace",
              target_id: "tgt-a",
              status: "online",
              tags: ["fleet", "prod"],
              description: "The alpha workspace",
              capabilities: ["bash", "python"],
              rolling_summary: "Healthy — 0 failing tasks",
              is_dynamic: false,
              last_used_at: "2026-09-10T10:00:00Z",
            },
            {
              id: "ws-b",
              name: "Beta Workspace",
              target_id: "tgt-b",
              status: "offline",
              rolling_summary: "Offline since morning",
              is_dynamic: true,
            },
          ],
        });
      }
      throw new Error(`unexpected fetch: ${url}`);
    });

    renderDashboard();

    expect(await screen.findByText("Alpha Workspace")).toBeInTheDocument();
    expect(screen.getByText("Beta Workspace")).toBeInTheDocument();
    expect(screen.getByText("Healthy — 0 failing tasks")).toBeInTheDocument();
    expect(screen.getByText("Offline since morning")).toBeInTheDocument();
    expect(screen.getByText("fleet")).toBeInTheDocument();
    expect(screen.getByText("prod")).toBeInTheDocument();
    expect(screen.getByText("dynamic")).toBeInTheDocument();
  });

  it("navigates to a new conversation when the button is clicked", async () => {
    localStorage.setItem("loomux.token", "tok-1");
    const user = userEvent.setup();

    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === "/api/v1/conversations") {
        return jsonResponse({ conversations: [] });
      }
      if (url === "/api/v1/workspaces") {
        return jsonResponse({ workspaces: [] });
      }
      throw new Error(`unexpected fetch: ${url}`);
    });

    const { router } = renderDashboard();

    await user.click(screen.getByRole("button", { name: /new conversation/i }));

    expect(router.state.location.pathname).toMatch(/^\/conversations\/[\w-]+$/);
  });
});
