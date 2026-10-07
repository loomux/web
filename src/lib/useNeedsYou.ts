import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { useQueries, useQuery } from "@tanstack/react-query";
import { deriveDecisions, detailCandidates, groupDecisions, type NeedsYou } from "./needsYou";
import { snooze, snoozedUntil, snoozeVersion, subscribeSnoozes, unsnooze } from "./snooze";
import { useApiClient } from "./useApiClient";

// Lists refresh every 15 s while the tab is visible (React Query pauses
// intervals in a hidden tab); the conversation screen stays on its stream.
export const LIST_REFRESH_MS = 15_000;

// The clock offers expire against: ticks every 15 s, so an offer stops
// counting soon after its expires_at even if nothing refetches.
function useNow(stepMs = 15_000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), stepMs);
    return () => clearInterval(id);
  }, [stepMs]);
  return now;
}

export interface UseNeedsYou extends NeedsYou {
  isLoading: boolean;
  error: unknown;
  snooze: (key: string, until: Date) => void;
  unsnooze: (key: string) => void;
}

export function useNeedsYou(): UseNeedsYou {
  const apiClient = useApiClient();
  const now = useNow();
  const snoozes = useSyncExternalStore(subscribeSnoozes, snoozeVersion);

  const list = useQuery({
    queryKey: ["conversations"],
    queryFn: apiClient.listConversations,
    refetchInterval: LIST_REFRESH_MS,
  });
  const summaries = useMemo(() => list.data?.conversations ?? [], [list.data]);
  const candidates = useMemo(() => detailCandidates(summaries, now), [summaries, now]);

  // Same key and fetch as the conversation screen, so they share a cache.
  const details = useQueries({
    queries: candidates.map((c) => ({
      queryKey: ["conversation", c.conversation_id],
      queryFn: () => apiClient.getConversation(c.conversation_id),
      retry: false,
      staleTime: 10_000,
      refetchInterval: LIST_REFRESH_MS,
    })),
  });

  const detailById = new Map(details.map((d, i) => [candidates[i].conversation_id, d.data] as const));
  const detailKey = details.map((d) => d.dataUpdatedAt).join(",");

  const grouped = useMemo(() => {
    const all = summaries.flatMap((s) => deriveDecisions(s, detailById.get(s.conversation_id), now));
    return groupDecisions(all, (key) => snoozedUntil(key, now) !== null, now);
    // detailById is rebuilt every render; detailKey says when it changed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [summaries, detailKey, now, snoozes]);

  return {
    ...grouped,
    isLoading: list.isLoading,
    error: list.error,
    snooze: (key, until) => snooze(key, until, Date.now()),
    unsnooze,
  };
}
