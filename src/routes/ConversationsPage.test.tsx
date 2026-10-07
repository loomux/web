import { describe, expect, it, vi, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthProvider } from "../lib/auth";
import { ConversationsPage } from "./ConversationsPage";

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <MemoryRouter>
          <ConversationsPage />
        </MemoryRouter>
      </AuthProvider>
    </QueryClientProvider>,
  );
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status });
}

describe("ConversationsPage", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it("renders conversations attention-first and displays workspace names", async () => {
    localStorage.setItem("loomux.token", "tok-1");

    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === "/api/v1/conversations") {
        return jsonResponse({
          conversations: [
            { conversation_id: "completed-1", workspace_id: "ws-a", status: "completed", updated_at: "2026-09-10T12:00:00Z" },
            { conversation_id: "running-1", workspace_id: "ws-b", status: "running", updated_at: "2026-09-10T11:00:00Z" },
            { conversation_id: "awaiting-1", workspace_id: "ws-a", status: "awaiting_input", updated_at: "2026-09-10T10:00:00Z" },
          ],
        });
      }
      if (url === "/api/v1/workspaces") {
        return jsonResponse({
          workspaces: [
            { id: "ws-a", name: "Alpha Workspace", target_id: "tgt-a", status: "online" },
            { id: "ws-b", name: "Beta Workspace", target_id: "tgt-b", status: "online" },
          ],
        });
      }
      throw new Error(`unexpected fetch: ${url}`);
    });

    renderPage();

    // Attention-needing item is first even though it is oldest.
    const items = await screen.findAllByText(/Workspace/);
    expect(items[0]?.textContent).toBe("Alpha Workspace");
    expect(items[1]?.textContent).toBe("Beta Workspace");
    expect(items[2]?.textContent).toBe("Alpha Workspace");

    // Status badges render with urgency colors.
    const awaitingBadge = screen.getByText("awaiting input");
    expect(awaitingBadge.className).toContain("bg-red-100");

    const runningBadge = screen.getByText("running");
    expect(runningBadge.className).toContain("bg-blue-100");

    const completedBadge = screen.getByText("completed");
    expect(completedBadge.className).toContain("bg-green-100");
  });

  it("filters conversations by status when a chip is clicked", async () => {
    localStorage.setItem("loomux.token", "tok-1");
    const user = userEvent.setup();

    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === "/api/v1/conversations") {
        return jsonResponse({
          conversations: [
            { conversation_id: "awaiting-1", workspace_id: "ws-a", status: "awaiting_input", updated_at: "2026-09-10T10:00:00Z" },
            { conversation_id: "running-1", workspace_id: "ws-b", status: "running", updated_at: "2026-09-10T11:00:00Z" },
          ],
        });
      }
      if (url === "/api/v1/workspaces") {
        return jsonResponse({ workspaces: [] });
      }
      throw new Error(`unexpected fetch: ${url}`);
    });

    renderPage();

    expect(await screen.findByText("awaiting input")).toBeInTheDocument();
    expect(await screen.findByText("running")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /needs you/i }));

    expect(screen.queryByText("running")).not.toBeInTheDocument();
    expect(screen.getByText("awaiting input")).toBeInTheDocument();
  });

  it("falls back to raw workspace_id when workspace is not in the registry", async () => {
    localStorage.setItem("loomux.token", "tok-1");

    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === "/api/v1/conversations") {
        return jsonResponse({
          conversations: [
            { conversation_id: "conv-1", workspace_id: "unknown-ws", status: "running", updated_at: "2026-09-10T10:00:00Z" },
          ],
        });
      }
      if (url === "/api/v1/workspaces") {
        return jsonResponse({ workspaces: [] });
      }
      throw new Error(`unexpected fetch: ${url}`);
    });

    renderPage();

    expect(await screen.findByText("unknown-ws")).toBeInTheDocument();
  });

  it("does not show the empty state when the conversations fetch fails", async () => {
    localStorage.setItem("loomux.token", "tok-1");

    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === "/api/v1/conversations") {
        return jsonResponse({ error: "server error" }, 500);
      }
      if (url === "/api/v1/workspaces") {
        return jsonResponse({ workspaces: [] });
      }
      throw new Error(`unexpected fetch: ${url}`);
    });

    renderPage();

    expect(await screen.findByText(/server error/i)).toBeInTheDocument();
    expect(screen.queryByText(/No conversations yet/i)).not.toBeInTheDocument();
  });

  it("renders a preview of the conversation's first message when the server provides one", async () => {
    localStorage.setItem("loomux.token", "tok-1");

    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === "/api/v1/conversations") {
        return jsonResponse({
          conversations: [
            {
              conversation_id: "conv-preview",
              workspace_id: "ws-a",
              status: "running",
              updated_at: "2026-09-10T10:00:00Z",
              preview: "First question about the deployment",
            },
          ],
        });
      }
      if (url === "/api/v1/workspaces") {
        return jsonResponse({
          workspaces: [{ id: "ws-a", name: "Alpha Workspace", target_id: "tgt-a", status: "online" }],
        });
      }
      throw new Error(`unexpected fetch: ${url}`);
    });

    renderPage();

    expect(await screen.findByText("Alpha Workspace")).toBeInTheDocument();
    expect(await screen.findByText("First question about the deployment")).toBeInTheDocument();
    expect(screen.queryByText("conv-preview")).not.toBeInTheDocument();
  });

  it("falls back to the conversation_id when no preview is available", async () => {
    localStorage.setItem("loomux.token", "tok-1");

    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === "/api/v1/conversations") {
        return jsonResponse({
          conversations: [
            { conversation_id: "conv-no-preview", workspace_id: "ws-a", status: "running", updated_at: "2026-09-10T10:00:00Z" },
          ],
        });
      }
      if (url === "/api/v1/workspaces") {
        return jsonResponse({ workspaces: [] });
      }
      throw new Error(`unexpected fetch: ${url}`);
    });

    renderPage();

    expect(await screen.findByText("conv-no-preview")).toBeInTheDocument();
  });
});
