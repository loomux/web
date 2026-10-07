import { describe, expect, it } from "vitest";
import type { ConversationEvent, ConversationSummary, Target, WorkspaceSummary } from "./api";
import { buildWeave, dayBounds, DIRECT_LANE, type WeaveInput } from "./weave";

const day = dayBounds(new Date(2026, 9, 8));
const at = (h: number, m = 0) => day.start + (h * 60 + m) * 60_000;
const iso = (t: number) => new Date(t).toISOString();

const targets = [
  { id: "t-atlas", name: "atlas" },
  { id: "t-kestrel", name: "kestrel" },
] as Target[];
const workspaces = [
  { id: "w-ledger", name: "ledger-api", target_id: "t-atlas", status: "active" },
  { id: "w-infra", name: "infra-terraform", target_id: "t-kestrel", status: "idle" },
  { id: "w-blog", name: "blog-rewrite", target_id: "t-atlas", status: "idle" },
] as WorkspaceSummary[];

function summary(id: string, updated: number, over: Partial<ConversationSummary> = {}): ConversationSummary {
  return { conversation_id: id, workspace_id: "", status: "completed", updated_at: iso(updated), preview: id, ...over };
}

function ev(id: string, kind: string, t: number, over: Partial<ConversationEvent> = {}): ConversationEvent {
  return { id, kind, created_at: iso(t), duration_ms: 0, ...over };
}

function input(over: Partial<WeaveInput> = {}): WeaveInput {
  return {
    day,
    now: at(14, 30),
    summaries: [],
    eventsById: new Map(),
    running: new Map(),
    decisions: [],
    workspaces,
    targets,
    ...over,
  };
}

describe("buildWeave", () => {
  it("turns a turn's events into stitches on the lanes they ran on, spans ending at their event", () => {
    const w = buildWeave(
      input({
        summaries: [summary("ratelimit", at(11))],
        eventsById: new Map([
          [
            "ratelimit",
            [
              ev("e1", "decision", at(9, 0), { target_id: "t-atlas", dispatch_id: "d1" }),
              ev("e2", "provision", at(9, 1), { workspace_id: "w-ledger", dispatch_id: "d1" }),
              ev("e3", "agent_turn", at(9, 6), { workspace_id: "w-ledger", duration_ms: 4 * 60_000 + 12_000, dispatch_id: "d1" }),
              ev("e4", "outcome", at(9, 6), { dispatch_id: "d1" }),
            ],
          ],
        ]),
      }),
    );
    const [thread] = w.threads;
    expect(thread.stitches.map((s) => [s.kind, s.label])).toEqual([
      ["routed", "Routed to atlas"],
      ["provision", "Set up ledger-api"],
      ["agent", "Agent turn, 4m 12s"],
    ]);
    const agent = thread.stitches[2];
    expect(agent.end - agent.start).toBe(4 * 60_000 + 12_000);
    expect(agent.end).toBe(at(9, 6));
    // The routing step names no workspace yet: it sits on the direct lane.
    expect(thread.stitches[0].laneId).toBe(DIRECT_LANE);
    expect(thread.stitches[1].laneId).toBe("w-ledger");
  });

  it("marks a failed turn and an offer's answer", () => {
    const w = buildWeave(
      input({
        summaries: [summary("tf", at(12))],
        eventsById: new Map([
          [
            "tf",
            [
              ev("o", "offer", at(11), { workspace_id: "w-infra", command: "terraform apply" }),
              ev("a", "offer_answered", at(11, 2), { outcome: "approved" }),
              ev("f", "outcome", at(11, 30), { error_class: "agent_rate_limited" }),
            ],
          ],
        ]),
      }),
    );
    expect(w.threads[0].stitches.map((s) => s.label)).toEqual(["Offered: terraform apply", "Offer approved", "Failed: usage limit"]);
    // Steps after one that named a workspace stay on its lane.
    expect(w.threads[0].stitches.every((s) => s.laneId === "w-infra")).toBe(true);
  });

  it("groups lanes under their machine, in name order, with direct answers last", () => {
    const w = buildWeave(
      input({
        summaries: [summary("a", at(10)), summary("b", at(10)), summary("c", at(10))],
        eventsById: new Map([
          ["a", [ev("1", "agent_turn", at(10), { workspace_id: "w-infra", duration_ms: 60_000 })]],
          ["b", [ev("2", "agent_turn", at(10), { workspace_id: "w-ledger", duration_ms: 60_000 })]],
          ["c", [ev("3", "decision", at(10))]],
        ]),
      }),
    );
    expect(w.lanes.map((l) => `${l.machine}/${l.label}`)).toEqual(["atlas/ledger-api", "kestrel/infra-terraform", "/Answered directly"]);
  });

  it("draws work running now up to now, and a knot for each thing waiting on you", () => {
    const w = buildWeave(
      input({
        summaries: [summary("changelog", at(14, 20), { status: "running", workspace_id: "w-blog" })],
        running: new Map([["changelog", { since: at(14, 27), workspaceId: "w-blog" }]]),
        decisions: [
          { key: "offer:o1", kind: "offer", conversationId: "restart", since: iso(at(14, 28)), workspaceId: "w-infra" },
          { key: "t", kind: "takeover", conversationId: "x", since: iso(at(13)) },
        ],
      }),
    );
    const working = w.threads[0].stitches.at(-1)!;
    expect(working).toMatchObject({ kind: "working", laneId: "w-blog", start: at(14, 27), end: at(14, 30) });
    expect(w.knots).toEqual([{ key: "offer:o1", conversationId: "restart", laneId: "w-infra", since: at(14, 28), label: "Wants approval" }]);
    expect(w.lanes.map((l) => l.id)).toContain("w-infra");
  });

  it("falls back to one stitch where a conversation has no audit trail", () => {
    const w = buildWeave(input({ summaries: [summary("old", at(9), { workspace_id: "w-ledger", status: "failed" })] }));
    expect(w.threads[0].stitches).toEqual([expect.objectContaining({ kind: "failed", laneId: "w-ledger", start: at(9) })]);
  });

  it("leaves out conversations from before the day, and says how many it left out past the limit", () => {
    const yesterday = summary("y", day.start - 60_000);
    const many = Array.from({ length: 5 }, (_, i) => summary(`c${i}`, at(10, i)));
    const w = buildWeave(input({ summaries: [yesterday, ...many], limit: 3 }));
    expect(w.threads).toHaveLength(3);
    expect(w.omitted).toBe(2);
    expect(w.threads.map((t) => t.conversationId)).toEqual(["c4", "c3", "c2"]);
  });

  it("runs today's axis from the hour before the first stitch to now", () => {
    const w = buildWeave(
      input({
        summaries: [summary("a", at(9, 40))],
        eventsById: new Map([["a", [ev("1", "decision", at(9, 40))]]]),
      }),
    );
    expect(w.start).toBe(at(9));
    expect(w.end).toBe(at(14, 35));
  });

  it("runs a past day's axis to the hour after its last stitch", () => {
    const yesterday = dayBounds(new Date(2026, 9, 7));
    const t = yesterday.start + 16 * 3_600_000 + 25 * 60_000;
    const w = buildWeave(
      input({
        day: yesterday,
        summaries: [summary("a", t)],
        eventsById: new Map([["a", [ev("1", "decision", t)]]]),
      }),
    );
    expect(w.start).toBe(yesterday.start + 16 * 3_600_000);
    expect(w.end).toBe(yesterday.start + 18 * 3_600_000);
  });
});
