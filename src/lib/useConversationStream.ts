import { useEffect, useState } from "react";
import { fetchEventSource } from "@microsoft/fetch-event-source";
import { streamUrl, type DispatchUpdateEvent, type TaskUpdateEvent } from "./api";
import { useAuth } from "./auth";

interface StreamState {
  event: TaskUpdateEvent | null;
  // The latest `dispatch_update` (LOOM-80): a turn's job changed.
  dispatchEvent: DispatchUpdateEvent | null;
  connected: boolean;
}

// Wraps GET /conversations/{id}/stream (SSE). Uses fetchEventSource, not
// native EventSource — the endpoint is Bearer-token auth-gated like every
// other route, and EventSource can't send a custom Authorization header.
// See docs/design/web-client-design.md "Real-time updates" for why.
export function useConversationStream(conversationId: string | null): StreamState {
  const { token, handleUnauthorized } = useAuth();
  const [event, setEvent] = useState<TaskUpdateEvent | null>(null);
  const [dispatchEvent, setDispatchEvent] = useState<DispatchUpdateEvent | null>(null);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    if (!conversationId || !token) return;

    const controller = new AbortController();

    void fetchEventSource(streamUrl(conversationId), {
      headers: { Authorization: `Bearer ${token}` },
      signal: controller.signal,
      openWhenHidden: true,
      async onopen(res) {
        if (res.status === 401) {
          handleUnauthorized();
          controller.abort();
          return;
        }
        setConnected(true);
      },
      onmessage(msg) {
        if (!msg.data) return;
        if (msg.event === "task_update") setEvent(JSON.parse(msg.data) as TaskUpdateEvent);
        else if (msg.event === "dispatch_update") setDispatchEvent(JSON.parse(msg.data) as DispatchUpdateEvent);
      },
      onclose() {
        setConnected(false);
      },
      onerror(err) {
        setConnected(false);
        // Returning (rather than throwing) tells fetchEventSource to keep
        // retrying with its own backoff instead of giving up permanently.
        if (controller.signal.aborted) throw err;
      },
    });

    return () => controller.abort();
  }, [conversationId, token, handleUnauthorized]);

  return { event, dispatchEvent, connected };
}
