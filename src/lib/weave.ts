import type { ConversationEvent, ConversationSummary, Target, WorkspaceSummary } from "./api";
import type { Decision } from "./needsYou";

// The Today weave's model (principles.md "Decision", build-plan §8): a day
// of work as lanes (each workspace, grouped under its machine, plus one
// for answers that ran nowhere) crossed by threads (conversations), with
// a stitch for each step of each turn and a knot for each thing waiting
// on the user. Pure, so the desktop weave, the phone timeline and the
// Inbox's day strip all draw the same day.

export type StitchKind =
  | "routed" // the router decided where a turn goes
  | "provision" // a workspace was set up
  | "agent" // an agent's turn (a span)
  | "command" // a command ran (a span)
  | "offer" // the router offered something and waited
  | "answered" // an offer was approved or denied
  | "relay" // an agent reported late
  | "failed" // the turn failed
  | "working"; // running now (a span to now)

export interface Stitch {
  id: string;
  conversationId: string;
  dispatchId?: string;
  laneId: string;
  kind: StitchKind;
  // Points have start === end.
  start: number;
  end: number;
  label: string;
}

export interface Knot {
  key: string;
  conversationId: string;
  laneId: string;
  since: number;
  label: string;
}

export interface Lane {
  id: string;
  label: string;
  // The machine it belongs to, or "" for answers that ran nowhere.
  machine: string;
}

export interface Thread {
  conversationId: string;
  title: string;
  stitches: Stitch[];
}

export interface Weave {
  start: number;
  end: number;
  lanes: Lane[];
  threads: Thread[];
  knots: Knot[];
  // Conversations left out to keep the day readable.
  omitted: number;
}

export const DIRECT_LANE = "direct";
const HOUR = 3_600_000;

export function dayBounds(date: Date): { start: number; end: number } {
  const start = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  return { start, end: start + 24 * HOUR };
}

