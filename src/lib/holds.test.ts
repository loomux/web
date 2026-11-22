import { describe, expect, it } from "vitest";
import type { TaskHold } from "./api";
import { clientName, drivingHold, heldSince, holderName } from "./holds";

const hold = (over: Partial<TaskHold> = {}): TaskHold => ({
  id: "h1",
  task_id: "t1",
  session_id: "s1",
  client_kind: "tui",
  client_label: "laptop",
  mode: "drive",
  prev_status: "awaiting_input",
  ttl_seconds: 45,
  acquired_at: "2026-11-20T13:02:00Z",
  renewed_at: "2026-11-20T13:02:30Z",
  expires_at: "2026-11-20T13:03:15Z",
  ...over,
});

describe("holderName", () => {
  // The same words as the server's own refusal (router HeldError), so the
  // banner and a refused message's text name the holder alike.
  it.each([
    ["tui", "laptop", "the terminal on laptop"],
    ["tui", "", "the terminal"],
    ["web", "", "the web"],
    ["app", "phone", "the app on phone"],
    ["", "", "a client"],
    ["something-new", "box", "a client on box"],
  ])("%s / %s → %s", (kind, label, want) => {
    expect(holderName(kind, label)).toBe(want);
  });
});

describe("drivingHold", () => {
  it("is an active drive hold", () => {
    const h = hold();
    expect(drivingHold(h)).toBe(h);
  });

  it.each([
    ["absent (a server from before holds)", undefined],
    ["null (nobody holds it)", null],
    ["ended", hold({ ended_at: "2026-11-20T13:10:00Z", ended_reason: "released" })],
    ["a watch (read-only, automation keeps going)", hold({ mode: "watch" })],
  ])("is nothing when the hold is %s", (_name, h) => {
    expect(drivingHold(h)).toBeNull();
  });
});

describe("heldSince", () => {
  it("is the time of day for a hold taken today", () => {
    const at = new Date(2026, 10, 20, 14, 2);
    const now = new Date(2026, 10, 20, 18, 0).getTime();
    expect(heldSince(at.toISOString(), now)).toBe(at.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }));
  });

  it("names the day for an older one", () => {
    const at = new Date(2026, 10, 18, 9, 30);
    const now = new Date(2026, 10, 20, 18, 0).getTime();
    const got = heldSince(at.toISOString(), now);
    expect(got).toContain(at.toLocaleDateString([], { day: "numeric", month: "short" }));
    expect(got).toContain(at.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }));
  });
});

describe("clientName", () => {
  it.each([
    ["tui", "loomux TUI"],
    ["web", "Web"],
    ["app", "App"],
    ["", ""],
    [undefined, ""],
    ["other", ""],
  ])("%s → %j", (kind, want) => {
    expect(clientName(kind)).toBe(want);
  });
});
