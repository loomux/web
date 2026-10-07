import { afterEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthProvider } from "./auth";
import { useNeedsYou } from "./useNeedsYou";

function jsonResponse(body: unknown) {
  return new Response(JSON.stringify(body), { status: 200 });
}

describe("useNeedsYou", () => {
  const originalFetch = globalThis.fetch;
  afterEach(() => {
    globalThis.fetch = originalFetch;
    localStorage.clear();
  });

  it("refetches a conversation's detail only when its list entry moves on", async () => {
    localStorage.setItem("loomux.token", "tok");
    let updatedAt = new Date().toISOString();
    const detailCalls = vi.fn();
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === "/api/v1/conversations") {
        return jsonResponse({ conversations: [{ conversation_id: "c1", workspace_id: "", status: "completed", updated_at: updatedAt }] });
      }
      if (url === "/api/v1/conversations/c1") {
        detailCalls();
        return jsonResponse({ conversation_id: "c1", tasks: [], messages: [], dispatches: [], confirmations: [] });
      }
      return new Response("{}", { status: 404 });
    }) as typeof fetch;

    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    renderHook(() => useNeedsYou(), {
      wrapper: ({ children }) => (
        <QueryClientProvider client={queryClient}>
          <AuthProvider>{children}</AuthProvider>
        </QueryClientProvider>
      ),
    });
    await waitFor(() => expect(detailCalls).toHaveBeenCalledTimes(1));

    // The list refreshes with nothing new: no detail fetch.
    await act(() => queryClient.refetchQueries({ queryKey: ["conversations"] }));
    await act(() => queryClient.refetchQueries({ queryKey: ["conversations"] }));
    expect(detailCalls).toHaveBeenCalledTimes(1);

    // The conversation moved on: its detail is fetched again, once.
    updatedAt = new Date(Date.now() + 60_000).toISOString();
    await act(() => queryClient.refetchQueries({ queryKey: ["conversations"] }));
    await waitFor(() => expect(detailCalls).toHaveBeenCalledTimes(2));
    await act(() => queryClient.refetchQueries({ queryKey: ["conversations"] }));
    expect(detailCalls).toHaveBeenCalledTimes(2);
  });
});
