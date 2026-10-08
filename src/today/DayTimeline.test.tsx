import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import type { Weave } from "../lib/weave";
import { DayStrip } from "./DayStrip";
import { DayTimeline } from "./DayTimeline";

const T = Date.parse("2026-10-08T09:00:00Z");
const MIN = 60_000;

const weave: Weave = {
  start: T,
  end: T + 6 * 60 * MIN,
  lanes: [
    { id: "w-ledger", label: "ledger-api", machine: "atlas" },
    { id: "w-infra", label: "infra-terraform", machine: "kestrel" },
  ],
  threads: [
    {
      conversationId: "ratelimit",
      title: "Add rate limiting",
      stitches: [
        { id: "a", conversationId: "ratelimit", dispatchId: "d1", laneId: "w-ledger", kind: "routed", start: T, end: T, label: "Routed to atlas" },
        { id: "b", conversationId: "ratelimit", dispatchId: "d1", laneId: "w-ledger", kind: "agent", start: T + MIN, end: T + 5 * MIN, label: "Agent turn, 4m 00s" },
        { id: "c", conversationId: "ratelimit", dispatchId: "d2", laneId: "w-ledger", kind: "failed", start: T + 60 * MIN, end: T + 60 * MIN, label: "Failed: usage limit" },
      ],
    },
  ],
  knots: [{ key: "offer:o1", conversationId: "restart", laneId: "w-infra", since: T + 120 * MIN, label: "Wants approval" }],
  omitted: 0,
};

describe("DayTimeline", () => {
  it("puts what waits on you first, then one row per turn, newest first, led by its most telling step", () => {
    render(
      <MemoryRouter>
        <DayTimeline weave={weave} />
      </MemoryRouter>,
    );
    const rows = screen.getAllByRole("listitem");
    expect(rows.map((r) => within(r).getByRole("link").textContent)).toEqual([
      expect.stringContaining("Wants approval"),
      expect.stringContaining("Failed: usage limit"),
      expect.stringContaining("Agent turn, 4m 00s"),
    ]);
    expect(within(rows[2]).getByRole("link")).toHaveAttribute("href", "/conversations/ratelimit?turn=d1");
    expect(rows[2]).toHaveTextContent("ledger-api on atlas");
  });
});

describe("DayStrip", () => {
  it("shows the day at a glance and jumps to a waiting card", async () => {
    const onKnot = vi.fn();
    render(
      <MemoryRouter>
        <DayStrip weave={weave} now={T + 150 * MIN} onKnot={onKnot} />
      </MemoryRouter>,
    );
    const strip = screen.getByRole("region", { name: "Today at a glance" });
    expect(strip).toHaveTextContent("1 waiting, 0 working");
    expect(within(strip).getByRole("link", { name: "Open Today" })).toHaveAttribute("href", "/today");
    await userEvent.click(within(strip).getByRole("button", { name: "Wants approval: show it" }));
    expect(onKnot).toHaveBeenCalledWith("offer:o1");
  });
});
