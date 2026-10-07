import { describe, expect, it } from "vitest";
import {
  compareConversationSummaries,
  matchesStatusFilter,
  statusRank,
} from "./conversations";

function make(status: string, updatedAt: string, id: string) {
  return { status, updated_at: updatedAt, conversation_id: id };
}

describe("statusRank", () => {
  it("ranks attention statuses highest", () => {
    expect(statusRank("awaiting_input")).toBe(0);
    expect(statusRank("human_takeover")).toBe(0);
  });

  it("ranks running in the middle", () => {
    expect(statusRank("running")).toBe(1);
  });

  it("ranks completed and failed lowest", () => {
    expect(statusRank("completed")).toBe(2);
    expect(statusRank("failed")).toBe(2);
  });

  it("treats unknown statuses as lowest", () => {
    expect(statusRank("unknown")).toBe(2);
  });
});

describe("compareConversationSummaries", () => {
  it("orders attention statuses before running and done", () => {
    const attention = make("awaiting_input", "2026-09-10T10:00:00Z", "a");
    const running = make("running", "2026-09-10T11:00:00Z", "b");
    const completed = make("completed", "2026-09-10T12:00:00Z", "c");

    const sorted = [completed, running, attention].sort(compareConversationSummaries);
    expect(sorted.map((c) => c.conversation_id)).toEqual(["a", "b", "c"]);
  });

  it("sorts most-recently-updated first within the same rank", () => {
    const older = make("running", "2026-09-10T09:00:00Z", "older");
    const newer = make("running", "2026-09-10T11:00:00Z", "newer");

    const sorted = [older, newer].sort(compareConversationSummaries);
    expect(sorted.map((c) => c.conversation_id)).toEqual(["newer", "older"]);
  });

  it("uses conversation_id as a stable tie-breaker", () => {
    const a = make("running", "2026-09-10T09:00:00Z", "b-id");
    const b = make("running", "2026-09-10T09:00:00Z", "a-id");

    const sorted = [a, b].sort(compareConversationSummaries);
    expect(sorted.map((c) => c.conversation_id)).toEqual(["a-id", "b-id"]);
  });

  it("falls back to conversation_id tie-breaker when updated_at is unparseable", () => {
    const a = make("running", "not-a-date", "a-id");
    const b = make("running", "also-not-a-date", "b-id");

    const sorted = [b, a].sort(compareConversationSummaries);
    expect(sorted.map((c) => c.conversation_id)).toEqual(["a-id", "b-id"]);
  });
});

describe("matchesStatusFilter", () => {
  it("includes everything for all", () => {
    expect(matchesStatusFilter("awaiting_input", "all")).toBe(true);
    expect(matchesStatusFilter("completed", "all")).toBe(true);
  });

  it("matches needs-you statuses", () => {
    expect(matchesStatusFilter("awaiting_input", "needs-you")).toBe(true);
    expect(matchesStatusFilter("human_takeover", "needs-you")).toBe(true);
    expect(matchesStatusFilter("running", "needs-you")).toBe(false);
  });

  it("matches running status", () => {
    expect(matchesStatusFilter("running", "running")).toBe(true);
    expect(matchesStatusFilter("completed", "running")).toBe(false);
  });

  it("matches done statuses", () => {
    expect(matchesStatusFilter("completed", "done")).toBe(true);
    expect(matchesStatusFilter("failed", "done")).toBe(true);
    expect(matchesStatusFilter("running", "done")).toBe(false);
  });
});
