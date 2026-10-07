import { afterEach, describe, expect, it, vi } from "vitest";
import { api } from "./api";

// Bodies and queries of the endpoints the redesign starts using (build-plan
// §6, PR 2). Their methods and paths are in api.test.ts's contract table.
describe("api: bodies and queries", () => {
  const originalFetch = globalThis.fetch;
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  function capture(body: unknown = {}, status = 200) {
    const fetchMock = vi.fn().mockResolvedValue(
      status === 204 ? new Response(null, { status }) : new Response(JSON.stringify(body), { status }),
    );
    globalThis.fetch = fetchMock;
    return () => {
      const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      return { url, method: init.method ?? "GET", body: init.body, auth: new Headers(init.headers).get("Authorization") };
    };
  }

  it("pins the fingerprint it's given", async () => {
    const last = capture();
    await api.pinHostKey("t", "tg1", "SHA256:abc");
    expect(last()).toMatchObject({ url: "/api/v1/targets/tg1/pin", method: "POST" });
    expect(JSON.parse(String(last().body))).toEqual({ fingerprint: "SHA256:abc" });
  });

  it("revokes a session with a 204", async () => {
    const last = capture(null, 204);
    await expect(api.deleteSession("t", "s1")).resolves.toBeUndefined();
    expect(last()).toMatchObject({ url: "/api/v1/sessions/s1", method: "DELETE" });
  });

  it("pages a transcript with limit and before", async () => {
    const last = capture({ task_id: "k1", turns: [], has_more: false });
    await api.getTaskTranscript("t", "k1", { limit: 1, before: "turn-9" });
    expect(last().url).toBe("/api/v1/tasks/k1/transcript?limit=1&before=turn-9");
  });

  it("asks for a whole transcript page without a query", async () => {
    const last = capture({ task_id: "k1", turns: [], has_more: false });
    await api.getTaskTranscript("t", "k1");
    expect(last().url).toBe("/api/v1/tasks/k1/transcript");
  });

  it("escapes ids in paths", async () => {
    const last = capture();
    await api.testTarget("t", "a/b");
    expect(last().url).toBe("/api/v1/targets/a%2Fb/test");
  });
});
