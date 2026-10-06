import { describe, expect, it, vi, afterEach } from "vitest";
import { api, ApiError } from "./api";

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
      ].sort(),
    );
  });
});
