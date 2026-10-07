import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { newId } from "../lib/id";
import { useApiClient } from "../lib/useApiClient";
import { useConversationStream } from "../lib/useConversationStream";
import { formatRelativeTime } from "../lib/time";
import { AttachInfo } from "../components/AttachInfo";
import { MessageContent } from "../components/MessageContent";
import { AttentionCard } from "../components/AttentionCard";
import { DispatchErrorCard, DispatchProgressCard } from "../components/DispatchCards";
import { ApiError, type Confirmation, type Dispatch } from "../lib/api";
import { ConfirmationCard } from "../components/ConfirmationCard";
import { isTerminalDispatch, turnStage } from "../lib/dispatchTurn";

interface DisplayMessage {
  role: "user" | "assistant";
  text: string;
  key: string;
  createdAt?: string;
  // The turn this user message started, when it failed (LOOM-81).
  failed?: Dispatch;
  // The offer this reply made, awaiting or given an answer (LOOM-123).
  confirmation?: Confirmation;
}

// Statuses where a human plausibly wants to intervene — see
// docs/design/web-client-design.md "Attach-info surfacing".
const ATTACH_RELEVANT_STATUSES = new Set(["running", "needs_attention", "awaiting_input", "human_takeover"]);

// useWorkspaceNameById maps workspace ids to names. A workspace this
// conversation just provisioned isn't in a list fetched before it existed,
// so an id it doesn't know makes it fetch the list again, once per id,
// instead of showing the id where the name belongs.
function useWorkspaceNameById(referenced: (string | undefined)[]) {
  const apiClient = useApiClient();
  const { data, refetch, isFetching } = useQuery({
    queryKey: ["workspaces"],
    queryFn: apiClient.listWorkspaces,
  });
  const map = useMemo(() => {
    const m = new Map<string, string>();
    data?.workspaces.forEach((ws) => m.set(ws.id, ws.name));
    return m;
  }, [data]);
  const tried = useRef(new Set<string>());
  const referencedKey = referenced.filter(Boolean).join(",");
  const loaded = !!data;
  useEffect(() => {
    if (!loaded || isFetching) return;
    const missing = referencedKey.split(",").filter((id) => id && !map.has(id) && !tried.current.has(id));
    if (missing.length === 0) return;
    missing.forEach((id) => tried.current.add(id));
    void refetch();
  }, [referencedKey, map, loaded, isFetching, refetch]);
  return map;
}

