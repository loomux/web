import { afterEach, describe, expect, it, vi } from "vitest";
import { api, ApiError, PluginCheckError } from "./api";
import { aPlugin } from "../test/pluginFixtures";

function respond(status: number, body?: unknown) {
  return new Response(body === undefined ? null : JSON.stringify(body), { status });
}

describe("plugin API calls", () => {
  const originalFetch = globalThis.fetch;
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  function serve(status: number, body?: unknown) {
    const calls: { url: string; method: string; body?: unknown }[] = [];
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push({ url: String(input), method: init?.method ?? "GET", body: init?.body ? JSON.parse(String(init.body)) : undefined });
      return respond(status, body);
    }) as typeof fetch;
    return calls;
  }

  it("turns a 422 carrying the plugin into a PluginCheckError with it", async () => {
    const failed = aPlugin({ status: "error", status_reason: "can't reach the API server", check: { ok: false, problems: [{ code: "unreachable", message: "no route", severity: "error" }] } });
    const calls = serve(422, failed);
    const err = await api.installPlugin("tok", { plugin: "kubernetes", source: "socket", label: "wysekube", config: { namespace: "a" } }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(PluginCheckError);
    expect((err as PluginCheckError).plugin.check?.problems[0].code).toBe("unreachable");
    expect((err as PluginCheckError).message).toBe("can't reach the API server");
    expect(calls[0]).toMatchObject({ url: "/api/v1/plugins", method: "POST", body: { plugin: "kubernetes", source: "socket", label: "wysekube", config: { namespace: "a" } } });
  });

  it("keeps a 422 with an {error} body (an unverified build, LOOM-218) a plain ApiError", async () => {
    serve(422, { error: "attestation: no signature for the plugin's sha256", code: "unprocessable" });
    const err = await api.pluginAction("tok", "p-1", "upgrade").catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err).not.toBeInstanceOf(PluginCheckError);
    expect((err as ApiError).message).toBe("attestation: no signature for the plugin's sha256");
  });

  it("puts the config under {config} and the uninstall choice in the query", async () => {
    let calls = serve(200, aPlugin());
    await api.setPluginConfig("tok", "p 1", { token: "" });
    expect(calls[0]).toMatchObject({ url: "/api/v1/plugins/p%201/config", method: "PUT", body: { config: { token: "" } } });
    calls = serve(204);
    await api.uninstallPlugin("tok", "p-1", "keep");
    expect(calls[0]).toMatchObject({ url: "/api/v1/plugins/p-1?targets=keep", method: "DELETE" });
    calls = serve(204);
    await api.uninstallPlugin("tok", "p-1");
    expect(calls[0].url).toBe("/api/v1/plugins/p-1");
  });

  it("reads null from a server without the describe route, and throws other failures", async () => {
    serve(404, { error: "no route", code: "not_found" });
    expect(await api.describeMachines("tok", "p-1")).toBeNull();
    serve(405, { error: "method", code: "method_not_allowed" });
    expect(await api.describeMachines("tok", "p-1")).toBeNull();
    serve(500, { error: "boom" });
    await expect(api.describeMachines("tok", "p-1")).rejects.toBeInstanceOf(ApiError);
  });

  it("creates a machine with the plugin object and drives its lifecycle", async () => {
    let calls = serve(201, { id: "t-1" });
    await api.createMachine("tok", { name: "cc", plugin: { id: "p-1", size: "large", persistent: true, egress: "trusted" } });
    expect(calls[0]).toMatchObject({ url: "/api/v1/targets", method: "POST", body: { name: "cc", plugin: { id: "p-1", egress: "trusted" } } });
    calls = serve(202, { id: "t-1" });
    await api.recreateMachine("tok", "t-1");
    expect(calls[0]).toMatchObject({ url: "/api/v1/targets/t-1/recreate", method: "POST", body: {} });
    calls = serve(202, { id: "t-1" });
    await api.stopMachine("tok", "t-1");
    expect(calls[0]).toMatchObject({ url: "/api/v1/targets/t-1/stop", method: "POST" });
  });
});
