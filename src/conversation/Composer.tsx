import { useEffect, useLayoutEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { Button } from "../ui/Button";

// The composer (principles 6). It grows with its text. On a touch screen
// Enter is a newline and Send is the button; with a keyboard and mouse
// Enter sends and Shift+Enter is a newline (Ctrl/Cmd+Enter also sends).
// A turn running doesn't lock it: you can keep writing, and Send then
// holds the message until the turn ends, and says so.
function coarsePointer() {
  return typeof window.matchMedia === "function" && window.matchMedia("(pointer: coarse)").matches;
}

export function Composer({
  draft,
  onDraftChange,
  sending,
  inFlight,
  queued,
  held = false,
  onSend,
  onQueue,
  onUnqueue,
  autoFocusKey,
}: {
  draft: string;
  onDraftChange: (text: string) => void;
  sending: boolean;
  inFlight: boolean;
  queued: string | null;
  // A held message came back unsent because the turn left something to
  // answer first.
  held?: boolean;
  onSend: (text: string) => void;
  onQueue: (text: string) => void;
  onUnqueue: () => void;
  // Focus when this changes (a conversation opened, a turn ended), but
  // only with a fine pointer: on a phone it would raise the keyboard.
  autoFocusKey: string;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const [touch] = useState(coarsePointer);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  }, [draft]);

  useEffect(() => {
    if (!touch) ref.current?.focus();
  }, [autoFocusKey, touch]);

  const text = draft.trim();
  function submit(e?: FormEvent) {
    e?.preventDefault();
    if (!text || sending || queued !== null) return;
    if (inFlight) onQueue(draft);
    else onSend(draft);
  }

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key !== "Enter") return;
    // Enter that picks an IME candidate (Japanese, Chinese…) isn't a send;
    // Safari reports it as keyCode 229 instead of isComposing.
    if (e.nativeEvent.isComposing || e.keyCode === 229) return;
    if (e.ctrlKey || e.metaKey || (!touch && !e.shiftKey)) {
      e.preventDefault();
      submit();
    }
  }

  let label = "Send";
  if (sending) label = "Sending…";
  else if (inFlight && !text) label = "Working…";
  else if (inFlight) label = "Send when done";

  return (
    <form onSubmit={submit} className="border-t border-line bg-surface px-3 py-3 md:px-6">
      {held && queued === null && (
        <p role="status" className="mb-2 text-sm font-bold text-mari-ink">
          Not sent: something in this conversation needs your answer first. Answer it above, then send your message.
        </p>
      )}
      {queued !== null && (
        <p role="status" className="mb-2 flex flex-wrap items-center gap-x-3 text-sm text-ink-2">
          Your next message sends when this turn finishes.
          <button type="button" onClick={onUnqueue} className="min-h-9 font-bold text-accent">
            Keep it as a draft
          </button>
        </p>
      )}
      <div className="flex items-end gap-2">
        <label htmlFor="composer" className="sr-only">
          Message the agent fleet
        </label>
        <textarea
          id="composer"
          ref={ref}
          value={draft}
          onChange={(e) => onDraftChange(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="Message the agent fleet…"
          enterKeyHint={touch ? "enter" : "send"}
          rows={1}
          className="max-h-[200px] min-h-11 min-w-0 flex-1 resize-none rounded-control border border-line-strong bg-surface-2 px-3 py-2.5 text-ink placeholder:text-ink-3"
        />
        <Button
          type="submit"
          variant="primary"
          isDisabled={sending || !text || queued !== null}
        >
          {label}
        </Button>
      </div>
    </form>
  );
}
