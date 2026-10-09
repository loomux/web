import { useEffect, useState } from "react";
import type { Dispatch } from "../lib/api";
import { formatElapsed, type TurnStage } from "../lib/dispatchTurn";
import { Button } from "../ui/Button";
import { AttachCommand } from "./AttachCommand";
import { PanePanel } from "./PanePanel";

// The turn in flight (principles 5): where it has got to as a short
// sequence of steps, how long it has run, Cancel, and once its task is
// known the attach command and the terminal. The server sends no
// per-stage events (LOOM-96), so the steps are read off the dispatch and
// task statuses (turnStage).
export function TurnCard({
  active,
  stage,
  onCancel,
  cancelling,
}: {
  active: Dispatch;
  stage: TurnStage;
  onCancel: () => void;
  cancelling: boolean;
}) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const queued = active.status === "queued";
  const routed = !!stage.taskId;
  const steps = [
    { label: "Queued", done: !queued, current: queued },
    { label: "Deciding where this goes", done: routed, current: !queued && !routed },
    ...(routed ? [{ label: stage.label.replace(/…$/, ""), done: false, current: true }] : []),
  ];

  // Only the stage is a live region (LOOM-150): the ticking time, the
  // terminal and the rest would be read out again on every change.
  return (
    <section
      aria-label="Turn in progress"
      className="flex flex-col gap-3 rounded-card border border-accent/40 bg-surface p-4 shadow-1"
    >
      <div className="flex flex-wrap items-center gap-3">
        <span aria-hidden="true" className="size-2.5 animate-pulse rounded-full bg-accent" />
        <p role="status" className="flex-1 font-bold text-ink">
          {stage.label}
        </p>
        <span className="font-mono text-sm text-ink-2 tabular-nums">{formatElapsed(now - Date.parse(active.created_at))}</span>
        <Button size="sm" isDisabled={cancelling} isPending={cancelling} pendingLabel="Cancelling…" onPress={onCancel}>
          Cancel
        </Button>
      </div>
      <ol className="flex flex-wrap gap-x-5 gap-y-1 text-sm">
        {steps.map((s) => (
          <li key={s.label} className={`flex items-center gap-1.5 ${s.current ? "font-bold text-ink" : s.done ? "text-ink-2" : "text-ink-3"}`}>
            <span aria-hidden="true" className={`size-2 rounded-full ${s.current ? "bg-accent" : s.done ? "bg-ink-3" : "border border-ink-3"}`} />
            {s.label}
            {s.done && <span className="sr-only">, done</span>}
          </li>
        ))}
      </ol>
      {stage.taskId && (
        <>
          <AttachCommand taskId={stage.taskId} />
          <PanePanel taskId={stage.taskId} running refresh={active.dispatch_id} />
        </>
      )}
    </section>
  );
}
