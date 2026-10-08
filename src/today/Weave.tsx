import { useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { useNavigate } from "react-router-dom";
import { scaleTime } from "d3-scale";
import { timeHour } from "d3-time";
import type { Lane, Stitch, Weave as WeaveModel } from "../lib/weave";
import { LEGEND } from "./legend";
import { StitchGlyph, StitchMark } from "./StitchGlyph";

// The day as a weave (desktop): a lane per workspace under its machine,
// on a real time axis; a thread per conversation crossing the lanes it
// moved through; a stitch per step and a marigold knot per thing waiting
// on you, with a dashed tail for how long. Every stitch and knot is a
// link to that point in its conversation: hover or focus says what it
// was, Enter opens it, Left and Right move along the lane.

const LABEL_W = 196;
const AXIS_H = 30;
const LANE_H = 38;
const PAD_R = 18;

function clock(t: number) {
  return new Date(t).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

interface Item {
  key: string;
  laneId: string;
  x: number;
  x2: number;
  y: number;
  href: string;
  label: string;
  stitch?: Stitch;
  knot?: boolean;
}

export function Weave({ weave, isToday, now }: { weave: WeaveModel; isToday: boolean; now: number }) {
  const navigate = useNavigate();
  const wrapRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(960);
  const [tip, setTip] = useState<{ x: number; y: number; text: string } | null>(null);
  const itemRefs = useRef(new Map<string, SVGGElement>());

  useLayoutEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const measure = () => setWidth(Math.max(560, el.clientWidth));
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const x = useMemo(() => scaleTime().domain([weave.start, weave.end]).range([LABEL_W, width - PAD_R]), [weave.start, weave.end, width]);
  const laneIndex = useMemo(() => new Map(weave.lanes.map((l, i) => [l.id, i] as const)), [weave.lanes]);
  const laneY = (id: string) => AXIS_H + (laneIndex.get(id) ?? 0) * LANE_H + LANE_H / 2;
  const laneName = (id: string) => weave.lanes.find((l) => l.id === id);
  const height = AXIS_H + weave.lanes.length * LANE_H + 6;

  const hours = width > 820 ? 1 : 2;
  const ticks = x.ticks(timeHour.every(hours)!);

  const titleOf = new Map(weave.threads.map((t) => [t.conversationId, t.title] as const));
  const where = (lane?: Lane) => (lane ? (lane.machine ? `${lane.label} on ${lane.machine}` : lane.label) : "");

  const items: Item[] = [
    ...weave.threads.flatMap((t) =>
      t.stitches.map((s) => ({
        key: s.id,
        laneId: s.laneId,
        x: x(s.start),
        x2: x(s.end),
        y: laneY(s.laneId),
        href: `/conversations/${s.conversationId}${s.dispatchId ? `?turn=${s.dispatchId}` : ""}`,
        label: `${clock(s.start)} ${s.label}, ${where(laneName(s.laneId))}. ${t.title}`,
        stitch: s,
      })),
    ),
    ...weave.knots.map((k) => ({
      key: `knot:${k.key}`,
      laneId: k.laneId,
      x: x(k.since),
      x2: x(k.since),
      y: laneY(k.laneId),
      href: `/conversations/${k.conversationId}`,
      label: `${clock(k.since)} ${k.label}, ${where(laneName(k.laneId))}. ${titleOf.get(k.conversationId) ?? ""}`.trim(),
      knot: true,
    })),
  ];

  const byLane = new Map<string, Item[]>();
  for (const it of items) byLane.set(it.laneId, [...(byLane.get(it.laneId) ?? []), it]);
  byLane.forEach((list) => list.sort((a, b) => a.x - b.x));

  function onKey(e: KeyboardEvent, it: Item) {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      navigate(it.href);
      return;
    }
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    e.preventDefault();
    const lane = byLane.get(it.laneId)!;
    const i = lane.indexOf(it) + (e.key === "ArrowRight" ? 1 : -1);
    const next = lane[Math.max(0, Math.min(lane.length - 1, i))];
    itemRefs.current.get(next.key)?.focus();
  }

  const show = (it: Item) => setTip({ x: (it.x + it.x2) / 2, y: it.y, text: it.label });

  if (weave.lanes.length === 0) {
    return <p className="py-6 text-ink-2">Nothing ran on this day.</p>;
  }

  return (
    <div ref={wrapRef} className="relative">
      <svg width={width} height={height} role="group" aria-label="The day's work, by workspace and time" className="block max-w-full">
        {weave.lanes.map((lane, i) => (
          <rect key={lane.id} x={LABEL_W - 6} y={AXIS_H + i * LANE_H + 4} width={width - LABEL_W - PAD_R + 12} height={LANE_H - 8} rx="6" fill="var(--surface-2)" />
        ))}
        {ticks.map((t) => (
          <g key={t.getTime()} transform={`translate(${x(t)},0)`}>
            <line y1={AXIS_H - 6} y2={height} stroke="var(--line)" strokeWidth="1" />
            <text
              y={AXIS_H - 12}
              textAnchor={x(t) > width - PAD_R - 30 ? "end" : x(t) < LABEL_W + 30 ? "start" : "middle"}
              fontSize="12"
              fill="var(--ink-3)"
              className="tabular-nums"
            >
              {clock(t.getTime())}
            </text>
          </g>
        ))}
        {weave.lanes.map((lane, i) => {
          const y = AXIS_H + i * LANE_H + LANE_H / 2 + 4;
          const firstOfMachine = i === 0 || weave.lanes[i - 1].machine !== lane.machine;
          return (
            <g key={lane.id}>
              {firstOfMachine && lane.machine && (
                <text x={4} y={y} fontSize="13" fontWeight="800" fill="var(--ink)">
                  {lane.machine}
                </text>
              )}
              <text x={lane.machine ? 82 : 4} y={y} fontSize="13" fill="var(--ink-2)">
                {lane.label.length > (lane.machine ? 14 : 22) ? `${lane.label.slice(0, lane.machine ? 13 : 21)}…` : lane.label}
              </text>
            </g>
          );
        })}

        {/* Threads: each conversation's path through its stitches. */}
        {weave.threads.map((t) => {
          const pts = t.stitches.map((s) => ({ a: x(s.start), b: x(s.end), y: laneY(s.laneId) }));
          let d = "";
          pts.forEach((p, i) => {
            if (i === 0) d += `M${p.a} ${p.y}`;
            else {
              const prev = pts[i - 1];
              const mid = (prev.b + p.a) / 2;
              d += ` L${prev.b} ${prev.y} C${mid} ${prev.y} ${mid} ${p.y} ${p.a} ${p.y}`;
            }
            d += ` L${p.b} ${p.y}`;
          });
          return <path key={t.conversationId} d={d} fill="none" stroke="var(--ink-3)" strokeOpacity="0.5" strokeWidth="1.5" />;
        })}

        {/* How long each knot has waited. */}
        {weave.knots.map((k) => (
          <line
            key={k.key}
            x1={x(k.since)}
            x2={x(Math.max(k.since, isToday ? now : weave.end))}
            y1={laneY(k.laneId)}
            y2={laneY(k.laneId)}
            stroke="var(--mari)"
            strokeWidth="2"
            strokeDasharray="4 4"
          />
        ))}

        {isToday && (
          <g transform={`translate(${x(Math.min(now, weave.end))},0)`}>
            <line y1={AXIS_H - 4} y2={height} stroke="var(--ink)" strokeDasharray="3 3" strokeWidth="1.2" />
            <text y={10} textAnchor="end" fontSize="11" fontWeight="800" fill="var(--ink)">
              now {clock(now)}
            </text>
          </g>
        )}

        {items.map((it) => {
          const span = it.stitch && it.x2 - it.x > 3;
          return (
            <g
              key={it.key}
              ref={(el) => {
                if (el) itemRefs.current.set(it.key, el);
                else itemRefs.current.delete(it.key);
              }}
              role="link"
              tabIndex={0}
              aria-label={it.label}
              className="cursor-pointer outline-none focus-visible:[&>.hit]:stroke-[var(--focus)]"
              onClick={() => navigate(it.href)}
              onKeyDown={(e) => onKey(e, it)}
              onMouseEnter={() => show(it)}
              onFocus={() => show(it)}
              onMouseLeave={() => setTip(null)}
              onBlur={() => setTip(null)}
            >
              <rect
                className="hit"
                x={Math.min(it.x, it.x2) - 9}
                y={it.y - 12}
                width={Math.abs(it.x2 - it.x) + 18}
                height={24}
                rx="6"
                fill="transparent"
                stroke="transparent"
                strokeWidth="2"
              />
              {span ? (
                <rect
                  x={it.x}
                  y={it.y - 4}
                  width={it.x2 - it.x}
                  height={8}
                  rx="3"
                  fill={it.stitch!.kind === "command" ? "var(--ink-2)" : "var(--accent)"}
                />
              ) : null}
              <g transform={`translate(${span ? it.x2 : it.x},${it.y})`}>
                {it.knot ? <StitchMark kind="knot" size={12} /> : span && it.stitch!.kind !== "working" ? null : <StitchMark kind={it.stitch!.kind} size={11} />}
              </g>
            </g>
          );
        })}
      </svg>
      {tip && (
        <div
          role="tooltip"
          className="pointer-events-none absolute z-10 max-w-xs -translate-x-1/2 rounded-control bg-ink px-3 py-2 text-sm text-surface shadow-2"
          style={{ left: Math.min(Math.max(tip.x, 120), width - 120), top: tip.y + 16 }}
        >
          {tip.text}
        </div>
      )}
      <ul className="mt-3 flex flex-wrap gap-x-5 gap-y-1.5 text-sm text-ink-2" aria-label="Legend">
        {LEGEND.map((l) => (
          <li key={l.kind} className="flex items-center gap-1.5">
            <StitchGlyph kind={l.kind} />
            {l.label}
          </li>
        ))}
      </ul>
    </div>
  );
}
