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
});
