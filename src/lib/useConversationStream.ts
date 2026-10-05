import { useEffect, useState } from "react";
import { fetchEventSource } from "@microsoft/fetch-event-source";
import { streamUrl, type DispatchUpdateEvent, type MessageAddedEvent, type TaskUpdateEvent } from "./api";
import { useAuth } from "./auth";

interface StreamState {
  event: TaskUpdateEvent | null;
  // The latest `dispatch_update` (LOOM-80): a turn's job changed.
  dispatchEvent: DispatchUpdateEvent | null;
  // The latest `message_added` (LOOM-121): the transcript has a new message.
  messageEvent: MessageAddedEvent | null;
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
  const [messageEvent, setMessageEvent] = useState<MessageAddedEvent | null>(null);
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
        // While Loomux restarts, the proxy in front of it answers with an
        // error page: a failed connection, retried via onerror.
        if (!res.ok) throw new Error(`stream: HTTP ${res.status}`);
        setConnected(true);
      },
      onmessage(msg) {
        if (!msg.data) return;
        if (msg.event === "task_update") setEvent(JSON.parse(msg.data) as TaskUpdateEvent);
        else if (msg.event === "dispatch_update") setDispatchEvent(JSON.parse(msg.data) as DispatchUpdateEvent);
        else if (msg.event === "message_added") setMessageEvent(JSON.parse(msg.data) as MessageAddedEvent);
      },
      onclose() {
        setConnected(false);
        // The server ending the stream (a restart, say) isn't the end of
        // the conversation: throwing hands it to onerror, which retries.
        throw new Error("stream: closed by server");
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

  return { event, dispatchEvent, messageEvent, connected };
}
