import { describe, expect, it, vi, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthProvider } from "../lib/auth";
import { ConversationDetailPage } from "./ConversationDetailPage";

vi.mock("../lib/useConversationStream", () => ({
  useConversationStream: () => ({ event: null, connected: false }),
}));

function renderPage(conversationId = "abc123") {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[`/conversations/${conversationId}`]}>
        <AuthProvider>
          <Routes>
            <Route path="/conversations/:id" element={<ConversationDetailPage />} />
          </Routes>
        </AuthProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status });
}

describe("ConversationDetailPage", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it("renders the persisted transcript from history.messages on load", async () => {
    localStorage.setItem("loomux.token", "tok-1");
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === "/api/v1/conversations/abc123") {
        return jsonResponse({
          conversation_id: "abc123",
          tasks: [],
          messages: [
            { id: "m1", role: "user", content: "hi there", task_id: "t1", created_at: "2026-09-01T00:00:00Z" },
            { id: "m2", role: "assistant", content: "hello back", task_id: "t1", created_at: "2026-09-01T00:00:01Z" },
          ],
        });
      }
      throw new Error(`unexpected fetch: ${url}`);
    });

    renderPage();

    expect(await screen.findByText("hi there")).toBeInTheDocument();
    expect(await screen.findByText("hello back")).toBeInTheDocument();
    expect(screen.queryByText(/LOOM-31/)).not.toBeInTheDocument();
  });

  it("shows an empty-state message with no stale LOOM-31 reference when there is no transcript", async () => {
    localStorage.setItem("loomux.token", "tok-1");
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === "/api/v1/conversations/abc123") {
        return jsonResponse({ conversation_id: "abc123", tasks: [], messages: [] });
      }
      throw new Error(`unexpected fetch: ${url}`);
    });

    renderPage();

    expect(await screen.findByText(/no messages/i)).toBeInTheDocument();
    expect(screen.queryByText(/LOOM-31/)).not.toBeInTheDocument();
    expect(screen.queryByText(/isn't available yet/)).not.toBeInTheDocument();
  });

  it("optimistically shows a sent message and reply, then reconciles with the refetched transcript without duplicating them", async () => {
    localStorage.setItem("loomux.token", "tok-1");
    const user = userEvent.setup();

    let getCalls = 0;
    let resolveDispatch: (value: Response) => void = () => {};
    const dispatchPromise = new Promise<Response>((resolve) => {
      resolveDispatch = resolve;
    });

    globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? "GET";

      if (url === "/api/v1/conversations/abc123" && method === "GET") {
        getCalls += 1;
        const messages =
          getCalls === 1
            ? [{ id: "m1", role: "user", content: "hi there", task_id: "t1", created_at: "2026-09-01T00:00:00Z" }]
            : [
                { id: "m1", role: "user", content: "hi there", task_id: "t1", created_at: "2026-09-01T00:00:00Z" },
                { id: "m2", role: "user", content: "what's up", task_id: "t2", created_at: "2026-09-01T00:01:00Z" },
                { id: "m3", role: "assistant", content: "not much", task_id: "t2", created_at: "2026-09-01T00:01:01Z" },
              ];
        return jsonResponse({ conversation_id: "abc123", tasks: [], messages });
      }

      if (url === "/api/v1/dispatch" && method === "POST") {
        return dispatchPromise;
      }

      throw new Error(`unexpected fetch: ${method} ${url}`);
    });

    renderPage();

    expect(await screen.findByText("hi there")).toBeInTheDocument();

    await user.type(screen.getByPlaceholderText(/message the agent fleet/i), "what's up");
    await user.click(screen.getByRole("button", { name: /send/i }));

    expect(await screen.findByText("what's up")).toBeInTheDocument();

    resolveDispatch(jsonResponse({ reply: "not much" }));

    expect(await screen.findByText("not much")).toBeInTheDocument();

    await waitFor(() => expect(getCalls).toBeGreaterThanOrEqual(2));

    await waitFor(() => {
      expect(screen.getAllByText("what's up")).toHaveLength(1);
      expect(screen.getAllByText("not much")).toHaveLength(1);
    });
  });

  it("keeps the optimistic user message visible and shows an error when dispatch fails", async () => {
    localStorage.setItem("loomux.token", "tok-1");
    const user = userEvent.setup();

    globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? "GET";

      if (url === "/api/v1/conversations/abc123" && method === "GET") {
        return jsonResponse({ conversation_id: "abc123", tasks: [], messages: [] });
      }

      if (url === "/api/v1/dispatch" && method === "POST") {
        return jsonResponse({ error: "dispatch failed" }, 500);
      }

      throw new Error(`unexpected fetch: ${method} ${url}`);
    });

    renderPage();

    await waitFor(() => expect(screen.getByPlaceholderText(/message the agent fleet/i)).not.toBeDisabled());

    await user.type(screen.getByPlaceholderText(/message the agent fleet/i), "hello?");
    await user.click(screen.getByRole("button", { name: /send/i }));

    expect(await screen.findByText("hello?")).toBeInTheDocument();
    expect(await screen.findByText("dispatch failed")).toBeInTheDocument();
  });
});
