import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthProvider } from "../lib/auth";
import { ConversationPage } from "./ConversationPage";

// LOOM-274 (TUI W2): a task someone drives from a terminal (loomux/server
// LOOM-267's hold) shows who, with Take back; the stream's task_hold
// keeps it current; the conversation can be opened in the terminal.

const stream = vi.hoisted(() => ({
  state: { event: null, dispatchEvent: null, messageEvent: null, holdEvent: null, connected: false } as Record<string, unknown>,
}));
vi.mock("../lib/useConversationStream", () => ({
  useConversationStream: () => stream.state,
}));

function page(queryClient: QueryClient) {
  return (
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={["/conversations/abc123"]}>
        <AuthProvider>
          <Routes>
            <Route path="/conversations/:id" element={<ConversationPage />} />
          </Routes>
        </AuthProvider>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status });
}

const hold = {
  id: "h1",
  task_id: "t1",
  session_id: "s-term",
  client_kind: "tui",
  client_label: "laptop",
  mode: "drive",
  prev_status: "awaiting_input",
  ttl_seconds: 45,
  acquired_at: "2026-11-20T13:02:00Z",
  renewed_at: "2026-11-20T13:02:30Z",
  expires_at: "2026-11-20T13:03:15Z",
};

const task = (over: Record<string, unknown> = {}) => ({
  id: "t1",
  workspace_id: "ws-1",
  kind: "agent",
  agent_type: "claude-code",
  status: "human_takeover",
  created_at: "2026-11-20T13:00:00Z",
  updated_at: "2026-11-20T13:02:00Z",
  ...over,
});

// A server holding the conversation's tasks; `released` flips once a
// release arrives, as Take back does on the server.
function serve(tasks: () => unknown[]) {
  localStorage.setItem("loomux.token", "tok-1");
  const calls: { method: string; url: string; body?: string }[] = [];
  let gets = 0;
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? "GET";
    calls.push({ method, url, body: init?.body ? String(init.body) : undefined });
    if (url === "/api/v1/conversations/abc123") {
      gets += 1;
      return json({ conversation_id: "abc123", tasks: tasks(), messages: [] });
    }
    if (url === "/api/v1/workspaces") return json({ workspaces: [{ id: "ws-1", name: "cc-hub" }] });
    if (url.endsWith("/events")) return json({ events: [] });
    if (url === "/api/v1/targets") return json({ targets: [] });
    if (url === "/api/v1/tasks/t1/release" && method === "POST") return json({ task_id: "t1", status: "awaiting_input", hold: { ...hold, ended_reason: "taken_back" } });
    throw new Error(`unexpected fetch: ${method} ${url}`);
  });
  return { calls, gets: () => gets };
}

describe("ConversationPage holds", () => {
  const originalFetch = globalThis.fetch;
  afterEach(() => {
    stream.state = { event: null, dispatchEvent: null, messageEvent: null, holdEvent: null, connected: false };
    globalThis.fetch = originalFetch;
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it("names who drives the task, and takes it back once confirmed", async () => {
    let released = false;
    const server = serve(() => [released ? task({ status: "awaiting_input", hold: null }) : task({ hold })]);
    const inner = globalThis.fetch;
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input).endsWith("/release")) released = true;
      return inner(input, init);
    }) as typeof fetch;
    render(page(new QueryClient({ defaultOptions: { queries: { retry: false } } })));

    const banner = await screen.findByRole("region", { name: "Driven from the terminal on laptop" });
    // The banner says it; the old anonymous takeover card doesn't repeat it.
    expect(screen.queryByText("Someone has taken over this session")).not.toBeInTheDocument();

    await userEvent.click(within(banner).getByRole("button", { name: "Take back" }));
    await userEvent.click(within(banner).getByRole("button", { name: "Yes, take it back" }));
    await waitFor(() => expect(screen.queryByRole("region", { name: "Driven from the terminal on laptop" })).not.toBeInTheDocument());
    const release = server.calls.filter((c) => c.method === "POST");
    expect(release).toEqual([{ method: "POST", url: "/api/v1/tasks/t1/release", body: "{}" }]);
    // Handed back: the agent waits for a message again.
    expect(await screen.findByRole("region", { name: "claude-code is waiting for your reply" })).toBeInTheDocument();
  });

  it("marks the held task in the task list", async () => {
    serve(() => [task({ hold })]);
    render(page(new QueryClient({ defaultOptions: { queries: { retry: false } } })));
    const tasks = await screen.findByRole("list", { name: "Tasks" });
    await waitFor(() => expect(tasks).toHaveTextContent("Driven from the terminal on laptop"));
  });

  it.each([
    ["sends no hold (a server from before holds)", task()],
    ["says nobody holds it", task({ hold: null })],
  ])("keeps the takeover card when the server %s", async (_name, t) => {
    serve(() => [t]);
    render(page(new QueryClient({ defaultOptions: { queries: { retry: false } } })));
    expect(await screen.findByText("Someone has taken over this session")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Take back" })).not.toBeInTheDocument();
  });

  it("shows no banner for a read-only watch", async () => {
    serve(() => [task({ status: "running", hold: { ...hold, mode: "watch" } })]);
    render(page(new QueryClient({ defaultOptions: { queries: { retry: false } } })));
    await screen.findByRole("list", { name: "Tasks" });
    expect(screen.queryByRole("button", { name: "Take back" })).not.toBeInTheDocument();
  });

  // A failed task whose pane was kept for a person (a sign-in) can be
  // held and stays failed: the banner doesn't depend on the status.
  it("shows the holder of a failed task kept for a sign-in", async () => {
    serve(() => [task({ status: "failed", error_class: "login_required", hold })]);
    render(page(new QueryClient({ defaultOptions: { queries: { retry: false } } })));
    expect(await screen.findByRole("region", { name: "Driven from the terminal on laptop" })).toBeInTheDocument();
  });

  it("reads the conversation again when the stream says a task was taken or given back", async () => {
    const server = serve(() => [task({ status: "awaiting_input", hold: null })]);
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { rerender } = render(page(queryClient));
    await waitFor(() => expect(server.gets()).toBe(1));

    stream.state = { ...stream.state, holdEvent: { task_id: "t1", hold } };
    rerender(page(queryClient));
    await waitFor(() => expect(server.gets()).toBe(2));

    // The same words again are another event: given back, then taken again.
    stream.state = { ...stream.state, holdEvent: { task_id: "t1", hold } };
    rerender(page(queryClient));
    await waitFor(() => expect(server.gets()).toBe(3));
  });

  it("gives the command that opens the conversation in the terminal", async () => {
    serve(() => [task({ status: "awaiting_input", hold: null })]);
    render(page(new QueryClient({ defaultOptions: { queries: { retry: false } } })));
    const aside = await screen.findByRole("complementary", { name: "Tasks in this conversation" });
    await userEvent.click(within(aside).getByRole("button", { name: "Open in the terminal" }));
    expect(within(aside).getByLabelText("Terminal command")).toHaveTextContent("loomux open abc123");
  });
});
