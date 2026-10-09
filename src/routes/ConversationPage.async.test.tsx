// LOOM-81: the async dispatch UX — a progress card for the turn in flight,
// failed turns kept with a plain-language error and Retry, 409/503.
import { describe, expect, it, vi, afterEach, beforeEach } from "vitest";
import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useSyncExternalStore } from "react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthProvider } from "../lib/auth";
import type { DispatchUpdateEvent, MessageAddedEvent } from "../lib/api";
import { ConversationPage } from "./ConversationPage";

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
            <Route path="/conversations/:id" element={<ConversationPage />} />
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
function fakeServer(conv: { messages: unknown[]; tasks: unknown[]; dispatches: unknown[]; confirmations?: unknown[] }) {
  const posts: Posted[] = [];
  const cancels: string[] = [];
  let cancelResponse: () => Response = () => jsonResponse({ dispatch_id: cancels.at(-1) }, 202);
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
    const cancel = url.match(/^\/api\/v1\/dispatches\/([^/]+)\/cancel$/);
    if (cancel && method === "POST") {
      cancels.push(cancel[1]);
      return cancelResponse();
    }
    if (url === "/api/v1/workspaces") {
      return jsonResponse({ workspaces: [{ id: "ws-1", name: "my-app", target_id: "t", status: "online" }] });
    }
    // The turn card's terminal: no capture, no live pane.
    if (url.startsWith("/api/v1/tasks/")) return jsonResponse({ error: "no such task" }, 404);
    throw new Error(`unexpected fetch: ${method} ${url}`);
  });
  return {
    posts,
    cancels,
    respondWith(fn: () => Response) {
      postResponse = fn;
    },
    respondToCancelWith(fn: () => Response) {
      cancelResponse = fn;
    },
  };
}

