import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { openConversationStream, streamRetryDelay } from "./api";

// LOOM-159: the real fetchEventSource against a fake fetch and fake
// timers, counting how often the stream is tried.

function openStream() {
  // A 200 whose body stays open, like a live stream.
  return new Response(new ReadableStream({ start() {} }), {
    status: 200,
    headers: { "content-type": "text/event-stream" },
  });
}

let hidden = false;
function setHidden(value: boolean) {
  hidden = value;
  document.dispatchEvent(new Event("visibilitychange"));
}

describe("openConversationStream reconnects", () => {
  const originalFetch = globalThis.fetch;
  let fetchMock: ReturnType<typeof vi.fn>;
  const handlers = () => ({
    onEvent: vi.fn(),
    onConnected: vi.fn(),
    onUnauthorized: vi.fn(),
    onRefused: vi.fn(),
  });

  beforeEach(() => {
    vi.useFakeTimers();
    hidden = false;
    Object.defineProperty(document, "hidden", { configurable: true, get: () => hidden });
    fetchMock = vi.fn();
    globalThis.fetch = fetchMock as unknown as typeof fetch;
  });

  afterEach(() => {
    vi.useRealTimers();
    globalThis.fetch = originalFetch;
  });

  it("backs off from 1s, doubling, capped at 30s", () => {
    const mid = () => 0.5;
    expect([0, 1, 2, 3, 4, 5, 6, 10].map((n) => streamRetryDelay(n, mid))).toEqual([
      1000, 2000, 4000, 8000, 16000, 30000, 30000, 30000,
    ]);
    // Jitter stays within 20% either way.
    expect(streamRetryDelay(0, () => 0)).toBe(800);
    expect(streamRetryDelay(0, () => 1)).toBe(1200);
    expect(streamRetryDelay(10, () => 1)).toBe(36000);
  });

  it("waits longer after each failed try", async () => {
    fetchMock.mockImplementation(async () => new Response("bad gateway", { status: 502 }));
    const h = handlers();
    const stop = openConversationStream("t", "c1", h, () => 0.5);
    await vi.advanceTimersByTimeAsync(0);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1000);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(1999);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(1);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    // The e2e bound (F20): a handful of tries in 12s, not one a second.
    fetchMock.mockClear();
    await vi.advanceTimersByTimeAsync(12_000);
    expect(fetchMock.mock.calls.length).toBeLessThanOrEqual(2);
    expect(h.onConnected).not.toHaveBeenCalledWith(true);
    stop();
  });

  it("starts the backoff over once a connection opens", async () => {
    const replies = [502, 502, 502, 200];
    fetchMock.mockImplementation(async () => {
      const status = replies.shift() ?? 502;
      return status === 200 ? openStream() : new Response("", { status });
    });
    const h = handlers();
    const stop = openConversationStream("t", "c1", h, () => 0.5);
    await vi.advanceTimersByTimeAsync(1000 + 2000 + 4000);
    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(h.onConnected).toHaveBeenLastCalledWith(true);
    stop();

    // A drop after that is tried again in 1s, not 8s.
    fetchMock.mockReset();
    const body = { controller: null as ReadableStreamDefaultController | null };
    fetchMock.mockImplementationOnce(
      async () =>
        new Response(new ReadableStream({ start: (c) => void (body.controller = c) }), {
          status: 200,
          headers: { "content-type": "text/event-stream" },
        }),
    );
    fetchMock.mockImplementation(async () => new Response("", { status: 502 }));
    const h2 = handlers();
    const stop2 = openConversationStream("t", "c1", h2, () => 0.5);
    await vi.advanceTimersByTimeAsync(0);
    expect(h2.onConnected).toHaveBeenLastCalledWith(true);
    body.controller!.error(new Error("dropped"));
    await vi.advanceTimersByTimeAsync(999);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    stop2();
  });

  it.each([403, 404])("stops for good on %i", async (status) => {
    fetchMock.mockImplementation(async () => new Response("", { status }));
    const h = handlers();
    openConversationStream("t", "c1", h, () => 0.5);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(h.onRefused).toHaveBeenCalledWith(status);
    expect(h.onUnauthorized).not.toHaveBeenCalled();
  });

  it("closes while the tab is hidden and opens again when shown", async () => {
    fetchMock.mockImplementation(async () => openStream());
    const h = handlers();
    const stop = openConversationStream("t", "c1", h, () => 0.5);
    await vi.advanceTimersByTimeAsync(0);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const firstSignal = (fetchMock.mock.calls[0][1] as RequestInit).signal!;

    setHidden(true);
    expect(firstSignal.aborted).toBe(true);
    expect(h.onConnected).toHaveBeenLastCalledWith(false);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // Shown again: straight back, and the pause wasn't a failure, so a
    // failed try after it waits the first step (1s).
    fetchMock.mockImplementation(async () => new Response("", { status: 502 }));
    setHidden(false);
    await vi.advanceTimersByTimeAsync(0);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(1000);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    stop();
  });

  it("doesn't retry while hidden after a failure", async () => {
    fetchMock.mockImplementation(async () => new Response("", { status: 502 }));
    const stop = openConversationStream("t", "c1", handlers(), () => 0.5);
    await vi.advanceTimersByTimeAsync(0);
    setHidden(true);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    stop();
  });
});
