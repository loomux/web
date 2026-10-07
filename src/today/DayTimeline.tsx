import { Link } from "react-router-dom";
import type { GlyphKind } from "./StitchGlyph";
import type { Lane, Stitch, Weave } from "../lib/weave";
import { StitchGlyph } from "./StitchGlyph";

// The weave on a phone (principles.md "Decision"): the same day as a
// vertical, newest-first timeline. What's waiting on you comes first;
// then each turn as one row, its most telling step as the summary and its
// workspace as a chip. The full weave is never scrolled sideways here.

function clock(t: number) {
  return new Date(t).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

// The step that says most about a turn.
const WEIGHT: Record<Stitch["kind"], number> = {
  failed: 7,
  working: 6,
  offer: 5,
  answered: 4,
  agent: 3,
  command: 3,
  provision: 2,
  relay: 2,
  routed: 1,
};

interface Row {
  key: string;
  at: number;
  kind: GlyphKind;
  title: string;
  summary: string;
  lane?: Lane;
  href: string;
  knot?: boolean;
}

export function DayTimeline({ weave }: { weave: Weave }) {
  const laneById = new Map(weave.lanes.map((l) => [l.id, l] as const));
  const titleOf = new Map(weave.threads.map((t) => [t.conversationId, t.title] as const));

  const turns: Row[] = weave.threads.flatMap((t) => {
    const groups = new Map<string, Stitch[]>();
    for (const s of t.stitches) {
      const g = s.dispatchId ?? s.id;
      groups.set(g, [...(groups.get(g) ?? []), s]);
    }
    return [...groups.entries()].map(([g, stitches]) => {
      const lead = stitches.reduce((a, b) => (WEIGHT[b.kind] >= WEIGHT[a.kind] ? b : a));
      return {
        key: `${t.conversationId}:${g}`,
        at: Math.max(...stitches.map((s) => s.end)),
        kind: lead.kind,
        title: t.title,
        summary: lead.label,
        lane: laneById.get(lead.laneId),
        href: `/conversations/${t.conversationId}${lead.dispatchId ? `?turn=${lead.dispatchId}` : ""}`,
      };
    });
  });
  const knots: Row[] = weave.knots.map((k) => ({
    key: `knot:${k.key}`,
    at: k.since,
    kind: "knot",
    title: titleOf.get(k.conversationId) ?? "A conversation",
    summary: k.label,
    lane: laneById.get(k.laneId),
    href: `/conversations/${k.conversationId}`,
    knot: true,
  }));
  const rows = [...knots.sort((a, b) => b.at - a.at), ...turns.sort((a, b) => b.at - a.at)];

  if (rows.length === 0) return <p className="py-4 text-ink-2">Nothing ran on this day.</p>;
  return (
    <ol className="relative flex flex-col gap-3 before:absolute before:top-2 before:bottom-2 before:left-[4.85rem] before:w-px before:bg-line">
      {rows.map((r) => (
        <li key={r.key} className="relative grid grid-cols-[4rem_1.25rem_minmax(0,1fr)] items-start gap-x-2">
          <span className="pt-3 text-right text-xs whitespace-nowrap text-ink-3 tabular-nums">{clock(r.at)}</span>
          <span className="z-10 mt-3.5 grid place-items-center rounded-full bg-ground py-0.5">
            <StitchGlyph kind={r.kind} />
          </span>
          <Link
            to={r.href}
            className={`flex min-w-0 flex-col gap-1 rounded-card border px-3.5 py-2.5 ${
              r.knot ? "border-mari bg-mari-soft" : "border-line bg-surface hover:bg-surface-2"
            }`}
          >
            <span className="font-bold text-ink">{r.title}</span>
            <span className={`text-sm ${r.knot ? "font-bold text-mari-ink" : "text-ink-2"}`}>{r.summary}</span>
            {r.lane && r.lane.machine && (
              <span className="text-xs text-ink-3">
                {r.lane.label} on {r.lane.machine}
              </span>
            )}
          </Link>
        </li>
      ))}
    </ol>
  );
}