function formatDuration(ms: number): string {
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${String(s % 60).padStart(2, "0")}s`;
  return `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, "0")}m`;
}

const FAILURE: Record<string, string> = {
  target_unreachable: "couldn't reach the machine",
  target_unhealthy: "the machine wasn't usable",
  timeout: "took too long",
  agent_exited: "the agent exited",
  agent_rate_limited: "usage limit",
  login_required: "the agent needs signing in",
  interrupted: "interrupted by a restart",
  cancelled: "cancelled",
};

// One event as a stitch. Events are logged when a step ends, with its
// duration, so a span runs from created_at - duration_ms to created_at.
export function stitchFromEvent(conversationId: string, e: ConversationEvent, laneOf: (e: ConversationEvent) => string, names: { workspace: (id?: string) => string | undefined; target: (id?: string) => string | undefined }): Stitch | null {
  const at = Date.parse(e.created_at);
  const base = { id: e.id, conversationId, dispatchId: e.dispatch_id, laneId: laneOf(e), start: at, end: at };
  const workspace = names.workspace(e.workspace_id);
  switch (e.kind) {
    case "decision":
      return { ...base, kind: "routed", label: e.target_id ? `Routed to ${names.target(e.target_id) ?? "a machine"}` : "Answered directly" };
    case "provision":
      return { ...base, kind: "provision", label: `Set up ${workspace ?? "a workspace"}` };
    case "agent_turn":
      return { ...base, kind: "agent", start: at - e.duration_ms, label: `Agent turn, ${formatDuration(e.duration_ms)}` };
    case "command":
      return {
        ...base,
        kind: "command",
        start: at - e.duration_ms,
        // "exit 0" reads as "exit code 0", like the task list: the reply
        // already says "exit 0" in the agent's words.
        label: `Ran ${e.command ?? "a command"}${e.outcome ? ` (${e.outcome.replace(/^exit (\d+)$/, "exit code $1")})` : ""}`,
      };
    case "offer":
      return { ...base, kind: "offer", label: e.command ? `Offered: ${e.command}` : "Offered to do something" };
    case "offer_answered":
      return { ...base, kind: "answered", label: e.outcome === "approved" ? "Offer approved" : e.outcome === "denied" ? "Offer denied" : "Offer answered" };
    case "relay":
      return { ...base, kind: "relay", label: "Late report from the agent" };
    case "outcome":
      if (!e.error_class) return null;
      return { ...base, kind: "failed", label: `Failed: ${FAILURE[e.error_class] ?? e.error_class.replace(/_/g, " ")}` };
    default:
      return null;
  }
}

export interface WeaveInput {
  day: { start: number; end: number };
  now: number;
  summaries: ConversationSummary[];
  eventsById: Map<string, ConversationEvent[] | undefined>;
  // Turns running now: conversation → since when, and where.
  running: Map<string, { since: number; workspaceId?: string }>;
  decisions: Decision[];
  workspaces: WorkspaceSummary[];
  targets: Target[];
  limit?: number;
}

export function buildWeave(input: WeaveInput): Weave {
  const { day, now, workspaces, targets } = input;
  const limit = input.limit ?? 60;
  const wsById = new Map(workspaces.map((w) => [w.id, w] as const));
  const targetById = new Map(targets.map((t) => [t.id, t] as const));
  const names = {
    workspace: (id?: string) => (id ? wsById.get(id)?.name : undefined),
    target: (id?: string) => (id ? targetById.get(id)?.name : undefined),
  };

  const inDay = input.summaries
    .filter((s) => Date.parse(s.updated_at) >= day.start)
    .sort((a, b) => Date.parse(b.updated_at) - Date.parse(a.updated_at));
  const shown = inDay.slice(0, limit);

  const usedLanes = new Set<string>();
  const threads: Thread[] = [];
  const visible = (s: Stitch) => s.end >= day.start && s.start < day.end;

  for (const summary of shown) {
    const id = summary.conversation_id;
    const events = input.eventsById.get(id);
    // Steps that name no workspace sit on the lane the conversation was
    // last in, else the direct-answer lane.
    let lane = DIRECT_LANE;
    const laneOf = (e: ConversationEvent) => {
      if (e.workspace_id && wsById.has(e.workspace_id)) lane = e.workspace_id;
      return lane;
    };
    let stitches: Stitch[] = [];
    if (events && events.length > 0) {
      for (const e of [...events].sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at))) {
        const st = stitchFromEvent(id, e, laneOf, names);
        if (st) stitches.push(st);
      }
    } else {
      // No audit trail (an older server, or past event retention): one
      // stitch where and when the conversation last moved.
      const at = Date.parse(summary.updated_at);
      const laneId = summary.workspace_id && wsById.has(summary.workspace_id) ? summary.workspace_id : DIRECT_LANE;
      stitches.push({
        id: `${id}:last`,
        conversationId: id,
        laneId,
        kind: summary.status === "failed" ? "failed" : "routed",
        start: at,
        end: at,
        label: summary.status === "failed" ? "Failed" : "Last activity",
      });
    }
    const run = input.running.get(id);
    if (run) {
      const laneId = run.workspaceId && wsById.has(run.workspaceId) ? run.workspaceId : (stitches.at(-1)?.laneId ?? DIRECT_LANE);
      stitches.push({ id: `${id}:working`, conversationId: id, laneId, kind: "working", start: run.since, end: now, label: "Working now" });
    }
    stitches = stitches.filter(visible);
    if (stitches.length === 0) continue;
    stitches.forEach((s) => usedLanes.add(s.laneId));
    threads.push({ conversationId: id, title: summary.preview || "Untitled conversation", stitches });
  }

  const knots: Knot[] = input.decisions
    .filter((d) => d.kind !== "takeover")
    .map((d) => {
      const laneId = d.workspaceId && wsById.has(d.workspaceId) ? d.workspaceId : DIRECT_LANE;
      usedLanes.add(laneId);
      const label =
        d.kind === "offer" ? "Wants approval" : d.kind === "failed" ? "Failed, waiting for a retry" : d.kind === "prompt" ? "Asking you" : "Waiting for your reply";
      return { key: d.key, conversationId: d.conversationId, laneId, since: Date.parse(d.since), label };
    });

  // Lanes: workspaces that saw work today, grouped by machine in name
  // order, then answers that ran nowhere.
  const lanes: Lane[] = [];
  const byMachine = new Map<string, Lane[]>();
  for (const id of usedLanes) {
    if (id === DIRECT_LANE) continue;
    const ws = wsById.get(id)!;
    const machine = targetById.get(ws.target_id)?.name ?? "Unknown machine";
    byMachine.set(machine, [...(byMachine.get(machine) ?? []), { id, label: ws.name, machine }]);
  }
  for (const machine of [...byMachine.keys()].sort()) {
    lanes.push(...byMachine.get(machine)!.sort((a, b) => a.label.localeCompare(b.label)));
  }
  if (usedLanes.has(DIRECT_LANE)) lanes.push({ id: DIRECT_LANE, label: "Answered directly", machine: "" });

  // The axis: from the hour before the first thing that happened (at
  // least the day's start) to now (today) or the hour after the last
  // thing (a past day).
  const times = [...threads.flatMap((t) => t.stitches.flatMap((s) => [s.start, s.end])), ...knots.map((k) => k.since)].filter(
    (t) => t >= day.start && t < day.end,
  );
  const first = times.length ? Math.min(...times) : Math.min(now, day.end) - 4 * HOUR;
  const last = times.length ? Math.max(...times) : first + 4 * HOUR;
  const start = Math.max(day.start, Math.floor(first / HOUR) * HOUR);
  const isToday = now >= day.start && now < day.end;
  // Today ends a few minutes past now, so "now" sits near the right edge
  // instead of an hour of empty future.
  const end = isToday ? Math.max(now + 5 * 60_000, start + 30 * 60_000) : Math.min(day.end, Math.ceil(last / HOUR) * HOUR + HOUR);

  return { start, end, lanes, threads, knots, omitted: Math.max(0, inDay.length - shown.length) };
}
