import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthProvider } from "../lib/auth";
import { resetLiveTailProbe } from "../lib/useTaskPane";
import { PanePanel } from "./PanePanel";

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status });
}

function renderPane(running: boolean) {
  localStorage.setItem("loomux.token", "tok");
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <PanePanel taskId="k1" running={running} />
      </AuthProvider>
    </QueryClientProvider>,
  );
}

const capture = {
  task_id: "k1",
  turns: [{ id: "u1", user_message: "go", agent_message: "done", pane: "$ npm test\n42 passing", created_at: "2026-10-08T14:02:00Z" }],
  has_more: true,
};

describe("PanePanel", () => {
  const originalFetch = globalThis.fetch;
  beforeEach(() => resetLiveTailProbe());
  afterEach(() => {
    globalThis.fetch = originalFetch;
    localStorage.clear();
  });

  it("shows the last turn's capture, saying when it was taken", async () => {
    const calls: string[] = [];
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      calls.push(String(input));
      return jsonResponse(capture);
    }) as typeof fetch;
    renderPane(false);
    expect(await screen.findByText(/42 passing/)).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Terminal" })).toHaveTextContent(/at the end of the last turn/);
    expect(calls).toEqual(["/api/v1/tasks/k1/transcript?limit=1"]);
  });

  it("while a turn runs on a server without a live pane, says so instead of passing the capture off as live", async () => {
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) =>
      String(input).includes("/pane") ? new Response("404 page not found", { status: 404 }) : jsonResponse(capture),
    ) as typeof fetch;
    renderPane(true);
    expect(await screen.findByText(/doesn't stream the terminal while a turn runs/)).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Terminal" })).not.toHaveTextContent(/^Terminal\s*Live/);
  });

  it("shows the live pane where the server has one", async () => {
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) =>
      String(input).includes("/pane")
        ? jsonResponse({ task_id: "k1", lines: ["$ make", "building…"], cursor: "c1" })
        : jsonResponse(capture),
    ) as typeof fetch;
    renderPane(true);
    await waitFor(() => expect(screen.getByRole("region", { name: "Terminal" })).toHaveTextContent("Live"));
    expect(screen.getByText(/building…/)).toBeInTheDocument();
  });
});
