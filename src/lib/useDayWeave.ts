import { useEffect, useMemo, useState } from "react";
import { useQueries, useQuery } from "@tanstack/react-query";
import { isTerminalDispatch } from "./dispatchTurn";
import { limiter } from "./limit";
import { useApiClient } from "./useApiClient";
import { useNeedsYou } from "./useNeedsYou";
import { buildWeave, dayBounds, type Weave } from "./weave";

const eventsSlot = limiter(6);
const LIMIT = 60;

function useMinuteClock() {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);
  return now;
}

// One day's weave (build-plan §8): the conversations that moved that day,
// each one's audit trail (GET /conversations/{id}/events, at most six at
// a time, refetched only when the conversation moves on), turns running
// now, and, for today, the knots of what waits on you.
export function useDayWeave(date: Date): { weave: Weave | null; now: number; isLoading: boolean; error: unknown } {
  const apiClient = useApiClient();
  const now = useMinuteClock();
  const day = useMemo(() => dayBounds(date), [date]);
  const isToday = now >= day.start && now < day.end;
  const needsYou = useNeedsYou();

  const list = useQuery({ queryKey: ["conversations"], queryFn: apiClient.listConversations });
  const workspaces = useQuery({ queryKey: ["workspaces"], queryFn: apiClient.listWorkspaces });
  const targets = useQuery({ queryKey: ["targets"], queryFn: apiClient.listTargets });

  const summaries = useMemo(() => list.data?.conversations ?? [], [list.data]);
  const inDay = useMemo(
    () =>
      summaries
        .filter((s) => Date.parse(s.updated_at) >= day.start)
        .sort((a, b) => Date.parse(b.updated_at) - Date.parse(a.updated_at))
        .slice(0, LIMIT),
    [summaries, day.start],
  );

  // updated_at in the key: a conversation that moved on is read again; one
  // that didn't is served from the cache.
  const events = useQueries({
    queries: inDay.map((s) => ({
      queryKey: ["events", s.conversation_id, s.updated_at],
      queryFn: () => eventsSlot(() => apiClient.getConversationEvents(s.conversation_id)),
      staleTime: Infinity,
      retry: false,
    })),
  });

  const runningIds = isToday ? inDay.filter((s) => s.status === "running").map((s) => s.conversation_id) : [];
  const runningDetails = useQueries({
    queries: runningIds.map((id) => ({
      queryKey: ["conversation", id],
      queryFn: () => apiClient.getConversation(id),
      staleTime: 10_000,
      retry: false,
    })),
  });

  const eventsKey = events.map((e) => e.dataUpdatedAt).join(",");
  const runningKey = runningDetails.map((d) => d.dataUpdatedAt).join(",");

  const weave = useMemo(() => {
    if (!list.data || !workspaces.data || !targets.data) return null;
    const eventsById = new Map(inDay.map((s, i) => [s.conversation_id, events[i]?.data?.events] as const));
    const running = new Map<string, { since: number; workspaceId?: string }>();
    runningIds.forEach((id, i) => {
      const detail = runningDetails[i]?.data;
      const turn = detail?.dispatches?.findLast((d) => !isTerminalDispatch(d.status));
      if (!turn) return;
      running.set(id, {
        since: Date.parse(turn.started_at ?? turn.created_at),
        workspaceId: detail?.tasks.findLast((t) => t.kind === "agent")?.workspace_id,
      });
    });
    return buildWeave({
      day,
      now,
      summaries: inDay,
      eventsById,
      running,
      decisions: isToday ? [...needsYou.current, ...needsYou.older] : [],
      workspaces: workspaces.data.workspaces ?? [],
      targets: targets.data.targets ?? [],
      limit: LIMIT,
    });
    // events/runningDetails are new arrays each render; their keys say when
    // their data changed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [list.data, workspaces.data, targets.data, inDay, eventsKey, runningKey, day, now, isToday, needsYou.current, needsYou.older]);

  return {
    now,
    weave: weave && { ...weave, omitted: weave.omitted + Math.max(0, summaries.filter((s) => Date.parse(s.updated_at) >= day.start).length - LIMIT) },
    isLoading: list.isLoading || workspaces.isLoading || targets.isLoading,
    error: list.error ?? workspaces.error ?? targets.error,
  };
}
