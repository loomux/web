import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ApiError, type Confirmation, type Dispatch } from "../lib/api";
import { isTerminalDispatch, turnStage } from "../lib/dispatchTurn";
import { newId } from "../lib/id";
import { useApiClient } from "../lib/useApiClient";
import { useConversationStream } from "../lib/useConversationStream";

// Everything the conversation screen knows and does, apart from how it
// looks: the history, the live stream, the turn in flight and the send,
// retry and cancel rules (LOOM-80/81/99/121/123). Moved here unchanged
// from the old ConversationDetailPage so the redesign could replace the
// screen without touching the behaviour its tests pin down.

export interface DisplayMessage {
  role: "user" | "assistant";
  text: string;
  key: string;
  createdAt?: string;
  // The turn this user message started, when it failed (LOOM-81).
  failed?: Dispatch;
  // The offer this reply made, awaiting or given an answer (LOOM-123).
  confirmation?: Confirmation;
  // The turn (dispatch) this message belongs to.
  dispatchId?: string;
}

// useWorkspaceNameById maps workspace ids to names. A workspace this
// conversation just provisioned isn't in a list fetched before it existed,
// so an id it doesn't know makes it fetch the list again, once per id,
// instead of showing the id where the name belongs.
export function useWorkspaceNameById(referenced: (string | undefined)[]) {
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

export function useConversation(conversationId: string | null) {
  const apiClient = useApiClient();

  // Task history plus the persisted per-turn transcript (LOOM-31) — a
  // fresh conversation 404s here until its first dispatch, which is
  // expected, not an error to surface.
  const { event: liveTask, dispatchEvent, messageEvent, connected } = useConversationStream(conversationId);

  // The dispatch this page started (or was pointed at by a 409) and is
  // following, until it ends (LOOM-81).
  const [followed, setFollowed] = useState<Dispatch | null>(null);

  const {
    data: history,
    refetch: refetchHistory,
    status: historyStatus,
    error: historyError,
  } = useQuery({
    queryKey: ["conversation", conversationId],
    queryFn: () => apiClient.getConversation(conversationId!),
    enabled: !!conversationId,
    retry: false,
    // The stream says when a turn moves on; without it, look every few
    // seconds while one is in flight. With it, still look every 5 s as a
    // safety net: a stream that connects just before a quick turn ends can
    // record that end on its first poll without sending it (server
    // api/dispatch.go sendDispatchUpdates), and the turn would look
    // stuck forever.
    refetchInterval: (query) => {
      const inFlight = query.state.data?.dispatches?.some((d) => !isTerminalDispatch(d.status));
      if (!inFlight && !followed) return false;
      return connected ? 5000 : 3000;
    },
  });

  // A new conversation has no history yet: its 404 is expected.
  const notFound = historyError instanceof ApiError && historyError.status === 404;

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
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const busy = sending || inFlight;
  // The last message whose POST failed without an answer that it wasn't
  // taken (a 5xx, a dropped connection), with its idempotency key: it
  // may have reached the server, so sending the same message again
  // reuses the key and can't start a second turn.
  const unsent = useRef<{ text: string; confirmationId?: string; key: string } | null>(null);

  // send dispatches text as the conversation's next message — typed in
  // the composer, or an answer from the needs_attention card.
  // It returns once the server has accepted the turn; the stream carries
  // the rest. A Retry is a send of the same text.
  async function send(
    text: string,
    { onAccepted, onRejected, confirmationId }: { onAccepted?: () => void; onRejected?: (text: string) => void; confirmationId?: string } = {},
  ) {
    if (!conversationId || busy) return;
    onAccepted?.();
    setError(null);
    setPendingUser(text);
    setSending(true);
    const u = unsent.current;
    const key = u && u.text === text && u.confirmationId === confirmationId ? u.key : newId();
    unsent.current = null;
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
        key,
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
        onRejected?.(text);
        setError(
          "A turn is still running in this conversation. Your message wasn't sent; send it once that one finishes.",
        );
        void refetchHistory();
      } else {
        // Not sent, as far as we know: take the optimistic copy back out
        // and give the text back to send again.
        if (!(err instanceof ApiError && err.code === "idempotency_conflict")) {
          unsent.current = { text, confirmationId, key };
        }
        setPendingUser(null);
        onRejected?.(text);
        if (err instanceof ApiError && err.status === 503) {
          setError("Loomux is restarting. Your message wasn't sent; try again in a moment.");
        } else {
          setError(`Your message wasn't sent: ${err instanceof Error ? err.message : "dispatch failed"}. Try again.`);
        }
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
      dispatchId: m.dispatch_id,
      failed: m.role === "user" && m.dispatch_id ? failedById.get(m.dispatch_id) : undefined,
      confirmation:
        m.role === "assistant" && m.dispatch_id ? confirmationByDispatch.get(m.dispatch_id) : undefined,
    })),
    ...(pendingUser !== null ? [{ role: "user" as const, text: pendingUser, key: "pending-user" }] : []),
  ];

  const latestTask = history?.tasks[history.tasks.length - 1];
  // A needs_attention task's prompt (LOOM-97) — shown until it's answered,
  // and not while that answer is on its way.
  const attentionTask = history?.tasks.findLast((t) => t.status === "needs_attention" && t.attention);
  const latestWorkspaceName = latestTask
    ? (workspaceNameById.get(latestTask.workspace_id) ?? latestTask.workspace_id)
    : null;


  const stage = inFlight && active ? turnStage(active, history?.tasks ?? [], workspaceNameById) : null;

  return {
    history,
    historyStatus,
    historyError,
    notFound,
    refetchHistory,
    liveTask,
    connected,
    active,
    inFlight,
    stage,
    sending,
    busy,
    error,
    setError,
    pendingUser,
    send,
    cancelActive,
    cancelling: !!active && cancellingId === active.dispatch_id,
    messages,
    workspaceNameById,
    latestTask,
    attentionTask,
    latestWorkspaceName,
  };
}
