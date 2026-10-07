import type { ConversationSummary } from "./api";

export type FilterKey = "all" | "needs-you" | "running" | "done";

export const FILTER_OPTIONS: { key: FilterKey; label: string }[] = [
  { key: "all", label: "All" },
  { key: "needs-you", label: "Needs you" },
  { key: "running", label: "Running" },
  { key: "done", label: "Done" },
];

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

export function statusBadgeClasses(status: string): string {
  switch (status) {
    case "needs_attention":
      return "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200";
    case "awaiting_input":
      return "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-200";
    case "human_takeover":
      return "bg-orange-100 text-orange-700 dark:bg-orange-900 dark:text-orange-200";
    case "running":
      return "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-200";
    case "completed":
      return "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-200";
    case "failed":
      return "bg-neutral-200 text-neutral-700 dark:bg-neutral-700 dark:text-neutral-200";
    default:
      return "bg-neutral-100 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300";
  }
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

export function formatStatusLabel(status: string): string {
  return status.replace(/[-_]/g, " ");
}
