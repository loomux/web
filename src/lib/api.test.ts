import { describe, expect, it, vi, afterEach } from "vitest";
import { api, ApiError, normalizeStatus, openConversationStream, type StreamEvent } from "./api";

type SSEOptions = { onmessage: (msg: { event: string; data: string }) => void };
const sse = vi.hoisted(() => ({ options: null as SSEOptions | null }));
vi.mock("@microsoft/fetch-event-source", () => ({
  fetchEventSource: (_url: string, options: SSEOptions) => {
    sse.options = options;
    return new Promise(() => {});
  },
}));

describe("api", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("returns parsed JSON on success", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ token: "abc123" }), { status: 200 }),
    );

    const result = await api.login("hunter2");

    expect(result).toEqual({ token: "abc123" });
    expect(globalThis.fetch).toHaveBeenCalledWith(
      "/api/v1/login",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("throws ApiError with the server's error message on failure", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ error: "invalid password" }), {
        status: 401,
      }),
    );

    await expect(api.login("wrong")).rejects.toMatchObject(
      new ApiError(401, "invalid password"),
    );
  });

  it("reads the machine-readable code beside the message (API v1)", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ error: "a turn is already running", code: "conversation_busy", dispatch_id: "d1" }), {
        status: 409,
      }),
    );

    const err = await api.dispatch("t", "c1", "hi").catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err).toMatchObject({ status: 409, message: "a turn is already running", code: "conversation_busy", dispatchId: "d1" });
  });

  it("leaves code unset for a pre-1.0 server's error body", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ error: "not found" }), { status: 404 }),
    );

    const err = await api.getDispatch("t", "d1").catch((e: unknown) => e);
    expect(err).toMatchObject({ status: 404, message: "not found" });
    expect((err as ApiError).code).toBeUndefined();
  });

  it("falls back to statusText when the error body isn't JSON", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response("not json", { status: 500, statusText: "Server Error" }),
    );

    await expect(api.getVersion()).rejects.toMatchObject(
      new ApiError(500, "Server Error"),
    );
  });

  it("sends the Authorization header for token-scoped calls", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ workspaces: [] }), { status: 200 }),
    );

    await api.listWorkspaces("my-token");

    const [, init] = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    const headers = init.headers as Headers;
    expect(headers.get("Authorization")).toBe("Bearer my-token");
  });

  // Task statuses: pre-1.0 servers spell them in kebab-case, API v1 in
  // snake_case. Whichever the server sends, the client sees snake_case.
  describe("status normalisation", () => {
    it("turns either spelling into snake_case", () => {
      expect(normalizeStatus("awaiting-input")).toBe("awaiting_input");
      expect(normalizeStatus("needs-attention")).toBe("needs_attention");
      expect(normalizeStatus("human-takeover")).toBe("human_takeover");
      expect(normalizeStatus("awaiting_input")).toBe("awaiting_input");
      expect(normalizeStatus("running")).toBe("running");
    });

    it.each([["awaiting-input"], ["awaiting_input"]])("listConversations reads %s as awaiting_input", async (status) => {
      globalThis.fetch = vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({ conversations: [{ conversation_id: "c1", workspace_id: "w1", status, updated_at: "x" }] }),
          { status: 200 },
        ),
      );
      const res = await api.listConversations("t");
      expect(res.conversations[0].status).toBe("awaiting_input");
    });

    it.each([["needs-attention"], ["needs_attention"]])("getConversation reads a task's %s as needs_attention", async (status) => {
      globalThis.fetch = vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            conversation_id: "c1",
            tasks: [{ id: "t1", workspace_id: "w1", kind: "agent", agent_type: "a", status, created_at: "x", updated_at: "x" }],
            messages: [],
          }),
          { status: 200 },
        ),
      );
      const res = await api.getConversation("t", "c1");
      expect(res.tasks[0].status).toBe("needs_attention");
      expect(res.messages).toEqual([]);
    });

    it.each([["human-takeover"], ["human_takeover"]])("the stream reads a task_update's %s as human_takeover", (status) => {
      const events: StreamEvent[] = [];
      const stop = openConversationStream("t", "c1", {
        onEvent: (e) => events.push(e),
        onConnected: () => {},
        onUnauthorized: () => {},
      });
      sse.options!.onmessage({
        event: "task_update",
        data: JSON.stringify({ task_id: "t1", workspace_id: "w1", status, updated_at: "x" }),
      });
      stop();
      expect(events).toEqual([
        { type: "task_update", data: { task_id: "t1", workspace_id: "w1", status: "human_takeover", updated_at: "x" } },
      ]);
    });
  });

  // The contract with loomux/server's api/server.go route table: each
  // client function's method and path. A path or method drifting from
  // the server shows up here, not in production.
  it.each([
    ["login", () => api.login("p"), "POST", "/api/v1/login"],
    ["logout", () => api.logout("t"), "POST", "/api/v1/logout"],
    ["dispatch", () => api.dispatch("t", "c1", "hi"), "POST", "/api/v1/dispatch"],
    ["listWorkspaces", () => api.listWorkspaces("t"), "GET", "/api/v1/workspaces"],
    ["deleteWorkspace", () => api.deleteWorkspace("t", "w1"), "DELETE", "/api/v1/workspaces/w1"],
    ["setWorkspaceStatus", () => api.setWorkspaceStatus("t", "w1", "archived"), "PATCH", "/api/v1/workspaces/w1"],
    ["listConversations", () => api.listConversations("t"), "GET", "/api/v1/conversations"],
    ["getConversation", () => api.getConversation("t", "c1"), "GET", "/api/v1/conversations/c1"],
    ["getDispatch", () => api.getDispatch("t", "d1"), "GET", "/api/v1/dispatches/d1"],
    ["cancelDispatch", () => api.cancelDispatch("t", "d1"), "POST", "/api/v1/dispatches/d1/cancel"],
    ["listTargets", () => api.listTargets("t"), "GET", "/api/v1/targets"],
    ["createTarget", () => api.createTarget("t", { name: "n", kind: "local" } as never), "POST", "/api/v1/targets"],
    ["updateTarget", () => api.updateTarget("t", "x1", { name: "n", kind: "local" } as never), "PUT", "/api/v1/targets/x1"],
    ["deleteTarget", () => api.deleteTarget("t", "x1"), "DELETE", "/api/v1/targets/x1"],
    ["listCredentials", () => api.listCredentials("t"), "GET", "/api/v1/credentials"],
    ["createCredential", () => api.createCredential("t", { name: "N", value: "v" }), "POST", "/api/v1/credentials"],
    ["setCredentialValue", () => api.setCredentialValue("t", "k1", "v"), "PUT", "/api/v1/credentials/k1/value"],
    ["deleteCredential", () => api.deleteCredential("t", "k1"), "DELETE", "/api/v1/credentials/k1"],
    ["getAttachInfo", () => api.getAttachInfo("t", "task1"), "GET", "/api/v1/tasks/task1/attach-info"],
    ["getVersion", () => api.getVersion(), "GET", "/api/v1/version"],
    ["getWebVersion", () => api.getWebVersion("t"), "GET", "/api/v1/web/version"],
    ["updateWeb", () => api.updateWeb("t"), "POST", "/api/v1/web/update"],
    ["rollbackWeb", () => api.rollbackWeb("t"), "POST", "/api/v1/web/rollback"],
    ["getTaskTranscript", () => api.getTaskTranscript("t", "task1"), "GET", "/api/v1/tasks/task1/transcript"],
    ["getConversationEvents", () => api.getConversationEvents("t", "c1"), "GET", "/api/v1/conversations/c1/events"],
    ["scanHostKey", () => api.scanHostKey("t", "x1"), "POST", "/api/v1/targets/x1/scan-host-key"],
    ["pinHostKey", () => api.pinHostKey("t", "x1", "SHA256:a"), "POST", "/api/v1/targets/x1/pin"],
    ["unpinHostKey", () => api.unpinHostKey("t", "x1"), "DELETE", "/api/v1/targets/x1/pin"],
    ["testTarget", () => api.testTarget("t", "x1"), "POST", "/api/v1/targets/x1/test"],
    ["probeTarget", () => api.probeTarget("t", "x1"), "POST", "/api/v1/targets/x1/probe"],
    ["listSessions", () => api.listSessions("t"), "GET", "/api/v1/sessions"],
    ["deleteSession", () => api.deleteSession("t", "s1"), "DELETE", "/api/v1/sessions/s1"],
    ["getDeepHealth", () => api.getDeepHealth("t"), "GET", "/api/v1/health/deep"],
    ["getTaskPane", () => api.getTaskPane("t", "task1"), "GET", "/api/v1/tasks/task1/pane"],
    ["listSSHKeys", () => api.listSSHKeys("t"), "GET", "/api/v1/ssh-keys"],
    ["createSSHKey", () => api.createSSHKey("t", "k"), "POST", "/api/v1/ssh-keys"],
    ["deleteSSHKey", () => api.deleteSSHKey("t", "k1"), "DELETE", "/api/v1/ssh-keys/k1"],
    ["migrateSSH", () => api.migrateSSH("t", "x1", { dry_run: true }).catch(() => undefined), "POST", "/api/v1/targets/x1/migrate-ssh"],
  ] as const)("%s calls %s %s", async (_name, call, method, path) => {
    globalThis.fetch = vi.fn().mockResolvedValue(new Response("{}", { status: 200 }));
    await call();
    const [url, init] = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toBe(path);
    expect((init?.method ?? "GET").toUpperCase()).toBe(method);
  });

  it("covers every client function", () => {
    // A new function needs a row above.
    expect(Object.keys(api).sort()).toEqual(
      [
        "cancelDispatch", "createCredential", "createTarget", "deleteCredential", "deleteTarget", "deleteWorkspace",
        "dispatch", "getAttachInfo", "getConversation", "getDispatch", "getVersion", "getWebVersion", "listConversations",
        "listCredentials", "listTargets", "listWorkspaces", "login", "logout", "rollbackWeb", "setCredentialValue",
        "setWorkspaceStatus", "updateTarget", "updateWeb",
        "getTaskTranscript", "getConversationEvents", "scanHostKey", "pinHostKey", "unpinHostKey", "testTarget",
        "probeTarget", "listSessions", "deleteSession", "getDeepHealth", "getTaskPane",
        "listSSHKeys", "createSSHKey", "deleteSSHKey", "migrateSSH",
      ].sort(),
    );
  });
});

// LOOM-138: migrate-ssh answers a plan it couldn't apply (409), or one
// whose test failed and was rolled back (502), with its own body: those
// come back as results, not errors. Anything else is an ApiError.
describe("migrateSSH", () => {
  const plan = { target_id: "x1", dry_run: false, can_apply: false, problems: ["ProxyJump"], plan: { host: "h", ssh_port: 22, user: "u", ssh_proxy: "none", key: null, host_keys: [] }, applied: false, rolled_back: false, test: null, target: null };
  it.each([200, 409, 502])("returns the body on %i", async (status) => {
    globalThis.fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify(plan), { status }));
    const r = await api.migrateSSH("t", "x1", { dry_run: false });
    expect(r.status).toBe(status);
    expect(r.result.problems).toEqual(["ProxyJump"]);
  });
  it("throws on an {error} answer", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: "another target is being migrated" }), { status: 409 }));
    await expect(api.migrateSSH("t", "x1", { dry_run: false })).rejects.toMatchObject({ status: 409, message: "another target is being migrated" });
  });
});

