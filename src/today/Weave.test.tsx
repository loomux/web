import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import type { Weave as WeaveModel } from "../lib/weave";
import { Weave } from "./Weave";

const T = Date.parse("2026-10-08T09:00:00Z");
const MIN = 60_000;

const weave: WeaveModel = {
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

function renderWeave() {
  render(
    <MemoryRouter>
      <button type="button">Before</button>
      <Weave weave={weave} isToday={false} now={T} />
      <button type="button">After</button>
    </MemoryRouter>,
  );
}

describe("Weave", () => {
  it("is one tab stop, with arrows to move inside it", async () => {
    renderWeave();
    await userEvent.click(screen.getByRole("button", { name: "Before" }));
    await userEvent.tab();
    expect(screen.getByRole("link", { name: /Routed to atlas/ })).toHaveFocus();
    await userEvent.tab();
    expect(screen.getByRole("button", { name: "After" })).toHaveFocus();

    await userEvent.tab({ shift: true });
    await userEvent.keyboard("{ArrowRight}");
    expect(screen.getByRole("link", { name: /Agent turn/ })).toHaveFocus();
    await userEvent.keyboard("{ArrowDown}");
    expect(screen.getByRole("link", { name: /Wants approval/ })).toHaveFocus();
    await userEvent.keyboard("{ArrowUp}");
    expect(screen.getByRole("link", { name: /Failed: usage limit/ })).toHaveFocus();

    // Tab comes back to where you left off.
    await userEvent.tab();
    await userEvent.tab({ shift: true });
    expect(screen.getByRole("link", { name: /Failed: usage limit/ })).toHaveFocus();
  });
});
