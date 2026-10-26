import type { PlanRow } from "../lib/offerText";

// A machine offer's plan (LOOM-247), part by part: what a yes would
// create, in the chat's own words. Shared by the open offer's card and
// the answered one.
export function MachinePlan({ rows }: { rows: PlanRow[] }) {
  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 rounded-control bg-sunken px-3.5 py-3 text-sm">
      {rows.map((r) => (
        <div key={r.label} className="contents">
          <dt className="font-bold text-ink-2">{r.label}</dt>
          <dd className="min-w-0 break-words text-ink">{r.value}</dd>
        </div>
      ))}
    </dl>
  );
}
