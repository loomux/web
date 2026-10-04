// LOOM-81: the async dispatch UX — a progress card for the turn in flight,
// failed turns kept with a plain-language error and Retry, 409/503.
import { describe, expect, it, vi, afterEach, beforeEach } from "vitest";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useSyncExternalStore } from "react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthProvider } from "../lib/auth";
import type { DispatchUpdateEvent, MessageAddedEvent } from "../lib/api";
import { ConversationDetailPage } from "./ConversationDetailPage";

// A stream the tests push events into.
const stream = vi.hoisted(() => {
  let state = { event: null, dispatchEvent: null as unknown, messageEvent: null as unknown, connected: true };
  const listeners = new Set<() => void>();
  return {
    get: () => state,
    subscribe: (l: () => void) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    push(dispatchEvent: unknown) {
      state = { ...state, dispatchEvent };
      listeners.forEach((l) => l());
    },
    pushMessage(messageEvent: unknown) {
      state = { ...state, messageEvent };
      listeners.forEach((l) => l());
    },
    reset() {
      state = { event: null, dispatchEvent: null, messageEvent: null, connected: true };
    },
  };
});

vi.mock("../lib/useConversationStream", () => ({
  useConversationStream: () => useSyncExternalStore(stream.subscribe, stream.get),
}));

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={["/conversations/abc123"]}>
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

const T0 = "2026-10-05T10:00:00Z";
const userMsg = (id: string, content: string, dispatchId: string) => ({
  id,
  role: "user",
  content,
  task_id: "",
  dispatch_id: dispatchId,
  created_at: T0,
});

interface Posted {
  body: Record<string, unknown>;
  headers: Headers;
}

// A server whose conversation state the test sets as it goes.
function fakeServer(conv: { messages: unknown[]; tasks: unknown[]; dispatches: unknown[] }) {
  const posts: Posted[] = [];
  let postResponse: () => Response = () =>
    jsonResponse({ dispatch_id: `d${posts.length}`, conversation_id: "abc123", status: "queued", created_at: T0 }, 202);
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? "GET";
    if (url === "/api/v1/conversations/abc123" && method === "GET") {
      return jsonResponse({ conversation_id: "abc123", ...conv });
    }
    if (url === "/api/v1/dispatch" && method === "POST") {
      posts.push({ body: JSON.parse(String(init?.body)), headers: new Headers(init?.headers) });
      return postResponse();
    }
    if (url === "/api/v1/workspaces") {
      return jsonResponse({ workspaces: [{ id: "ws-1", name: "my-app", target_id: "t", status: "online" }] });
    }
    throw new Error(`unexpected fetch: ${method} ${url}`);
  });
  return {
    posts,
    respondWith(fn: () => Response) {
      postResponse = fn;
    },
  };
}

