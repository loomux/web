import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
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
  // Details aren't polled: the list is, and a conversation whose list entry
  // moved on (updated_at later than its detail) is refetched below. Offer
  // expiry needs no fetch; it's checked against the clock.
  const queryClient = useQueryClient();
  const details = useQueries({
    queries: candidates.map((c) => ({
      queryKey: ["conversation", c.conversation_id],
      queryFn: () => apiClient.getConversation(c.conversation_id),
      retry: false,
      staleTime: Infinity,
    })),
  });

  // The list entry's updated_at each detail was last fetched for. Compared
  // with the server's own timestamps only, so clock skew can't cause a loop.
  const fetchedFor = useRef(new Map<string, string>());
  const changed = candidates
    .filter((c) => {
      const seen = fetchedFor.current.get(c.conversation_id);
      return seen !== undefined && seen !== c.updated_at;
    })
    .map((c) => `${c.conversation_id}@${c.updated_at}`)
    .join(",");
  useEffect(() => {
    for (const c of candidates) {
      if (!fetchedFor.current.has(c.conversation_id)) fetchedFor.current.set(c.conversation_id, c.updated_at);
    }
    for (const entry of changed ? changed.split(",") : []) {
      const [id, updatedAt] = entry.split("@");
      fetchedFor.current.set(id, updatedAt);
      void queryClient.invalidateQueries({ queryKey: ["conversation", id], exact: true });
    }
  }, [candidates, changed, queryClient]);

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
