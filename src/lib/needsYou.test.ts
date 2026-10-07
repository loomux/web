import { describe, expect, it } from "vitest";
import type { Confirmation, ConversationSummary, ConversationTask, Dispatch } from "./api";
import {
  compareDecisions,
  deriveDecisions,
  detailCandidates,
  groupDecisions,
  isOlder,
  OLDER_AFTER_MS,
  type ConversationDetail,
  type Decision,
} from "./needsYou";

const NOW = Date.parse("2026-10-08T12:00:00Z");
const ago = (ms: number) => new Date(NOW - ms).toISOString();
const inMs = (ms: number) => new Date(NOW + ms).toISOString();
const MIN = 60_000;

function summary(over: Partial<ConversationSummary> = {}): ConversationSummary {
  return { conversation_id: "c1", workspace_id: "w1", status: "completed", updated_at: ago(MIN), preview: "hi", ...over };
}

function task(over: Partial<ConversationTask> = {}): ConversationTask {
  return {
    id: "k1",
    workspace_id: "w1",
    kind: "agent",
    agent_type: "claude-code",
    status: "completed",
    created_at: ago(10 * MIN),
    updated_at: ago(MIN),
    ...over,
  };
}

function offer(over: Partial<Confirmation> = {}): Confirmation {
  return {
    id: "o1",
    kind: "run_command",
    command: "kubectl -n staging rollout restart deploy/ledger-api",
    status: "pending",
    created_at: ago(2 * MIN),
    expires_at: inMs(4 * MIN),
    ...over,
  };
}

function dispatch(over: Partial<Dispatch> = {}): Dispatch {
  return { dispatch_id: "d1", conversation_id: "c1", status: "succeeded", created_at: ago(5 * MIN), ...over };
}

function detail(over: Partial<ConversationDetail> = {}): ConversationDetail {
  return { conversation_id: "c1", tasks: [], dispatches: [], confirmations: [], ...over };
}

describe("deriveDecisions", () => {
  it("finds nothing in a finished conversation", () => {
    expect(deriveDecisions(summary(), detail({ tasks: [task()], dispatches: [dispatch()] }), NOW)).toEqual([]);
  });

  it("finds a pending offer, with what it would run", () => {
    const [d] = deriveDecisions(summary(), detail({ confirmations: [offer()] }), NOW);
    expect(d).toMatchObject({ kind: "offer", key: "offer:o1", conversationId: "c1", since: ago(2 * MIN) });
    expect(d.confirmation?.command).toContain("kubectl");
  });

  it("drops an offer past expires_at even before the server says expired", () => {
    expect(deriveDecisions(summary(), detail({ confirmations: [offer({ expires_at: ago(1) })] }), NOW)).toEqual([]);
  });

  it("drops resolved offers", () => {
    const resolved = ["approved", "denied", "expired"] as const;
    for (const status of resolved) {
      expect(deriveDecisions(summary(), detail({ confirmations: [offer({ status })] }), NOW)).toEqual([]);
    }
  });

  it.each([
    ["needs_attention", "prompt"],
    ["awaiting_input", "awaiting"],
    ["human_takeover", "takeover"],
  ])("reads the latest task's %s as %s", (status, kind) => {
    const old = task({ id: "k0", status: "completed", updated_at: ago(30 * MIN) });
    const latest = task({ id: "k1", status, updated_at: ago(MIN), workspace_id: "w2" });
    const [d] = deriveDecisions(summary(), detail({ tasks: [latest, old] }), NOW);
    expect(d).toMatchObject({ kind, task: latest, workspaceId: "w2" });
  });

  it("ignores an earlier task stuck at a prompt once a later one moved on", () => {
    const stuck = task({ id: "k0", status: "needs_attention", updated_at: ago(30 * MIN) });
    const later = task({ id: "k1", status: "running", updated_at: ago(MIN) });
    expect(deriveDecisions(summary(), detail({ tasks: [stuck, later] }), NOW)).toEqual([]);
  });

  it("gives a new prompt on the same task a new key, so a snooze doesn't hide it", () => {
    const first = deriveDecisions(summary(), detail({ tasks: [task({ status: "needs_attention", updated_at: ago(9 * MIN) })] }), NOW);
    const second = deriveDecisions(summary(), detail({ tasks: [task({ status: "needs_attention", updated_at: ago(MIN) })] }), NOW);
    expect(first[0].key).not.toBe(second[0].key);
  });

  it("finds a failed latest turn", () => {
    const failed = dispatch({ dispatch_id: "d2", status: "failed", error_class: "target_unreachable", created_at: ago(MIN), finished_at: ago(MIN / 2) });
    const [d] = deriveDecisions(summary(), detail({ dispatches: [dispatch(), failed] }), NOW);
    expect(d).toMatchObject({ kind: "failed", key: "failed:d2", since: ago(MIN / 2), dispatch: failed });
  });

  it("keeps what a retry resends, and where answers go", () => {
    const failed = dispatch({ dispatch_id: "d2", status: "failed", created_at: ago(MIN) });
    const [d] = deriveDecisions(
      summary(),
      detail({
        tasks: [task({ id: "a", kind: "agent", workspace_id: "w-agent" }), task({ id: "b", kind: "command", workspace_id: "w-cmd" })],
        dispatches: [failed],
        messages: [
          { id: "m1", role: "user", content: "earlier", task_id: "", dispatch_id: "d1", created_at: ago(9 * MIN) },
          { id: "m2", role: "user", content: "bump the providers", task_id: "", dispatch_id: "d2", created_at: ago(MIN) },
        ],
      }),
      NOW,
    );
    expect(d).toMatchObject({ kind: "failed", retryMessage: "bump the providers", workspaceHint: "w-agent" });
  });

  it("finds an interrupted latest turn", () => {
    const [d] = deriveDecisions(summary(), detail({ dispatches: [dispatch({ status: "interrupted" })] }), NOW);
    expect(d.kind).toBe("failed");
  });

  it("forgets a failure once something newer was sent", () => {
    const failed = dispatch({ dispatch_id: "d1", status: "failed", created_at: ago(5 * MIN) });
    const retry = dispatch({ dispatch_id: "d2", status: "running", created_at: ago(MIN) });
    expect(deriveDecisions(summary(), detail({ dispatches: [failed, retry] }), NOW)).toEqual([]);
  });

  it("doesn't ask about a turn the user cancelled", () => {
    const cancelled = dispatch({ status: "failed", error_class: "cancelled" });
    expect(deriveDecisions(summary(), detail({ dispatches: [cancelled] }), NOW)).toEqual([]);
  });

  it("falls back to the list status before the detail has loaded", () => {
    const [d] = deriveDecisions(summary({ status: "awaiting_input" }), undefined, NOW);
    expect(d).toMatchObject({ kind: "awaiting", conversationId: "c1", workspaceId: "w1", preview: "hi" });
    expect(deriveDecisions(summary({ status: "running" }), undefined, NOW)).toEqual([]);
  });

  it("can find several things in one conversation", () => {
    const kinds = deriveDecisions(
      summary(),
      detail({
        confirmations: [offer()],
        tasks: [task({ status: "needs_attention" })],
        dispatches: [dispatch({ status: "failed" })],
      }),
      NOW,
    ).map((d) => d.kind);
    expect(kinds).toEqual(["offer", "prompt", "failed"]);
  });
});