describe("ConversationPage async dispatch (LOOM-81)", () => {
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

    const card = await screen.findByRole("region", { name: /turn in progress/i });
    await waitFor(() => expect(card).toHaveTextContent(/deciding where this goes/i));
    // The composer stays open for the next message; Send waits for the turn.
    expect(screen.getByRole("button", { name: "Working…" })).toBeDisabled();
    expect(within(screen.getByRole("log", { name: "Messages" })).getAllByText("fix the build")).toHaveLength(1);

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
    await waitFor(() => expect(screen.queryByRole("region", { name: /turn in progress/i })).not.toBeInTheDocument());
    await waitFor(() => expect(screen.getByRole("button", { name: "Send" })).toBeInTheDocument());
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

    const card = await screen.findByRole("region", { name: /turn in progress/i });
    await waitFor(() => expect(card).toHaveTextContent(/claude-code is working in my-app/i));
    expect(within(card).getByRole("button", { name: /show attach command/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Working…" })).toBeDisabled();
  });

  it("keeps a failed turn after a reload, with a plain-language error and a Retry that sends the same text again", async () => {
    const user = userEvent.setup();
    const server = fakeServer({
      messages: [userMsg("m1", "check disk on devbox", "d1")],
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

    const failed = await screen.findByRole("region", { name: /couldn't reach the machine/i });
    expect(failed).toHaveTextContent(/reachable over ssh/i);
    expect(within(screen.getByRole("log", { name: "Messages" })).getByText("check disk on devbox")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /retry/i }));
    await waitFor(() => expect(server.posts).toHaveLength(1));
    expect(server.posts[0].body.message).toBe("check disk on devbox");
    expect(server.posts[0].headers.get("Idempotency-Key")).toBeTruthy();
  });

  it("retries a failed answer to an offer with that offer's id, so a closed offer is refused, not a newer one approved", async () => {
    const user = userEvent.setup();
    const server = fakeServer({
      messages: [userMsg("m1", "yes", "d1")],
      tasks: [],
      dispatches: [
        {
          dispatch_id: "d1",
          conversation_id: "abc123",
          status: "failed",
          error: "dispatch: run command: ssh: dial tcp 10.0.0.5:22: i/o timeout: target unreachable",
          error_class: "target_unreachable",
          confirmation_id: "conf-1",
          created_at: T0,
        },
      ],
    });
    renderPage();

    const failed = await screen.findByRole("region", { name: /couldn't reach the machine/i });
    await user.click(within(failed).getByRole("button", { name: /retry/i }));

    await waitFor(() => expect(server.posts).toHaveLength(1));
    expect(server.posts[0].body.message).toBe("yes");
    expect(server.posts[0].body.confirmation_id).toBe("conf-1");
  });

  it("on a 409 follows the turn already running and keeps the unsent message in the composer", async () => {
    const user = userEvent.setup();
    const server = fakeServer({ messages: [], tasks: [], dispatches: [] });
    server.respondWith(() => jsonResponse({ error: "a turn is already in flight", dispatch_id: "d9" }, 409));
    renderPage();

    await user.type(screen.getByPlaceholderText(/message the agent fleet/i), "second message");
    await user.click(screen.getByRole("button", { name: /send/i }));

    expect(await screen.findByText(/still running in this conversation/i)).toBeInTheDocument();
    expect(screen.getByRole("region", { name: /turn in progress/i })).toBeInTheDocument();
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

  // LOOM-149: a send that fails without the server saying it wasn't taken.
  describe("a failed send", () => {
    const sendText = async (user: ReturnType<typeof userEvent.setup>, text: string) => {
      const box = screen.getByPlaceholderText(/message the agent fleet/i);
      await user.clear(box);
      await user.type(box, text);
      await user.click(screen.getByRole("button", { name: /send/i }));
    };
    const failed = () => screen.findByText(/wasn't sent/i);

    it("on a 5xx gives the draft back and leaves no stuck message", async () => {
      const user = userEvent.setup();
      const server = fakeServer({ messages: [], tasks: [], dispatches: [] });
      server.respondWith(() => jsonResponse({ error: "bad gateway" }, 502));
      renderPage();

      await sendText(user, "check disk");
      expect(await failed()).toBeInTheDocument();
      expect(screen.getByPlaceholderText(/message the agent fleet/i)).toHaveValue("check disk");
      expect(within(screen.getByRole("log", { name: "Messages" })).queryByText("check disk")).not.toBeInTheDocument();
    });

    it("on a dropped connection gives the draft back and leaves no stuck message", async () => {
      const user = userEvent.setup();
      const server = fakeServer({ messages: [], tasks: [], dispatches: [] });
      server.respondWith(() => {
        throw new TypeError("Failed to fetch");
      });
      renderPage();

      await sendText(user, "check disk");
      expect(await failed()).toBeInTheDocument();
      expect(screen.getByPlaceholderText(/message the agent fleet/i)).toHaveValue("check disk");
      expect(within(screen.getByRole("log", { name: "Messages" })).queryByText("check disk")).not.toBeInTheDocument();
    });

    it("sent again reuses its idempotency key; a different message gets a new one", async () => {
      const user = userEvent.setup();
      const server = fakeServer({ messages: [], tasks: [], dispatches: [] });
      server.respondWith(() => {
        throw new TypeError("Failed to fetch");
      });
      renderPage();

      await sendText(user, "check disk");
      await failed();
      await user.click(screen.getByRole("button", { name: /send/i }));
      await waitFor(() => expect(server.posts).toHaveLength(2));
      await waitFor(() => expect(screen.getByPlaceholderText(/message the agent fleet/i)).toHaveValue("check disk"));
      await sendText(user, "check memory");
      await waitFor(() => expect(server.posts).toHaveLength(3));

      const keys = server.posts.map((p) => p.headers.get("Idempotency-Key"));
      expect(keys[0]).toBeTruthy();
      expect(keys[1]).toBe(keys[0]);
      expect(keys[2]).toBeTruthy();
      expect(keys[2]).not.toBe(keys[0]);
    });
  });

  it("cancels the turn in flight, which then shows as cancelled with Retry (LOOM-99)", async () => {
    const user = userEvent.setup();
    const conv = {
      messages: [userMsg("m1", "refactor everything", "d1")] as unknown[],
      tasks: [] as unknown[],
      dispatches: [
        { dispatch_id: "d1", conversation_id: "abc123", status: "running", created_at: T0, started_at: T0 },
      ] as unknown[],
    };
    const server = fakeServer(conv);
    renderPage();

    const card = await screen.findByRole("region", { name: /turn in progress/i });
    await user.click(within(card).getByRole("button", { name: /cancel/i }));
    await waitFor(() => expect(server.cancels).toEqual(["d1"]));
    expect(within(card).getByRole("button", { name: /cancelling/i })).toBeDisabled();

    conv.dispatches = [
      {
        dispatch_id: "d1",
        conversation_id: "abc123",
        status: "failed",
        error: "cancelled by the user",
        error_class: "cancelled",
        created_at: T0,
      },
    ];
    act(() =>
      stream.push({ dispatch_id: "d1", status: "failed", error_class: "cancelled", updated_at: T0 } satisfies DispatchUpdateEvent),
    );

    const cancelled = await screen.findByRole("region", { name: /you cancelled this turn/i });
    expect(within(cancelled).getByRole("button", { name: /retry/i })).toBeEnabled();
    expect(screen.queryByRole("region", { name: /turn in progress/i })).not.toBeInTheDocument();
  });

  it("says so when a cancel comes too late, and leaves the turn to finish", async () => {
    const user = userEvent.setup();
    const server = fakeServer({
      messages: [userMsg("m1", "quick one", "d1")],
      tasks: [],
      dispatches: [{ dispatch_id: "d1", conversation_id: "abc123", status: "running", created_at: T0, started_at: T0 }],
    });
    server.respondToCancelWith(() => jsonResponse({ error: "the dispatch isn't running" }, 409));
    renderPage();

    const card = await screen.findByRole("region", { name: /turn in progress/i });
    await user.click(within(card).getByRole("button", { name: /cancel/i }));
    expect(await screen.findByText(/already finished/i)).toBeInTheDocument();
  });

  // The stream can miss the end of a quick turn (it records jobs already
  // finished on its first poll without sending them), so the page keeps
  // looking every few seconds while a turn is in flight, connected or not.
  it("notices a turn's end the stream never reported", async () => {
    const conv = {
      messages: [userMsg("m1", "answer: the sky is blue", "d1")] as unknown[],
      tasks: [] as unknown[],
      dispatches: [{ dispatch_id: "d1", conversation_id: "abc123", status: "running", created_at: T0, started_at: T0 }] as unknown[],
    };
    fakeServer(conv);
    renderPage();
    await screen.findByRole("region", { name: /turn in progress/i });
    conv.dispatches = [{ dispatch_id: "d1", conversation_id: "abc123", status: "succeeded", created_at: T0 }];
    conv.messages = [...conv.messages, { id: "m2", role: "assistant", content: "e2e answer: the sky is blue", task_id: "", created_at: T0 }];
    expect(await screen.findByText("e2e answer: the sky is blue", {}, { timeout: 7000 })).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: /turn in progress/i })).not.toBeInTheDocument();
  }, 10_000);

  // "Send when done" holds a message during a turn. The server reads the
  // next message as the answer to whatever is waiting, so a held message
  // only goes if the finished turn left nothing to answer.
  describe("a message held during a turn", () => {
    const running = () => ({
      messages: [userMsg("m1", "deploy it", "d1")] as unknown[],
      tasks: [] as unknown[],
      dispatches: [{ dispatch_id: "d1", conversation_id: "abc123", status: "running", created_at: T0, started_at: T0 }] as unknown[],
      confirmations: [] as unknown[],
    });

    async function holdThenFinish(conv: ReturnType<typeof running>, leave: (conv: ReturnType<typeof running>) => void, text = "ok") {
      const user = userEvent.setup();
      const server = fakeServer(conv);
      renderPage();
      await screen.findByRole("region", { name: /turn in progress/i });
      await user.type(screen.getByPlaceholderText(/message the agent fleet/i), text);
      await user.click(screen.getByRole("button", { name: "Send when done" }));
      expect(screen.getByText(/sends when this turn finishes/i)).toBeInTheDocument();

      conv.dispatches = [{ dispatch_id: "d1", conversation_id: "abc123", status: "succeeded", created_at: T0 }];
      conv.messages = [...conv.messages, { id: "m2", role: "assistant", content: "done with that", task_id: "t1", created_at: T0 }];
      leave(conv);
      act(() => stream.push({ dispatch_id: "d1", status: "succeeded", updated_at: T0 } satisfies DispatchUpdateEvent));
      await screen.findByText("done with that");
      return server;
    }

    it("goes once the turn ends with nothing waiting", async () => {
      const server = await holdThenFinish(running(), () => {}, "next step");
      await waitFor(() => expect(server.posts).toHaveLength(1));
      expect(server.posts[0].body.message).toBe("next step");
      expect(server.posts[0].body).not.toHaveProperty("confirmation_id");
    });

    it("isn't sent when the turn ended at an agent's prompt: an \"ok\" must not approve it", async () => {
      const server = await holdThenFinish(running(), (conv) => {
        conv.tasks = [
          {
            id: "t1",
            workspace_id: "ws-1",
            kind: "agent",
            agent_type: "claude-code",
            status: "needs_attention",
            created_at: T0,
            updated_at: "2026-10-05T10:00:30Z",
            attention: { kind: "permission", title: "Bash command", detail: "rm -rf build", selected: 0 },
          },
        ];
      });
      expect(await screen.findByText(/Not sent: something in this conversation needs your answer first/)).toBeInTheDocument();
      expect(screen.getByPlaceholderText(/message the agent fleet/i)).toHaveValue("ok");
      expect(screen.getByRole("region", { name: "claude-code needs your approval" })).toBeInTheDocument();
      expect(server.posts).toHaveLength(0);
    });

    it("isn't sent when the turn ended with an offer waiting", async () => {
      const server = await holdThenFinish(running(), (conv) => {
        conv.confirmations = [
          {
            id: "conf-9",
            dispatch_id: "d1",
            kind: "run_command",
            command: "kubectl -n staging rollout restart deploy/ledger-api",
            status: "pending",
            created_at: T0,
            expires_at: new Date(Date.now() + 10 * 60_000).toISOString(),
          },
        ];
        conv.messages = [
          userMsg("m1", "deploy it", "d1"),
          { id: "m2", role: "assistant", content: "done with that", task_id: "", dispatch_id: "d1", created_at: T0 },
        ];
      }, "yes");
      expect(await screen.findByText(/Not sent/)).toBeInTheDocument();
      expect(screen.getByPlaceholderText(/message the agent fleet/i)).toHaveValue("yes");
      expect(server.posts).toHaveLength(0);
    });

    it("isn't sent when the turn failed", async () => {
      const conv = running();
      const user = userEvent.setup();
      const server = fakeServer(conv);
      renderPage();
      await screen.findByRole("region", { name: /turn in progress/i });
      await user.type(screen.getByPlaceholderText(/message the agent fleet/i), "and then this");
      await user.click(screen.getByRole("button", { name: "Send when done" }));
      conv.dispatches = [
        { dispatch_id: "d1", conversation_id: "abc123", status: "failed", error_class: "timeout", error: "took too long", created_at: T0 },
      ];
      act(() => stream.push({ dispatch_id: "d1", status: "failed", error_class: "timeout", updated_at: T0 } satisfies DispatchUpdateEvent));
      expect(await screen.findByText(/Not sent/)).toBeInTheDocument();
      expect(server.posts).toHaveLength(0);
    });
  });
});
