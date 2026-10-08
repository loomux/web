import type { ConversationSummary } from "./api";

export type FilterKey = "all" | "needs-you" | "running" | "done";

// Attention-first ordering for the conversations list.
// Highest urgency: statuses that require human intervention.
// Within a group, most recently updated first; conversation_id is a stable tie-breaker.
const STATUS_RANK: Record<string, number> = {
  "needs_attention": 0,
  "awaiting_input": 0,
  "human_takeover": 0,
  running: 1,
  completed: 2,
  failed: 2,
};

export function statusRank(status: string): number {
  return STATUS_RANK[status] ?? 2;
}

export function compareConversationSummaries(
  a: Pick<ConversationSummary, "status" | "updated_at" | "conversation_id">,
  b: Pick<ConversationSummary, "status" | "updated_at" | "conversation_id">,
): number {
  const rankDiff = statusRank(a.status) - statusRank(b.status);
  if (rankDiff !== 0) return rankDiff;

  const dateDiff = Date.parse(b.updated_at) - Date.parse(a.updated_at);
  if (!Number.isNaN(dateDiff) && dateDiff !== 0) return dateDiff;

  return a.conversation_id.localeCompare(b.conversation_id);
}

export function matchesStatusFilter(status: string, filter: FilterKey): boolean {
  switch (filter) {
    case "all":
      return true;
    case "needs-you":
      return status === "needs_attention" || status === "awaiting_input" || status === "human_takeover";
    case "running":
      return status === "running";
    case "done":
      return status === "completed" || status === "failed";
  }
}
