import { useState, type FormEvent } from "react";
import { useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useApiClient } from "../lib/useApiClient";
import { useConversationStream } from "../lib/useConversationStream";
import { AttachInfo } from "../components/AttachInfo";

interface DisplayMessage {
  role: "user" | "assistant";
  text: string;
  key: string;
}

// Statuses where a human plausibly wants to intervene — see
// docs/design/web-client-design.md "Attach-info surfacing".
const ATTACH_RELEVANT_STATUSES = new Set([
  "running",
  "awaiting-input",
  "human-takeover",
]);

export function ConversationDetailPage() {
  const { id } = useParams<{ id: string }>();
  const conversationId = id ?? null;
  const apiClient = useApiClient();

  // Task history plus the persisted per-turn transcript (LOOM-31) — a
  // fresh conversation 404s here until its first dispatch, which is
  // expected, not an error to surface.
  const { data: history, refetch: refetchHistory } = useQuery({
    queryKey: ["conversation", conversationId],
    queryFn: () => apiClient.getConversation(conversationId!),
    enabled: !!conversationId,
    retry: false,
  });

  const { event: liveTask, connected } = useConversationStream(conversationId);

  // Optimistic entries for the turn currently in flight. Cleared once the
  // post-dispatch refetch lands, at which point history.messages is the
  // sole source of truth again — avoids ever showing both an optimistic
  // and a persisted copy of the same message at once.
  const [pendingUser, setPendingUser] = useState<string | null>(null);
  const [pendingReply, setPendingReply] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!conversationId || draft.trim() === "" || sending) return;
    const text = draft;
    setDraft("");
    setError(null);
    setPendingUser(text);
    setPendingReply(null);
    setSending(true);
    try {
      const { reply } = await apiClient.dispatch(conversationId, text);
      setPendingReply(reply);
      await refetchHistory();
      setPendingUser(null);
      setPendingReply(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Dispatch failed");
    } finally {
      setSending(false);
    }
  }

  const messages: DisplayMessage[] = [
    ...(history?.messages ?? []).map((m) => ({ role: m.role, text: m.content, key: m.id })),
    ...(pendingUser !== null ? [{ role: "user" as const, text: pendingUser, key: "pending-user" }] : []),
    ...(pendingReply !== null ? [{ role: "assistant" as const, text: pendingReply, key: "pending-reply" }] : []),
  ];

  const latestTask = history?.tasks[history.tasks.length - 1];

  return (
    <div className="flex flex-col h-[calc(100svh-3rem)]">
      <div className="border-b border-neutral-200 px-4 py-2 dark:border-neutral-800">
        <p className="text-sm text-neutral-500">
          Conversation {conversationId}
          {liveTask && (
            <span className="ml-2">
              · status: <span className="font-medium">{liveTask.status}</span>
              {connected && <span className="ml-1 text-green-600">●</span>}
            </span>
          )}
        </p>
        {latestTask && ATTACH_RELEVANT_STATUSES.has(latestTask.status) && (
          <div className="mt-1">
            <AttachInfo taskId={latestTask.id} />
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {messages.length === 0 && (
          <p className="text-neutral-500 text-sm">No messages yet — send one to get started.</p>
        )}
        {messages.map((m) => (
          <div
            key={m.key}
            className={
              m.role === "user"
                ? "ml-auto max-w-[75%] rounded-lg bg-neutral-900 px-3 py-2 text-white dark:bg-neutral-100 dark:text-neutral-900"
                : "mr-auto max-w-[75%] rounded-lg bg-neutral-100 px-3 py-2 dark:bg-neutral-800"
            }
          >
            {m.text}
          </div>
        ))}
      </div>

      {error && <p className="px-4 text-sm text-red-600">{error}</p>}

      <form
        onSubmit={handleSubmit}
        className="border-t border-neutral-200 p-3 flex gap-2 dark:border-neutral-800"
      >
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Message the agent fleet…"
          disabled={sending}
          className="flex-1 rounded border border-neutral-300 px-3 py-2 disabled:opacity-50 dark:border-neutral-700 dark:bg-neutral-900"
        />
        <button
          type="submit"
          disabled={sending || draft.trim() === ""}
          className="rounded bg-neutral-900 px-4 py-2 text-white disabled:opacity-50 dark:bg-neutral-100 dark:text-neutral-900"
        >
          {sending ? "Sending…" : "Send"}
        </button>
      </form>
    </div>
  );
}