describe("ConversationDetailPage async dispatch (LOOM-81)", () => {
  const originalFetch = globalThis.fetch;
  beforeEach(() => {
    stream.reset();
    localStorage.setItem("loomux.token", "tok-1");
  });
  afterEach(() => {
    globalThis.fetch = originalFetch;
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it("sends asynchronously with an idempotency key, shows the turn's progress, then its answer when the stream says it's done", async () => {
    const user = userEvent.setup();
    const conv = { messages: [] as unknown[], tasks: [] as unknown[], dispatches: [] as unknown[] };
    const server = fakeServer(conv);
    renderPage();

    await user.type(screen.getByPlaceholderText(/message the agent fleet/i), "fix the build");
    // The server stores the message (and the job) when it accepts it.
    conv.messages = [userMsg("m1", "fix the build", "d1")];
    conv.dispatches = [
      { dispatch_id: "d1", conversation_id: "abc123", status: "running", created_at: T0, started_at: T0 },
    ];
    await user.click(screen.getByRole("button", { name: /send/i }));

    await waitFor(() => expect(server.posts).toHaveLength(1));
    expect(server.posts[0].headers.get("Prefer")).toBe("respond-async");
    expect(server.posts[0].headers.get("Idempotency-Key")).toMatch(/^[0-9a-f-]{36}$/);

    const card = await screen.findByRole("status", { name: /turn in progress/i });
    await waitFor(() => expect(card).toHaveTextContent(/deciding where this goes/i));
    expect(screen.getByPlaceholderText(/message the agent fleet/i)).toBeDisabled();
    expect(screen.getAllByText("fix the build")).toHaveLength(1);

    // The agent starts on it.
    conv.tasks = [
      {
        id: "t1",
        workspace_id: "ws-1",
        kind: "agent",
        agent_type: "claude-code",
        status: "running",
        created_at: "2026-10-05T10:00:05Z",
        updated_at: "2026-10-05T10:00:05Z",
      },
    ];
    act(() => stream.push({ dispatch_id: "d1", status: "running", updated_at: T0 } satisfies DispatchUpdateEvent));
    // (a task_update would trigger the refetch; a re-render after any
    // refetch shows the stage)
    await act(async () => {
      stream.push({ dispatch_id: "d1", status: "running", updated_at: "2026-10-05T10:00:06Z" });
    });

    // Done: the answer is in the transcript.
    conv.messages = [
      ...conv.messages,
      { id: "m2", role: "assistant", content: "fixed it", task_id: "t1", created_at: T0 },
    ];
    conv.dispatches = [
      { dispatch_id: "d1", conversation_id: "abc123", status: "succeeded", reply: "fixed it", created_at: T0 },
    ];
    act(() => stream.push({ dispatch_id: "d1", status: "succeeded", reply: "fixed it", updated_at: T0 }));

    expect(await screen.findByText("fixed it")).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole("status", { name: /turn in progress/i })).not.toBeInTheDocument());
    await waitFor(() => expect(screen.getByPlaceholderText(/message the agent fleet/i)).not.toBeDisabled());
  });

  it("shows an agent's late report when the stream says a message was added (LOOM-121)", async () => {
    const conv = {
      messages: [
        userMsg("m1", "build it", "d1"),
        { id: "m2", role: "assistant", content: "Build started; I'll report back.", task_id: "t1", created_at: T0 },
      ] as unknown[],
      tasks: [] as unknown[],
      dispatches: [
        { dispatch_id: "d1", conversation_id: "abc123", status: "succeeded", created_at: T0 },
      ] as unknown[],
    };
    fakeServer(conv);
    renderPage();
    expect(await screen.findByText("Build started; I'll report back.")).toBeInTheDocument();

    conv.messages = [
      ...conv.messages,
      { id: "m3", role: "assistant", content: "The build passed.", task_id: "t1", created_at: T0 },
    ];
    act(() =>
      stream.pushMessage({ message_id: "m3", task_id: "t1", role: "assistant", created_at: T0 } satisfies MessageAddedEvent),
    );
    expect(await screen.findByText("The build passed.")).toBeInTheDocument();
  });

  it("shows a turn still running after a reload, with its agent and workspace", async () => {
    fakeServer({
      messages: [userMsg("m1", "fix the build", "d1")],
      tasks: [
        {
          id: "t1",
          workspace_id: "ws-1",
          kind: "agent",
          agent_type: "claude-code",
          status: "running",
          created_at: "2026-10-05T10:00:05Z",
          updated_at: "2026-10-05T10:00:05Z",
        },
      ],
      dispatches: [{ dispatch_id: "d1", conversation_id: "abc123", status: "running", created_at: T0, started_at: T0 }],
    });
    renderPage();

    const card = await screen.findByRole("status", { name: /turn in progress/i });
    await waitFor(() => expect(card).toHaveTextContent(/claude-code is working in my-app/i));
    expect(screen.getByRole("button", { name: /show attach command/i })).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/message the agent fleet/i)).toBeDisabled();
  });

  it("keeps a failed turn after a reload, with a plain-language error and a Retry that sends the same text again", async () => {
    const user = userEvent.setup();
    const server = fakeServer({
      messages: [userMsg("m1", "check disk on jet01", "d1")],
      tasks: [],
      dispatches: [
        {
          dispatch_id: "d1",
          conversation_id: "abc123",
          status: "failed",
          error: "dispatch: run command: ssh: dial tcp 10.0.0.5:22: i/o timeout: target unreachable",
          error_class: "target_unreachable",
          created_at: T0,
        },
      ],
    });
    renderPage();

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(/couldn't reach the machine/i);
    expect(alert).toHaveTextContent(/reachable over ssh/i);
    expect(screen.getByText("check disk on jet01")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /retry/i }));
    await waitFor(() => expect(server.posts).toHaveLength(1));
    expect(server.posts[0].body.message).toBe("check disk on jet01");
    expect(server.posts[0].headers.get("Idempotency-Key")).toBeTruthy();
  });

  it("on a 409 follows the turn already running and keeps the unsent message in the composer", async () => {
    const user = userEvent.setup();
    const server = fakeServer({ messages: [], tasks: [], dispatches: [] });
    server.respondWith(() => jsonResponse({ error: "a turn is already in flight", dispatch_id: "d9" }, 409));
    renderPage();

    await user.type(screen.getByPlaceholderText(/message the agent fleet/i), "second message");
    await user.click(screen.getByRole("button", { name: /send/i }));

    expect(await screen.findByText(/still running in this conversation/i)).toBeInTheDocument();
    expect(screen.getByRole("status", { name: /turn in progress/i })).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/message the agent fleet/i)).toHaveValue("second message");
  });

  it("on a 503 says Loomux is restarting", async () => {
    const user = userEvent.setup();
    const server = fakeServer({ messages: [], tasks: [], dispatches: [] });
    server.respondWith(() => jsonResponse({ error: "server is shutting down" }, 503));
    renderPage();

    await user.type(screen.getByPlaceholderText(/message the agent fleet/i), "hello");
    await user.click(screen.getByRole("button", { name: /send/i }));
    expect(await screen.findByText(/loomux is restarting/i)).toBeInTheDocument();
  });
});
