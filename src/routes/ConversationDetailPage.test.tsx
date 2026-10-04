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
      if (url === "/api/v1/workspaces") {
        return jsonResponse({ workspaces: [] });
      }
      throw new Error(`unexpected fetch: ${url}`);
    });

    renderPage();

    expect(await screen.findByText("hi there")).toBeInTheDocument();
    expect(await screen.findByText("hello back")).toBeInTheDocument();
    expect(screen.queryByText(/LOOM-31/)).not.toBeInTheDocument();
  });

  it("renders a relative timestamp with an absolute tooltip for each persisted message", async () => {
    localStorage.setItem("loomux.token", "tok-1");
    const now = new Date("2026-09-01T00:12:00Z").getTime();
    vi.spyOn(Date, "now").mockReturnValue(now);

    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === "/api/v1/conversations/abc123") {
        return jsonResponse({
          conversation_id: "abc123",
          tasks: [],
          messages: [
            { id: "m1", role: "user", content: "hi there", task_id: "t1", created_at: "2026-09-01T00:00:00Z" },
            { id: "m2", role: "assistant", content: "hello back", task_id: "t1", created_at: "2026-09-01T00:05:00Z" },
          ],
        });
      }
      if (url === "/api/v1/workspaces") {
        return jsonResponse({ workspaces: [] });
      }
      throw new Error(`unexpected fetch: ${url}`);
    });

    renderPage();

    expect(await screen.findByText("12m ago")).toBeInTheDocument();
    expect(screen.getByText("7m ago")).toBeInTheDocument();

    const timestamps = screen.getAllByText(/\d+m ago$/).map((el) => el.closest("time"));
    expect(timestamps[0]).toHaveAttribute("datetime", "2026-09-01T00:00:00.000Z");
    expect(timestamps[1]).toHaveAttribute("datetime", "2026-09-01T00:05:00.000Z");
  });

  it("shows the latest task's workspace name in the header, falling back to the raw workspace_id", async () => {
    localStorage.setItem("loomux.token", "tok-1");
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === "/api/v1/conversations/abc123") {
        return jsonResponse({
          conversation_id: "abc123",
          tasks: [
            { id: "t1", workspace_id: "ws-a", kind: "agent", agent_type: "default", status: "running", created_at: "2026-09-01T00:00:00Z", updated_at: "2026-09-01T00:00:00Z" },
          ],
          messages: [],
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

    expect(await screen.findByText(/Alpha Workspace/)).toBeInTheDocument();
    expect(screen.queryByText(/ws-a/)).not.toBeInTheDocument();
  });

  it("renders markdown in message content, with fenced code blocks distinct from surrounding prose", async () => {
    localStorage.setItem("loomux.token", "tok-1");
    const reply = [
      "Here's the fix:",
      "",
      "```python",
      "def add(a, b):",
      "    return a + b",
      "```",
      "",
      "Then call **add(1, 2)**.",
    ].join("\n");

    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === "/api/v1/conversations/abc123") {
        return jsonResponse({
          conversation_id: "abc123",
          tasks: [],
          messages: [{ id: "m1", role: "assistant", content: reply, task_id: "t1", created_at: "2026-09-01T00:00:00Z" }],
        });
      }
      if (url === "/api/v1/workspaces") {
        return jsonResponse({ workspaces: [] });
      }
      throw new Error(`unexpected fetch: ${url}`);
    });

    const { container } = renderPage();

    expect(await screen.findByText("Here's the fix:")).toBeInTheDocument();

    const codeBlock = container.querySelector("pre code");
    expect(codeBlock).not.toBeNull();
    expect(codeBlock?.textContent).toContain("def add(a, b):");
    expect(codeBlock?.className).toContain("language-python");

    // Bold prose renders as a <strong> element, not literal `**` markers.
    expect(container.querySelector("strong")?.textContent).toBe("add(1, 2)");
    expect(container.textContent).not.toContain("**");
  });

  it("shows an empty-state message with no stale LOOM-31 reference when there is no transcript", async () => {
    localStorage.setItem("loomux.token", "tok-1");
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === "/api/v1/conversations/abc123") {
        return jsonResponse({ conversation_id: "abc123", tasks: [], messages: [] });
      }
      if (url === "/api/v1/workspaces") {
        return jsonResponse({ workspaces: [] });
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

      if (url === "/api/v1/workspaces") {
        return jsonResponse({ workspaces: [] });
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

  it("disables the input while a dispatch is in flight so a second submit can't race the first", async () => {
    localStorage.setItem("loomux.token", "tok-1");
    const user = userEvent.setup();

    let dispatchCalls = 0;
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
            ? []
            : [
                { id: "m1", role: "user", content: "first message", task_id: "t1", created_at: "2026-09-01T00:00:00Z" },
                { id: "m2", role: "assistant", content: "ack", task_id: "t1", created_at: "2026-09-01T00:00:01Z" },
              ];
        return jsonResponse({ conversation_id: "abc123", tasks: [], messages });
      }

      if (url === "/api/v1/dispatch" && method === "POST") {
        dispatchCalls += 1;
        return dispatchPromise;
      }

      if (url === "/api/v1/workspaces") {
        return jsonResponse({ workspaces: [] });
      }

      throw new Error(`unexpected fetch: ${method} ${url}`);
    });

    renderPage();

    const input = screen.getByPlaceholderText(/message the agent fleet/i);
    await waitFor(() => expect(input).not.toBeDisabled());

    await user.type(input, "first message");
    await user.click(screen.getByRole("button", { name: /send/i }));

    expect(await screen.findByText("first message")).toBeInTheDocument();
    await waitFor(() => expect(input).toBeDisabled());

    // Typing/submitting while the first dispatch is still pending must not
    // fire a second one — the input is disabled, so this is a no-op.
    await user.type(input, "second message");
    await user.keyboard("{Enter}");

    expect(dispatchCalls).toBe(1);
    expect(screen.queryByText("second message")).not.toBeInTheDocument();

    resolveDispatch(jsonResponse({ reply: "ack" }));

    expect(await screen.findByText("ack")).toBeInTheDocument();
    await waitFor(() => expect(dispatchCalls).toBe(1));
  });

  // LOOM-87: the router is told which workspace the conversation is in, so a
  // follow-up ("yes, go ahead") is routed back to it.
  async function sendAndCaptureDispatchBody(tasks: unknown[]): Promise<Record<string, unknown>> {
    localStorage.setItem("loomux.token", "tok-1");
    const user = userEvent.setup();
    let body: Record<string, unknown> | null = null;
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? "GET";
      if (url === "/api/v1/conversations/abc123" && method === "GET") {
        return jsonResponse({ conversation_id: "abc123", tasks, messages: [] });
      }
      if (url === "/api/v1/dispatch" && method === "POST") {
        body = JSON.parse(String(init?.body));
        return jsonResponse({ reply: "ok" });
      }
      if (url === "/api/v1/workspaces") {
        return jsonResponse({ workspaces: [] });
      }
      throw new Error(`unexpected fetch: ${method} ${url}`);
    });

    renderPage();
    await waitFor(() => expect(screen.getByPlaceholderText(/message the agent fleet/i)).not.toBeDisabled());
    await user.type(screen.getByPlaceholderText(/message the agent fleet/i), "yes, go ahead");
    await user.click(screen.getByRole("button", { name: /send/i }));
    await waitFor(() => expect(body).not.toBeNull());
    return body!;
  }

  it("sends the conversation's current workspace as workspace_hint", async () => {
    const task = (id: string, workspace: string, updated: string) => ({
      id, workspace_id: workspace, kind: "agent", agent_type: "claude-code", status: "awaiting-input",
      created_at: updated, updated_at: updated,
    });
    const body = await sendAndCaptureDispatchBody([
      task("t1", "ws-old", "2026-09-01T00:00:00Z"),
      task("t2", "ws-current", "2026-09-01T00:05:00Z"),
    ]);
    expect(body).toEqual({ conversation_id: "abc123", message: "yes, go ahead", workspace_hint: "ws-current" });
  });

  it("sends no workspace_hint when the conversation has no workspace yet", async () => {
    const body = await sendAndCaptureDispatchBody([]);
    expect(body).toEqual({ conversation_id: "abc123", message: "yes, go ahead" });
  });

  // Replays the 2026-10-04 live session (LOOM-87 follow-up): a brand-new
  // conversation (its first fetch 404s), a direct answer, a proposed command,
  // "yes" (which runs it as a command task in the target's shell workspace),
  // more commands, then an agent turn. The hint is the workspace the router
  // can route to — an agent task's — never a command task's shell workspace,
  // which the router is never offered.
  it("hints the latest agent task's workspace, never a command task's shell workspace", async () => {
    localStorage.setItem("loomux.token", "tok-1");
    const user = userEvent.setup();
    const bodies: Record<string, unknown>[] = [];
    const task = (id: string, workspace: string, kind: string, at: string) => ({
      id, workspace_id: workspace, kind, agent_type: kind === "agent" ? "claude-code" : "", status: "completed",
      created_at: at, updated_at: at,
    });
    const cmdTask = task("t-cmd", "ws-shell-jet01", "command", "2026-10-04T15:05:05Z");
    const agentTask = task("t-agent", "ws-project", "agent", "2026-10-04T15:07:07Z");
    const cmdAfter = task("t-cmd2", "ws-shell-jet01", "command", "2026-10-04T15:09:00Z");
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? "GET";
      if (url === "/api/v1/conversations/abc123" && method === "GET") {
        if (bodies.length === 0) return jsonResponse({ error: "no such conversation" }, 404);
        const tasks = [cmdTask, agentTask, cmdAfter].slice(0, Math.max(0, bodies.length - 2));
        return jsonResponse({ conversation_id: "abc123", tasks, messages: [] });
      }
      if (url === "/api/v1/dispatch" && method === "POST") {
        bodies.push(JSON.parse(String(init?.body)));
        return jsonResponse({ reply: `reply ${bodies.length}` });
      }
      if (url === "/api/v1/workspaces") {
        return jsonResponse({ workspaces: [] });
      }
      throw new Error(`unexpected fetch: ${method} ${url}`);
    });

    renderPage();
    const box = () => screen.getByPlaceholderText(/message the agent fleet/i);
    const messages = ["hi", "check disk on jet01", "yes", "now start claude in my project", "and memory?", "yes, go ahead"];
    for (const [i, text] of messages.entries()) {
      await waitFor(() => expect(box()).not.toBeDisabled());
      await user.type(box(), text);
      await user.click(screen.getByRole("button", { name: /send/i }));
      await waitFor(() => expect(bodies).toHaveLength(i + 1));
      await waitFor(() => expect(box()).not.toBeDisabled());
    }
    // Tasks seen before each send: none, none, none, [cmd], [cmd, agent], [cmd, agent, cmd].
    expect(bodies.map((b) => b.workspace_hint)).toEqual([undefined, undefined, undefined, undefined, "ws-project", "ws-project"]);
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

      if (url === "/api/v1/workspaces") {
        return jsonResponse({ workspaces: [] });
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

  it("uses a multiline composer where Shift+Enter inserts a newline and Enter sends", async () => {
    localStorage.setItem("loomux.token", "tok-1");
    const user = userEvent.setup();

    let dispatchCalls = 0;
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? "GET";

      if (url === "/api/v1/conversations/abc123" && method === "GET") {
        return jsonResponse({ conversation_id: "abc123", tasks: [], messages: [] });
      }

      if (url === "/api/v1/dispatch" && method === "POST") {
        dispatchCalls += 1;
        return jsonResponse({ reply: "ack" });
      }

      throw new Error(`unexpected fetch: ${method} ${url}`);
    });

    renderPage();

    const composer = await screen.findByPlaceholderText(/message the agent fleet/i);
    expect(composer.tagName.toLowerCase()).toBe("textarea");

    await user.type(composer, "line one");
    await user.keyboard("{Shift>}{Enter}{/Shift}");

    expect(composer).toHaveValue("line one\n");
    expect(dispatchCalls).toBe(0);

    await user.keyboard("{Enter}");

    await waitFor(() => expect(dispatchCalls).toBe(1));
    await waitFor(() => expect(composer).toHaveValue(""));
  });
  // LOOM-97: a needs-attention task's prompt is shown as a card whose
  // buttons answer it with an ordinary chat message.
  async function answerFromCard(click: (user: ReturnType<typeof userEvent.setup>) => Promise<void>) {
    localStorage.setItem("loomux.token", "tok-1");
    const user = userEvent.setup();
    const bodies: Record<string, unknown>[] = [];
    const task = {
      id: "t1", workspace_id: "ws-1", kind: "agent", agent_type: "claude-code", status: "needs-attention",
      created_at: "2026-10-04T18:00:00Z", updated_at: "2026-10-04T18:00:00Z",
      attention: {
        kind: "permission", title: "Bash command", detail: "rm -rf build", question: "Do you want to proceed?",
        options: [{ label: "Yes" }, { label: "Yes, and don't ask again" }, { label: "No" }], selected: 0,
      },
    };
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? "GET";
      if (url === "/api/v1/conversations/abc123" && method === "GET") {
        return jsonResponse({ conversation_id: "abc123", tasks: [task], messages: [] });
      }
      if (url === "/api/v1/dispatch" && method === "POST") {
        bodies.push(JSON.parse(String(init?.body)));
        return jsonResponse({ reply: "done" });
      }
      if (url === "/api/v1/workspaces") return jsonResponse({ workspaces: [] });
      if (url.startsWith("/api/v1/tasks/")) return jsonResponse({ error: "nope" }, 404);
      throw new Error(`unexpected fetch: ${method} ${url}`);
    });
    renderPage();
    expect(await screen.findByRole("region", { name: /agent needs attention/i })).toBeInTheDocument();
    expect(screen.getByText("claude-code needs your approval")).toBeInTheDocument();
    expect(screen.getByText("rm -rf build")).toBeInTheDocument();
    await click(user);
    await waitFor(() => expect(bodies).toHaveLength(1));
    return bodies[0];
  }

  it("approves a prompt from its card", async () => {
    const body = await answerFromCard((user) => user.click(screen.getByRole("button", { name: "Approve" })));
    expect(body.message).toBe("approve");
  });

  it("picks a prompt's option by number from its card", async () => {
    const body = await answerFromCard((user) => user.click(screen.getByRole("button", { name: /3\. No/ })));
    expect(body.message).toBe("3");
  });

  it("replies to a prompt in words from its card", async () => {
    const body = await answerFromCard(async (user) => {
      await user.type(screen.getByLabelText(/reply to the agent/i), "use make clean");
      await user.click(screen.getByRole("button", { name: "Reply" }));
    });
    expect(body.message).toBe("use make clean");
  });
  it("focuses the composer when a conversation opens", async () => {
    localStorage.setItem("loomux.token", "tok-1");
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === "/api/v1/conversations/abc123") return jsonResponse({ error: "no such conversation" }, 404);
      if (url === "/api/v1/workspaces") return jsonResponse({ workspaces: [] });
      throw new Error(`unexpected fetch: ${url}`);
    });
    renderPage();
    const composer = await screen.findByPlaceholderText(/message the agent fleet/i);
    await waitFor(() => expect(composer).toHaveFocus());
  });
});
