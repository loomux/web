import { useLayoutEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import type { Weave } from "../lib/weave";
import { StitchMark } from "./StitchGlyph";

// Today, folded into a strip above the Inbox (principles.md "Decision"):
// one row per machine on desktop, the whole fleet in one row on a phone.
// Only what matters at a glance: where work ran, what's running now, and
// marigold knots for what waits on you. A knot jumps to its card; the
// strip's link opens Today.

const ROW_H = 18;

export function DayStrip({ weave, now, onKnot }: { weave: Weave; now: number; onKnot: (key: string) => void }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(600);
  useLayoutEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const measure = () => setWidth(Math.max(200, el.clientWidth));
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const narrow = width < 480;
  const machineOf = new Map(weave.lanes.map((l) => [l.id, l.machine || "Direct"] as const));
  const machines = narrow ? ["Fleet"] : [...new Set(weave.lanes.map((l) => l.machine || "Direct"))];
  const rowOf = (laneId: string) => (narrow ? 0 : machines.indexOf(machineOf.get(laneId) ?? "Direct"));
  const labelW = narrow ? 0 : 64;
  const span = Math.max(1, weave.end - weave.start);
  const x = (t: number) => labelW + ((Math.min(Math.max(t, weave.start), weave.end) - weave.start) / span) * (width - labelW - 8);
  const height = Math.max(1, machines.length) * ROW_H + 4;
  const spans = weave.threads.flatMap((t) => t.stitches.filter((s) => s.end - s.start > 0));
  const waiting = weave.knots.length;
  const working = weave.threads.filter((t) => t.stitches.some((s) => s.kind === "working")).length;

  return (
    <section aria-label="Today at a glance" className="rounded-card border border-line bg-surface px-4 py-3">
      <div className="mb-1.5 flex flex-wrap items-baseline justify-between gap-x-3 text-sm">
        <span className="font-extrabold text-ink">Today</span>
        <span className="flex-1 text-ink-2">
          {waiting} waiting, {working} working
        </span>
        <Link to="/today" className="min-h-9 content-center font-bold text-accent">
          Open Today
        </Link>
      </div>
      <div ref={wrapRef}>
        <svg width={width} height={height} className="block max-w-full" role="group" aria-label="Where work ran today, and what waits on you">
          {machines.map((m, i) => (
            <g key={m}>
              <rect x={labelW} y={i * ROW_H + 6} width={width - labelW - 8} height={6} rx="3" fill="var(--surface-2)" />
              {!narrow && (
                <text x={0} y={i * ROW_H + 13} fontSize="11" fontWeight="700" fill="var(--ink-3)">
                  {m.length > 9 ? `${m.slice(0, 8)}…` : m}
                </text>
              )}
            </g>
          ))}
          {spans.map((s) => (
            <rect
              key={s.id}
              x={x(s.start)}
              y={rowOf(s.laneId) * ROW_H + 6}
              width={Math.max(3, x(s.end) - x(s.start))}
              height={6}
              rx="3"
              fill={s.kind === "command" ? "var(--ink-3)" : "var(--accent)"}
            />
          ))}
          <line x1={x(now)} x2={x(now)} y1={0} y2={height} stroke="var(--ink-2)" strokeDasharray="2 3" />
          {weave.knots.map((k) => (
            <g
              key={k.key}
              role="button"
              tabIndex={0}
              aria-label={`${k.label}: show it`}
              transform={`translate(${x(k.since)},${rowOf(k.laneId) * ROW_H + 9})`}
              className="cursor-pointer outline-none focus-visible:[&>circle]:stroke-[var(--focus)]"
              onClick={() => onKnot(k.key)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onKnot(k.key);
                }
              }}
            >
              <circle r="11" fill="transparent" stroke="transparent" strokeWidth="2" />
              <StitchMark kind="knot" size={9} />
            </g>
          ))}
        </svg>
      </div>
    </section>
  );
}
