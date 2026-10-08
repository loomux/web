import type { Stitch } from "../lib/weave";
import { StitchGlyph } from "../today/StitchGlyph";

// The steps of one turn (Weave's turn rail): routed, set up, the agent's
// turn and how long, an offer and its answer, a command, a failure. Laid
// out beside the message on wide screens; folded into "Turn steps" on a
// phone.
function Steps({ steps }: { steps: Stitch[] }) {
  return (
    <>
      {steps.map((s) => (
        <li key={s.id} className="flex items-center gap-1.5">
          <StitchGlyph kind={s.kind} className="size-3.5" />
          {s.label}
        </li>
      ))}
    </>
  );
}

export function TurnSteps({ steps }: { steps: Stitch[] }) {
  if (steps.length === 0) return null;
  return (
    <div className="pl-10 text-sm text-ink-3">
      <ol aria-label="Turn steps" className="hidden flex-wrap gap-x-4 gap-y-1 md:flex">
        <Steps steps={steps} />
      </ol>
      <details className="md:hidden">
        <summary className="min-h-9 cursor-pointer content-center font-bold">Turn steps ({steps.length})</summary>
        <ol className="mt-1 flex flex-col gap-1.5">
          <Steps steps={steps} />
        </ol>
      </details>
    </div>
  );
}
