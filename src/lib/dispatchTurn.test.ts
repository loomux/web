import { describe, expect, it } from "vitest";
import type { ConversationTask, Dispatch } from "./api";
import { describeDispatchError, formatElapsed, isTerminalDispatch, turnStage } from "./dispatchTurn";

function dispatch(overrides: Partial<Dispatch> = {}): Dispatch {
  return {
    dispatch_id: "d1",
    conversation_id: "c1",
    status: "running",
    created_at: "2026-10-05T10:00:00Z",
    started_at: "2026-10-05T10:00:01Z",
    ...overrides,
  };
}

function task(overrides: Partial<ConversationTask> = {}): ConversationTask {
  return {
    id: "t1",
    workspace_id: "ws-1",
    kind: "agent",
    agent_type: "claude-code",
    status: "running",
    created_at: "2026-10-05T10:00:05Z",
    updated_at: "2026-10-05T10:00:05Z",
    ...overrides,
  };
}

describe("describeDispatchError", () => {
  it("says in plain words what each error class means, with a hint", () => {
    const e = describeDispatchError("target_unreachable", "dial tcp 10.0.0.5:22: i/o timeout");
    expect(e.message).toMatch(/couldn't reach/i);
    expect(e.hint).toBeTruthy();
    expect(e.message).not.toContain("dial tcp");
  });

  it("covers every class a dispatch can end with", () => {
    for (const cls of [
      "timeout",
      "agent_exited",
      "target_unreachable",
      "target_unhealthy",
      "agent_rate_limited",
      "login_required",
      "message_too_large",
      "wait_failed",
      "interrupted",
      "cancelled",
      "internal",
    ]) {
      const e = describeDispatchError(cls, "x");
      expect(e.message, cls).not.toBe("");
      expect(e.message, cls).not.toBe("x");
    }
  });

  it("says when a usage limit resets (LOOM-109)", () => {
    const e = describeDispatchError(
      "agent_rate_limited",
      'router: dispatch: agent "claude-code" on sc1 hit its usage limit, resets 5pm (Europe/Istanbul) (it shows "5-hour limit reached ∙ resets 5pm (Europe/Istanbul)"). Send your message again after the reset, or ask for a different agent',
    );
    expect(e.message).toBe("The agent hit its usage limit. It resets 5pm (Europe/Istanbul).");
    expect(e.hint).toMatch(/after the reset/);
    expect(describeDispatchError("agent_rate_limited", "no reset given").message).toBe("The agent hit its usage limit.");
  });

  it("tells a cancelled turn from a failure", () => {
    expect(describeDispatchError("cancelled", "cancelled by the user").message).toMatch(/you cancelled/i);
  });

  it("keeps the server's own text as detail, and falls back to it for an unknown class", () => {
    expect(describeDispatchError("timeout", "turn exceeded 30m").detail).toBe("turn exceeded 30m");
    expect(describeDispatchError("something_new", "boom").message).toMatch(/went wrong/i);
    expect(describeDispatchError(undefined, "boom").detail).toBe("boom");
  });

  it("puts a target-unhealthy reason in the message itself", () => {
    // The router's TargetUnhealthyError text is already plain language.
    const e = describeDispatchError(
      "target_unhealthy",
      'dispatch: target "devbox" can\'t be used right now: only 200 MiB free',
    );
    expect(e.message).toContain("only 200 MiB free");
  });
});

describe("isTerminalDispatch", () => {
  it("is true for succeeded, failed and interrupted only", () => {
    expect(["queued", "running", "succeeded", "failed", "interrupted"].map(isTerminalDispatch)).toEqual([
      false,
      false,
      true,
      true,
      true,
    ]);
  });
});

describe("turnStage", () => {
  const names = new Map([["ws-1", "my-app"]]);

  it("is queued before the job starts", () => {
    expect(turnStage(dispatch({ status: "queued" }), [], names).label).toMatch(/queued/i);
  });

  it("is routing while no task has started for this turn", () => {
    // An older task (before the dispatch) isn't this turn's.
    const old = task({
      created_at: "2026-10-05T09:00:00Z",
      updated_at: "2026-10-05T09:00:00Z",
      status: "completed",
    });
    expect(turnStage(dispatch(), [old], names).label).toMatch(/deciding/i);
  });

  it("names the agent and workspace once this turn's task is running", () => {
    const s = turnStage(dispatch(), [task()], names);
    expect(s.label).toMatch(/claude-code is working/i);
    expect(s.workspace).toBe("my-app");
    expect(s.taskId).toBe("t1");
  });

  it("counts a follow-up into an existing task as this turn's once it updates", () => {
    const followUp = task({
      created_at: "2026-10-05T09:00:00Z",
      updated_at: "2026-10-05T10:00:02Z",
    });
    expect(turnStage(dispatch(), [followUp], names).label).toMatch(/working/i);
  });

  it("says when the agent is waiting on the user", () => {
    expect(turnStage(dispatch(), [task({ status: "needs-attention" })], names).label).toMatch(/waiting for you/i);
  });

  it("says when a command is running", () => {
    expect(turnStage(dispatch(), [task({ kind: "command", agent_type: "" })], names).label).toMatch(
      /running a command/i,
    );
  });
});

describe("formatElapsed", () => {
  it("formats seconds and minutes", () => {
    expect(formatElapsed(0)).toBe("0s");
    expect(formatElapsed(42_000)).toBe("42s");
    expect(formatElapsed(125_000)).toBe("2m 05s");
    expect(formatElapsed(3_725_000)).toBe("1h 02m");
  });
});