function decision(over: Partial<Decision>): Decision {
  return { key: over.key ?? "k", kind: "prompt", conversationId: "c", since: ago(MIN), ...over };
}

describe("ordering and grouping", () => {
  it("puts offers first, soonest to expire first, then prompts, failures, takeovers", () => {
    const list = [
      decision({ key: "takeover", kind: "takeover" }),
      decision({ key: "failed", kind: "failed" }),
      decision({ key: "late-offer", kind: "offer", confirmation: offer({ expires_at: inMs(9 * MIN) }) }),
      decision({ key: "prompt-old", kind: "prompt", since: ago(9 * MIN) }),
      decision({ key: "prompt-new", kind: "awaiting", since: ago(MIN) }),
      decision({ key: "soon-offer", kind: "offer", confirmation: offer({ expires_at: inMs(MIN) }) }),
    ];
    expect([...list].sort(compareDecisions).map((d) => d.key)).toEqual([
      "soon-offer",
      "late-offer",
      "prompt-new",
      "prompt-old",
      "failed",
      "takeover",
    ]);
  });

  it("folds things waiting over a day into older, except offers", () => {
    expect(isOlder(decision({ since: ago(OLDER_AFTER_MS + MIN) }), NOW)).toBe(true);
    expect(isOlder(decision({ since: ago(OLDER_AFTER_MS - MIN) }), NOW)).toBe(false);
    expect(isOlder(decision({ kind: "offer", since: ago(2 * OLDER_AFTER_MS), confirmation: offer() }), NOW)).toBe(false);
  });

  it("splits current, older and snoozed, and counts all but snoozed", () => {
    const g = groupDecisions(
      [
        decision({ key: "now" }),
        decision({ key: "old", since: ago(2 * OLDER_AFTER_MS) }),
        decision({ key: "zzz" }),
      ],
      (key) => key === "zzz",
      NOW,
    );
    expect(g.current.map((d) => d.key)).toEqual(["now"]);
    expect(g.older.map((d) => d.key)).toEqual(["old"]);
    expect(g.snoozed.map((d) => d.key)).toEqual(["zzz"]);
    expect(g.count).toBe(2);
  });
});

describe("detailCandidates", () => {
  it("fetches details for needs-you statuses and anything touched in the last day, newest first", () => {
    const picked = detailCandidates(
      [
        summary({ conversation_id: "old-done", status: "completed", updated_at: ago(3 * OLDER_AFTER_MS) }),
        summary({ conversation_id: "old-stuck", status: "awaiting_input", updated_at: ago(2 * OLDER_AFTER_MS) }),
        summary({ conversation_id: "recent", status: "completed", updated_at: ago(MIN) }),
      ],
      NOW,
    ).map((s) => s.conversation_id);
    expect(picked).toEqual(["recent", "old-stuck"]);
  });

  it("stops at the limit", () => {
    const many = Array.from({ length: 50 }, (_, i) => summary({ conversation_id: `c${i}`, updated_at: ago(i * MIN) }));
    expect(detailCandidates(many, NOW, 30)).toHaveLength(30);
  });
});
