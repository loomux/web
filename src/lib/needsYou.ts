import type { Confirmation, ConversationMessage, ConversationSummary, ConversationTask, Dispatch } from "./api";
import { isTerminalDispatch } from "./dispatchTurn";

// The needs-you model (principles 1-2, build-plan §6 PR 2): every
// decision waiting on the user, from every conversation, as one list the
// Inbox, the shell's count and the Today weave all read.
//
// A conversation's list status only says "needs attention" for agent
// prompts; offers and failed turns are only visible in its detail. So the
// model reads both: the summary always, the detail when it has been
// fetched (useNeedsYou fetches it for recent conversations).

export type DecisionKind = "offer" | "prompt" | "awaiting" | "takeover" | "failed";

export interface ConversationDetail {
  conversation_id: string;
  tasks: ConversationTask[];
  dispatches?: Dispatch[];
  confirmations?: Confirmation[];
  messages?: ConversationMessage[];
}

export interface Decision {
  // Stable while the same thing is waiting; a new prompt or offer gets a
  // new key, so a snooze never hides something new.
  key: string;
  kind: DecisionKind;
  conversationId: string;
  // When it started waiting.
  since: string;
  workspaceId?: string;
  preview?: string;
  confirmation?: Confirmation;
  task?: ConversationTask;
  dispatch?: Dispatch;
  // Answering sends a chat message; these make it land where the
  // conversation page's own send would: the latest agent task's workspace,
  // and for a failed turn, the text (and offer) it carried.
  workspaceHint?: string;
  retryMessage?: string;
  // What an agent waiting for a reply last said: its question.
  question?: string;
}

// Offers first (they expire), then what agents are stuck on, then failures,
// then sessions the user is already driving.
const KIND_RANK: Record<DecisionKind, number> = { offer: 0, prompt: 1, awaiting: 1, failed: 2, takeover: 3 };

export const OLDER_AFTER_MS = 24 * 60 * 60 * 1000;

const TASK_KIND: Record<string, DecisionKind> = {
  needs_attention: "prompt",
  awaiting_input: "awaiting",
  human_takeover: "takeover",
};

function latest<T>(items: T[] | undefined, at: (t: T) => string): T | undefined {
  let best: T | undefined;
  for (const item of items ?? []) {
    if (!best || Date.parse(at(item)) >= Date.parse(at(best))) best = item;
  }
  return best;
}

export function deriveDecisions(summary: ConversationSummary, detail: ConversationDetail | undefined, now: number): Decision[] {
  const base = {
    conversationId: summary.conversation_id,
    workspaceId: summary.workspace_id || undefined,
    preview: summary.preview,
  };
  const out: Decision[] = [];

  if (!detail) {
    const kind = TASK_KIND[summary.status];
    if (kind) {
      out.push({ ...base, key: `${summary.conversation_id}:${summary.status}@${summary.updated_at}`, kind, since: summary.updated_at });
    }
    return out;
  }

  const workspaceHint = detail.tasks.findLast((t) => t.kind === "agent")?.workspace_id || undefined;
  const withHint = { ...base, workspaceHint };

  // Offers still open. One past expires_at is inert even before the server
  // marks it expired: it can no longer be approved.
  for (const c of detail.confirmations ?? []) {
    if (c.status === "pending" && Date.parse(c.expires_at) > now) {
      out.push({ ...withHint, key: `offer:${c.id}`, kind: "offer", since: c.created_at, confirmation: c });
    }
  }

  const task = latest(detail.tasks, (t) => t.updated_at);
  const taskKind = task && TASK_KIND[task.status];
  if (task && taskKind) {
    out.push({
      ...withHint,
      workspaceId: task.workspace_id || base.workspaceId,
      key: `task:${task.id}:${task.status}@${task.updated_at}`,
      kind: taskKind,
      since: task.updated_at,
      task,
      question:
        taskKind === "awaiting"
          ? detail.messages?.findLast((m) => m.role === "assistant" && m.task_id === task.id)?.content
          : undefined,
    });
  }

  // The latest turn failed and nothing has been sent since. A turn the
  // user cancelled isn't waiting on them.
  const dispatch = latest(detail.dispatches, (d) => d.created_at);
  if (
    dispatch &&
    isTerminalDispatch(dispatch.status) &&
    (dispatch.status === "failed" || dispatch.status === "interrupted") &&
    dispatch.error_class !== "cancelled"
  ) {
    out.push({
      ...withHint,
      retryMessage: detail.messages?.find((m) => m.role === "user" && m.dispatch_id === dispatch.dispatch_id)?.content,
      key: `failed:${dispatch.dispatch_id}`,
      kind: "failed",
      since: dispatch.finished_at ?? dispatch.created_at,
      dispatch,
    });
  }

  return out;
}

export function compareDecisions(a: Decision, b: Decision): number {
  const rank = KIND_RANK[a.kind] - KIND_RANK[b.kind];
  if (rank !== 0) return rank;
  if (a.kind === "offer" && b.kind === "offer") {
    return Date.parse(a.confirmation!.expires_at) - Date.parse(b.confirmation!.expires_at);
  }
  return Date.parse(b.since) - Date.parse(a.since) || a.key.localeCompare(b.key);
}

// Waiting more than a day folds into "Older, still waiting". Offers never
// get old: they expire first.
export function isOlder(d: Decision, now: number): boolean {
  return d.kind !== "offer" && now - Date.parse(d.since) > OLDER_AFTER_MS;
}

export interface NeedsYou {
  current: Decision[];
  older: Decision[];
  snoozed: Decision[];
  // What the shell counts: current and older, not snoozed.
  count: number;
}

export function groupDecisions(all: Decision[], isSnoozed: (key: string) => boolean, now: number): NeedsYou {
  const sorted = [...all].sort(compareDecisions);
  const current: Decision[] = [];
  const older: Decision[] = [];
  const snoozed: Decision[] = [];
  for (const d of sorted) {
    if (isSnoozed(d.key)) snoozed.push(d);
    else if (isOlder(d, now)) older.push(d);
    else current.push(d);
  }
  return { current, older, snoozed, count: current.length + older.length };
}

// Which conversations' details are worth fetching: any whose status needs
// the user, and any touched in the last day (where offers and failures
// can hide). Newest first, at most `limit`.
export function detailCandidates(summaries: ConversationSummary[], now: number, limit = 30): ConversationSummary[] {
  return summaries
    .filter((s) => TASK_KIND[s.status] !== undefined || now - Date.parse(s.updated_at) < OLDER_AFTER_MS)
    .sort((a, b) => Date.parse(b.updated_at) - Date.parse(a.updated_at))
    .slice(0, limit);
}
