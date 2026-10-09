import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";
import type { Dispatch } from "../lib/api";
import { TurnCard } from "./TurnCard";

const T0 = "2026-10-09T10:00:00Z";
const active: Dispatch = { dispatch_id: "d1", conversation_id: "c1", status: "running", created_at: T0 };

function card(label: string) {
  return <TurnCard active={active} stage={{ label }} onCancel={() => {}} cancelling={false} />;
}

describe("TurnCard", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(Date.parse(T0) + 5000));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  // LOOM-150: the ticking time isn't announced; a new stage is.
  it("announces stage changes but not the elapsed time", () => {
    const { rerender } = render(card("Deciding where this goes…"));
    const live = screen.getByRole("status");
    const before = live.textContent;
    expect(screen.getByText("5s")).toBeInTheDocument();

    act(() => vi.advanceTimersByTime(3000));
    expect(screen.getByText("8s")).toBeInTheDocument();
    expect(screen.getByRole("status").textContent).toBe(before);

    rerender(card("claude-code is working in my-app…"));
    expect(screen.getByRole("status")).toHaveTextContent("claude-code is working in my-app…");
  });
});
