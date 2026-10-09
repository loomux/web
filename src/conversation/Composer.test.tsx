import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { Composer } from "./Composer";

function Harness({ inFlight = false, onSend = vi.fn(), onQueue = vi.fn() }: { inFlight?: boolean; onSend?: (t: string) => void; onQueue?: (t: string) => void }) {
  const [draft, setDraft] = useState("");
  const [queued, setQueued] = useState<string | null>(null);
  return (
    <Composer
      draft={draft}
      onDraftChange={setDraft}
      sending={false}
      inFlight={inFlight}
      queued={queued}
      onSend={onSend}
      onQueue={(t) => {
        onQueue(t);
        setQueued(t);
        setDraft("");
      }}
      onUnqueue={() => {
        setDraft(queued ?? "");
        setQueued(null);
      }}
      autoFocusKey="k"
    />
  );
}

function pointer(coarse: boolean) {
  window.matchMedia = vi.fn().mockImplementation((q: string) => ({ matches: coarse && q.includes("coarse"), media: q })) as never;
}

describe("Composer", () => {
  const original = window.matchMedia;
  afterEach(() => {
    window.matchMedia = original;
  });

  it("has a label, and sends on Enter with a keyboard and mouse, Shift+Enter being a newline", async () => {
    pointer(false);
    const onSend = vi.fn();
    render(<Harness onSend={onSend} />);
    const box = screen.getByRole("textbox", { name: "Message the agent fleet" });
    expect(box).toHaveFocus();
    await userEvent.type(box, "line one{Shift>}{Enter}{/Shift}line two{Enter}");
    expect(onSend).toHaveBeenCalledWith("line one\nline two");
  });

  // LOOM-169: Enter that confirms an IME candidate doesn't send.
  it("doesn't send on Enter while an IME is composing", async () => {
    pointer(false);
    const onSend = vi.fn();
    render(<Harness onSend={onSend} />);
    const box = screen.getByRole("textbox", { name: "Message the agent fleet" });
    await userEvent.type(box, "にほんご");
    fireEvent.keyDown(box, { key: "Enter", isComposing: true });
    fireEvent.keyDown(box, { key: "Enter", keyCode: 229 });
    expect(onSend).not.toHaveBeenCalled();
    fireEvent.keyDown(box, { key: "Enter" });
    expect(onSend).toHaveBeenCalledWith("にほんご");
  });

  it("on a touch screen, Enter is a newline and Send is the button; it doesn't raise the keyboard by itself", async () => {
    pointer(true);
    const onSend = vi.fn();
    render(<Harness onSend={onSend} />);
    const box = screen.getByRole("textbox", { name: "Message the agent fleet" });
    expect(box).not.toHaveFocus();
    expect(box).toHaveAttribute("enterkeyhint", "enter");
    await userEvent.type(box, "one{Enter}two");
    expect(onSend).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: "Send" }));
    expect(onSend).toHaveBeenCalledWith("one\ntwo");
  });

  it("lets you write during a turn, holds the message, and gives it back on request", async () => {
    pointer(false);
    const onQueue = vi.fn();
    render(<Harness inFlight onQueue={onQueue} />);
    expect(screen.getByRole("button", { name: "Working…" })).toBeDisabled();
    const box = screen.getByRole("textbox");
    await userEvent.type(box, "next step");
    await userEvent.click(screen.getByRole("button", { name: "Send when done" }));
    expect(onQueue).toHaveBeenCalledWith("next step");
    expect(screen.getByRole("status")).toHaveTextContent("sends when this turn finishes");
    await userEvent.click(screen.getByRole("button", { name: "Keep it as a draft" }));
    expect(box).toHaveValue("next step");
  });
});
