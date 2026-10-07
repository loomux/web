import { afterEach, describe, expect, it, vi } from "vitest";
import { snooze, snoozedUntil, subscribeSnoozes, unsnooze } from "./snooze";

const NOW = Date.parse("2026-10-08T12:00:00Z");
const HOUR = 3_600_000;

describe("snooze", () => {
  afterEach(() => localStorage.clear());

  it("hides a decision until the time given", () => {
    snooze("offer:o1", new Date(NOW + HOUR), NOW);
    expect(snoozedUntil("offer:o1", NOW)).toBe(NOW + HOUR);
    expect(snoozedUntil("offer:o1", NOW + 2 * HOUR)).toBeNull();
    expect(snoozedUntil("offer:other", NOW)).toBeNull();
  });

  it("un-snoozes", () => {
    snooze("k", new Date(NOW + HOUR), NOW);
    unsnooze("k");
    expect(snoozedUntil("k", NOW)).toBeNull();
  });

  it("drops snoozes that have run out when it saves a new one", () => {
    snooze("old", new Date(NOW + HOUR), NOW);
    snooze("new", new Date(NOW + 3 * HOUR), NOW + 2 * HOUR);
    expect(Object.keys(JSON.parse(localStorage.getItem("loomux.snoozed")!))).toEqual(["new"]);
  });

  it("survives a broken stored value", () => {
    localStorage.setItem("loomux.snoozed", "not json");
    expect(snoozedUntil("k", NOW)).toBeNull();
    snooze("k", new Date(NOW + HOUR), NOW);
    expect(snoozedUntil("k", NOW)).toBe(NOW + HOUR);
  });

  it("tells subscribers when it changes", () => {
    const listener = vi.fn();
    const stop = subscribeSnoozes(listener);
    snooze("k", new Date(NOW + HOUR), NOW);
    unsnooze("k");
    stop();
    snooze("k", new Date(NOW + HOUR), NOW);
    expect(listener).toHaveBeenCalledTimes(2);
  });
});
