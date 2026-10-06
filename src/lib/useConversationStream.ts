import { useEffect, useState } from "react";
import { openConversationStream, type DispatchUpdateEvent, type MessageAddedEvent, type TaskUpdateEvent } from "./api";
import { useAuth } from "./authContext";

interface StreamState {
  event: TaskUpdateEvent | null;
  // The latest `dispatch_update` (LOOM-80): a turn's job changed.
  dispatchEvent: DispatchUpdateEvent | null;
  // The latest `message_added` (LOOM-121): the transcript has a new message.
  messageEvent: MessageAddedEvent | null;
  connected: boolean;
}

// Follows GET /conversations/{id}/stream (SSE) through the API client's
// openConversationStream, keeping the latest event of each kind.
export function useConversationStream(conversationId: string | null): StreamState {
  const { token, handleUnauthorized } = useAuth();
  const [event, setEvent] = useState<TaskUpdateEvent | null>(null);
  const [dispatchEvent, setDispatchEvent] = useState<DispatchUpdateEvent | null>(null);
  const [messageEvent, setMessageEvent] = useState<MessageAddedEvent | null>(null);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    if (!conversationId || !token) return;
    return openConversationStream(token, conversationId, {
      onEvent: (e) => {
        if (e.type === "task_update") setEvent(e.data);
        else if (e.type === "dispatch_update") setDispatchEvent(e.data);
        else setMessageEvent(e.data);
      },
      onConnected: setConnected,
      onUnauthorized: handleUnauthorized,
    });
  }, [conversationId, token, handleUnauthorized]);

  return { event, dispatchEvent, messageEvent, connected };
}
