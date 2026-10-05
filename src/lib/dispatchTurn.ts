// What the conversation page shows for a dispatch (LOOM-81): the stage of
// the turn in flight, and a failed turn's error in plain words.
import type { ConversationTask, Dispatch, DispatchStatus } from "./api";

export function isTerminalDispatch(status: DispatchStatus | string): boolean {
  return status === "succeeded" || status === "failed" || status === "interrupted";
}

export interface DispatchErrorText {
  message: string;
  hint: string;
  // The server's own error text, for anyone who wants the details.
  detail?: string;
}

// The router's TargetUnhealthyError reads `target "devbox" can't be used
// right now: <reason>` — already plain, so it's quoted rather than
// replaced, without the wrapping the dispatch error carries before it.
function targetReason(error: string): string | null {
  const i = error.indexOf('target "');
  return i >= 0 && error.includes("can't be used right now") ? error.slice(i) : null;
}

// describeDispatchError says what a failed turn's error_class means
// (registry.ErrorClass; "interrupted" is a dispatch's own), with what to
// try next. The server only gives a class and its raw error text.
export function describeDispatchError(errorClass: string | undefined, error: string | undefined): DispatchErrorText {
  const detail = error || undefined;
  const reason = error ? targetReason(error) : null;
  switch (errorClass) {
    case "target_unreachable":
      return {
        message: reason
          ? `Couldn't reach the machine: ${reason}.`
          : "Couldn't reach the machine this was meant to run on.",
        hint: "Check that it's on and reachable over SSH, then retry.",
        detail,
      };
    case "target_unhealthy":
      return {
        message: reason ? `The machine isn't usable right now: ${reason}.` : "The machine isn't usable right now.",
        hint: "Fix what's wrong with it (see Targets), or ask for another machine.",
        detail,
      };
    case "timeout":
      return {
        message: "The agent took too long and the turn was stopped.",
        hint: "Retry, or attach to its session to see where it got stuck.",
        detail,
      };
    case "agent_exited":
      return {
        message: "The agent exited before it finished.",
        hint: "It may have crashed or been signed out. Retry to start it again.",
        detail,
      };
    case "wait_failed":
      return {
        message: "Loomux lost track of the turn while waiting for the agent.",
        hint: "The agent may still have finished: check its session, or retry.",
        detail,
      };
    case "interrupted":
      return {
        message: "The turn was interrupted when Loomux restarted.",
        hint: "Retry to send it again.",
        detail,
      };
    case "cancelled":
      return {
        message: "You cancelled this turn.",
        hint: "Retry to send it again. Its terminal session is kept, so you can attach to see how far it got.",
        detail,
      };
    case "agent_rate_limited": {
      // The server's text reads `… hit its usage limit, resets 5pm (…) (it shows "…")`.
      const resets = error?.match(/hit its usage limit, resets (.+?) \(it shows /)?.[1];
      return {
        message: resets
          ? `The agent hit its usage limit. It resets ${resets}.`
          : "The agent hit its usage limit.",
        hint: "Send your message again after the reset, or ask for a different agent.",
        detail,
      };
    }
    case "login_required":
      return {
        message: "The agent needs to be signed in on that machine.",
        hint: "Sign it in there, then retry.",
        detail,
      };
    default:
      return {
        message: "Something went wrong while handling this message.",
        hint: "Retry. If it keeps failing, the details below say what the server saw.",
        detail,
      };
  }
}

export interface TurnStage {
  label: string;
  // Set once this turn's task is known.
  taskId?: string;
  workspace?: string;
  agent?: string;
}

// thisTurnsTask is the task the in-flight dispatch is driving: one created
// or updated since the job started. A follow-up reuses an existing task,
// so a fresh update counts as well as a fresh task.
function thisTurnsTask(d: Dispatch, tasks: ConversationTask[]): ConversationTask | undefined {
  const since = Date.parse(d.started_at ?? d.created_at);
  return tasks.findLast((t) => Date.parse(t.created_at) >= since || Date.parse(t.updated_at) >= since);
}

// turnStage describes an in-flight dispatch from its status and the
// conversation's tasks. The server has no per-stage events yet (LOOM-96),
// so the stage is read off what it does report.
export function turnStage(d: Dispatch, tasks: ConversationTask[], workspaceNames: Map<string, string>): TurnStage {
  if (d.status === "queued") return { label: "Queued" };
  const task = thisTurnsTask(d, tasks);
  if (!task) return { label: "Deciding where this goes…" };
  const workspace = workspaceNames.get(task.workspace_id) ?? task.workspace_id;
  const agent = task.agent_type || "The agent";
  const base = { taskId: task.id, workspace, agent };
  if (task.kind === "command") return { ...base, label: `Running a command in ${workspace}…` };
  switch (task.status) {
    case "needs-attention":
    case "awaiting-input":
      return { ...base, label: `${agent} is waiting for you` };
    case "human-takeover":
      return { ...base, label: "Someone has taken over the session" };
    case "completed":
      return { ...base, label: "Relaying the answer…" };
    default:
      return { ...base, label: `${agent} is working in ${workspace}…` };
  }
}

export function formatElapsed(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  if (s < 60) return `${s}s`;
  const pad = (n: number) => String(n).padStart(2, "0");
  if (s < 3600) return `${Math.floor(s / 60)}m ${pad(s % 60)}s`;
  return `${Math.floor(s / 3600)}h ${pad(Math.floor((s % 3600) / 60))}m`;
}
