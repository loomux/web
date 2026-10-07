import { useQuery } from "@tanstack/react-query";
import { matchesStatusFilter } from "./conversations";
import { useApiClient } from "./useApiClient";

// How many conversations need the user, for the count in the shell. Shares
// the ["conversations"] query with the screens that list them, and
// refreshes every 30 s while the tab is visible so the badge doesn't wait
// for a screen change. (PR 2 replaces this with the needs-you model, which
// also counts pending offers and failed turns.)
export function useNeedsYouCount(): number {
  const apiClient = useApiClient();
  const { data } = useQuery({
    queryKey: ["conversations"],
    queryFn: apiClient.listConversations,
    refetchInterval: 30_000,
  });
  return (data?.conversations ?? []).filter((c) => matchesStatusFilter(c.status, "needs-you")).length;
}
