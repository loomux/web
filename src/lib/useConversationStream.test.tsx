import { describe, expect, it, vi, afterEach } from "vitest";
import type { ReactNode } from "react";
import { act, renderHook } from "@testing-library/react";
import { AuthProvider } from "./auth";
import { useConversationStream } from "./useConversationStream";

type Options = {
  onopen: (res: Response) => Promise<void>;
  onclose: () => void;
  onmessage: (msg: { event: string; data: string }) => void;
};
const sse = vi.hoisted(() => ({ options: null as Options | null }));
vi.mock("@microsoft/fetch-event-source", () => ({
  fetchEventSource: (_url: string, options: Options) => {
    sse.options = options;
    return new Promise(() => {});
  },
}));

function wrapper({ children }: { children: ReactNode }) {
  return <AuthProvider>{children}</AuthProvider>;
}

describe("useConversationStream", () => {
  afterEach(() => {
    sse.options = null;
    localStorage.clear();
  });

  // A restart ends the stream cleanly; the stream must come back by itself
  // once Loomux is up, not stay down until the page is reloaded.
  it("retries when the server closes the stream", async () => {
    localStorage.setItem("loomux.token", "tok-1");
    const { result } = renderHook(() => useConversationStream("abc123"), { wrapper });

    await act(() => sse.options!.onopen(new Response("", { status: 200 })));
    expect(result.current.connected).toBe(true);

    act(() => expect(() => sse.options!.onclose()).toThrow());
    expect(result.current.connected).toBe(false);
  });

  // While Loomux restarts, the proxy in front answers with an error page:
  // that's a failed connection to retry, not an open stream.
  it("treats an error response as a failed connection", async () => {
    localStorage.setItem("loomux.token", "tok-1");
    const { result } = renderHook(() => useConversationStream("abc123"), { wrapper });

    await act(async () => {
      await expect(sse.options!.onopen(new Response("bad gateway", { status: 502 }))).rejects.toThrow();
    });
    expect(result.current.connected).toBe(false);
  });

  // LOOM-274: a task taken or given back (task_hold). The same words twice
  // (taken, given back, taken again by the same terminal between two looks)
  // are still two events, so each makes the page look again.
  it("keeps each task_hold as a new event", async () => {
    localStorage.setItem("loomux.token", "tok-1");
    const { result } = renderHook(() => useConversationStream("abc123"), { wrapper });
    const data = JSON.stringify({ task_id: "t1", hold: null, ended_reason: "released" });

    act(() => sse.options!.onmessage({ event: "task_hold", data }));
    const first = result.current.holdEvent;
    expect(first).toEqual({ task_id: "t1", hold: null, ended_reason: "released" });

    act(() => sse.options!.onmessage({ event: "task_hold", data }));
    expect(result.current.holdEvent).toEqual(first);
    expect(result.current.holdEvent).not.toBe(first);
  });

  // 403/404 won't get better by retrying (LOOM-159): the page says the
  // stream is off rather than reconnecting forever.
  it.each([403, 404])("reports a %i as refused", async (status) => {
    localStorage.setItem("loomux.token", "tok-1");
    const { result } = renderHook(() => useConversationStream("abc123"), { wrapper });
    expect(result.current.refused).toBe(false);

    await act(() => sse.options!.onopen(new Response("", { status })));
    expect(result.current.refused).toBe(true);
    expect(result.current.connected).toBe(false);
  });
});