export function ConversationDetailPage() {
  const { id } = useParams<{ id: string }>();
  const conversationId = id ?? null;
  const apiClient = useApiClient();

  // Task history plus the persisted per-turn transcript (LOOM-31) — a
  // fresh conversation 404s here until its first dispatch, which is
  // expected, not an error to surface.
  const { event: liveTask, dispatchEvent, messageEvent, connected } = useConversationStream(conversationId);

  // The dispatch this page started (or was pointed at by a 409) and is
  // following, until it ends (LOOM-81).
  const [followed, setFollowed] = useState<Dispatch | null>(null);

  const { data: history, refetch: refetchHistory } = useQuery({
    queryKey: ["conversation", conversationId],
    queryFn: () => apiClient.getConversation(conversationId!),
    enabled: !!conversationId,
    retry: false,
    // The stream says when a turn moves on; without it, look every few
    // seconds while one is in flight.
    refetchInterval: (query) => {
      const inFlight = query.state.data?.dispatches?.some((d) => !isTerminalDispatch(d.status));
      return (inFlight || followed) && !connected ? 3000 : false;
    },
  });

  const workspaceNameById = useWorkspaceNameById([
    ...(history?.tasks ?? []).map((t) => t.workspace_id),
    liveTask?.workspace_id,
  ]);

  // The turn in flight: the one followed, else any the server says is
  // running (a reload mid-turn), with the stream's latest word on it.
  let active: Dispatch | null =
    (followed && history?.dispatches?.find((d) => d.dispatch_id === followed.dispatch_id)) ||
    followed ||
    history?.dispatches?.findLast((d) => !isTerminalDispatch(d.status)) ||
    null;
  // A job only moves forward, so an end already in the history beats the
  // stream's word: a restart closes the stream on a stale "running" and
  // marks the job interrupted where only a fetch sees it.
  if (active && dispatchEvent?.dispatch_id === active.dispatch_id && !isTerminalDispatch(active.status)) {
    active = { ...active, ...dispatchEvent };
  }
  const inFlight = active !== null && !isTerminalDispatch(active.status);
  const activeId = active?.dispatch_id;
  const activeStatus = active?.status;

  // When the followed turn ends, the transcript has its answer (or its
  // failure): fetch it, then stop following.
  useEffect(() => {
    if (!activeId || !activeStatus || !isTerminalDispatch(activeStatus)) return;
    let cancelled = false;
    void refetchHistory().then(() => {
      if (!cancelled) setFollowed((f) => (f?.dispatch_id === activeId ? null : f));
    });
    return () => {
      cancelled = true;
    };
  }, [activeId, activeStatus, refetchHistory]);

  // What the stream said while it was down (a restart, a lost network) is
  // gone: once it's back, read the conversation again.
  useEffect(() => {
    if (connected) void refetchHistory();
  }, [connected, refetchHistory]);

  // A task moving on (launched, waiting for you, done) changes the stage.
  const liveTaskKey = liveTask ? `${liveTask.task_id}:${liveTask.status}:${liveTask.updated_at}` : "";
  useEffect(() => {
    if (liveTaskKey && inFlight) void refetchHistory();
  }, [liveTaskKey, inFlight, refetchHistory]);

  // A message the server logged on its own — an agent reporting after a
  // turn it ended early (LOOM-121) — shows up without a send.
  const messageEventId = messageEvent?.message_id;
  useEffect(() => {
    if (messageEventId) void refetchHistory();
  }, [messageEventId, refetchHistory]);

  // The optimistic copy of a message until the server has it: it's stored
  // when the dispatch is accepted, so the refetch after that replaces it.
  const [pendingUser, setPendingUser] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const busy = sending || inFlight;

  // The composer has focus whenever it can take input: on opening a
  // conversation, and again once a send finishes (sending disables it,
  // which drops focus). A message typed straight after opening one then
  // goes where it's meant to.
  const composerRef = useRef<HTMLTextAreaElement>(null);
  // The end of the conversation, kept in view as messages arrive.
  const endRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!busy) composerRef.current?.focus();
  }, [busy, conversationId]);

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (draft.trim() === "") return;
    void send(draft, () => setDraft(""));
  }

  // send dispatches text as the conversation's next message — typed in
  // the composer, or an answer from the needs_attention card.
  // It returns once the server has accepted the turn; the stream carries
  // the rest. A Retry is a send of the same text.
  async function send(text: string, onAccepted?: () => void, confirmationId?: string) {
    if (!conversationId || busy) return;
    onAccepted?.();
    setError(null);
    setPendingUser(text);
    setSending(true);
    try {
      // The conversation's current workspace goes along as workspace_hint
      // (LOOM-87), so a follow-up lands back in it: its latest agent task's.
      // A command task runs in the target's shell workspace, which the router
      // is never offered, so it says nothing about where the work is.
      const workspaceHint = history?.tasks.findLast((t) => t.kind === "agent")?.workspace_id;
      const accepted = await apiClient.dispatch(
        conversationId,
        text,
        workspaceHint,
        newId(),
        confirmationId,
      );
      if (accepted.dispatch_id) setFollowed(accepted);
      await refetchHistory();
      setPendingUser(null);
    } catch (err) {
      if (err instanceof ApiError && err.status === 409 && err.dispatchId) {
        // A turn is already running here (another tab, or a reload):
        // follow that one; this message wasn't sent.
        setFollowed({
          dispatch_id: err.dispatchId,
          conversation_id: conversationId,
          status: "running",
          created_at: new Date().toISOString(),
        });
        setPendingUser(null);
        setDraft((d) => d || text);
        setError(
          "A turn is still running in this conversation. Your message wasn't sent; send it once that one finishes.",
        );
        void refetchHistory();
      } else if (err instanceof ApiError && err.status === 503) {
        setError("Loomux is restarting. Your message wasn't sent; try again in a moment.");
      } else {
        setError(err instanceof Error ? err.message : "Dispatch failed");
      }
    } finally {
      setSending(false);
    }
  }

  // Cancel the turn in flight (LOOM-99). The stream then reports it
  // failed with class "cancelled"; until then the button stays disabled.
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  async function cancelActive() {
    if (!activeId) return;
    setCancellingId(activeId);
    setError(null);
    try {
      await apiClient.cancelDispatch(activeId);
    } catch (err) {
      setCancellingId(null);
      if (err instanceof ApiError && err.status === 409) {
        setError("That turn had already finished, so there was nothing to cancel.");
        void refetchHistory();
      } else {
        setError(err instanceof Error ? `Couldn't cancel: ${err.message}` : "Couldn't cancel the turn");
      }
    }
  }

  const failedById = new Map(
    (history?.dispatches ?? [])
      .filter((d) => d.status === "failed" || d.status === "interrupted")
      .map((d) => [d.dispatch_id, d]),
  );
  const confirmationByDispatch = new Map(
    (history?.confirmations ?? []).filter((c) => c.dispatch_id).map((c) => [c.dispatch_id, c]),
  );
  const messages: DisplayMessage[] = [
    ...(history?.messages ?? []).map((m) => ({
      role: m.role,
      text: m.content,
      key: m.id,
      createdAt: m.created_at,
      failed: m.role === "user" && m.dispatch_id ? failedById.get(m.dispatch_id) : undefined,
      confirmation:
        m.role === "assistant" && m.dispatch_id ? confirmationByDispatch.get(m.dispatch_id) : undefined,
    })),
    ...(pendingUser !== null ? [{ role: "user" as const, text: pendingUser, key: "pending-user" }] : []),
  ];

  // A new message, the progress card or an answer card: bring the end of
  // the conversation into view (LOOM-130).
  const lastKey = messages[messages.length - 1]?.key;
  useEffect(() => {
    endRef.current?.scrollIntoView?.({ block: "end" });
  }, [lastKey, messages.length, inFlight]);

  const latestTask = history?.tasks[history.tasks.length - 1];
  // A needs_attention task's prompt (LOOM-97) — shown until it's answered,
  // and not while that answer is on its way.
  const attentionTask = history?.tasks.findLast((t) => t.status === "needs_attention" && t.attention);
  const latestWorkspaceName = latestTask
    ? (workspaceNameById.get(latestTask.workspace_id) ?? latestTask.workspace_id)
    : null;

  return (
    <div className="flex flex-col h-[calc(100svh-var(--shell-bottom,0px))]">
      <div className="border-b border-neutral-200 px-4 py-2 dark:border-neutral-800">
        <p className="text-sm text-neutral-500">
          Conversation {conversationId}
          {latestWorkspaceName && (
            <span className="ml-2">
              · workspace: <span className="font-medium">{latestWorkspaceName}</span>
            </span>
          )}
          {liveTask && (
            <span className="ml-2">
              · status: <span className="font-medium">{liveTask.status}</span>
              {connected && <span className="ml-1 text-green-600">●</span>}
            </span>
          )}
        </p>
        {/* While a turn is in flight its progress card carries the attach command. */}
        {!inFlight && latestTask && ATTACH_RELEVANT_STATUSES.has(latestTask.status) && (
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
          <div key={m.key} className="space-y-3">
            <div
              className={
                m.role === "user"
                  ? "ml-auto max-w-[75%] rounded-lg bg-neutral-900 px-3 py-2 text-white dark:bg-neutral-100 dark:text-neutral-900"
                  : "mr-auto max-w-[75%] rounded-lg bg-neutral-100 px-3 py-2 dark:bg-neutral-800"
              }
            >
              <MessageContent role={m.role} text={m.text} />
              {m.createdAt && (
                <time
                  dateTime={new Date(m.createdAt).toISOString()}
                  title={new Date(m.createdAt).toLocaleString()}
                  className={`block mt-1 text-xs text-neutral-400 dark:text-neutral-500 ${
                    m.role === "user" ? "text-right" : "text-left"
                  }`}
                >
                  {formatRelativeTime(m.createdAt)}
                </time>
              )}
            </div>
            {m.confirmation && (
              <ConfirmationCard
                confirmation={m.confirmation}
                disabled={busy}
                onAnswer={(answer) => void send(answer, undefined, m.confirmation?.id)}
              />
            )}
            {m.failed && (
              <DispatchErrorCard
                errorClass={m.failed.error_class}
                error={m.failed.error}
                retryDisabled={busy}
                onRetry={() => void send(m.text, undefined, m.failed?.confirmation_id)}
              />
            )}
          </div>
        ))}
        {inFlight && active && (
          <DispatchProgressCard
            stage={turnStage(active, history?.tasks ?? [], workspaceNameById)}
            startedAt={active.created_at}
            onCancel={() => void cancelActive()}
            cancelling={cancellingId === active.dispatch_id}
          />
        )}
        <div ref={endRef} />
      </div>

      {error && <p className="px-4 text-sm text-red-600">{error}</p>}

      {attentionTask?.attention && pendingUser === null && (
        <AttentionCard
          attention={attentionTask.attention}
          agent={attentionTask.agent_type || "The agent"}
          disabled={sending}
          onAnswer={(answer) => void send(answer)}
        />
      )}

      <form onSubmit={handleSubmit} className="border-t border-neutral-200 p-3 flex gap-2 dark:border-neutral-800">
        <textarea
          ref={composerRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              e.currentTarget.form?.requestSubmit();
            }
          }}
          placeholder="Message the agent fleet…"
          disabled={busy}
          rows={1}
          className="flex-1 resize-none rounded border border-neutral-300 px-3 py-2 disabled:opacity-50 dark:border-neutral-700 dark:bg-neutral-900"
        />
        <button
          type="submit"
          disabled={busy || draft.trim() === ""}
          className="rounded bg-neutral-900 px-4 py-2 text-white disabled:opacity-50 dark:bg-neutral-100 dark:text-neutral-900"
        >
          {sending ? "Sending…" : inFlight ? "Working…" : "Send"}
        </button>
      </form>
    </div>
  );
}
