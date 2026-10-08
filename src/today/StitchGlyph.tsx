import type { StitchKind } from "../lib/weave";

// The marks the weave draws, as SVG children centred on (0, 0). Shared by
// the weave, the phone timeline and the legend so they always agree.
// Every kind differs in shape, not only colour.
export type GlyphKind = StitchKind | "knot";

export function StitchMark({ kind, size = 10 }: { kind: GlyphKind; size?: number }) {
  const r = size / 2;
  switch (kind) {
    case "knot":
      return <path d={`M0 ${-r * 1.3}L${r * 1.3} 0 0 ${r * 1.3}${-r * 1.3} 0Z`} fill="var(--mari)" stroke="var(--surface)" strokeWidth="1.5" />;
    case "offer":
      return <path d={`M0 ${-r}L${r} 0 0 ${r}${-r} 0Z`} fill="var(--surface)" stroke="var(--mari)" strokeWidth="2" />;
    case "answered":
      return <path d={`M0 ${-r}L${r} 0 0 ${r}${-r} 0Z`} fill="var(--ink-2)" />;
    case "failed":
      return (
        <path d={`M${-r} ${-r}L${r} ${r}M${r} ${-r}L${-r} ${r}`} stroke="var(--bad)" strokeWidth="2.4" strokeLinecap="round" fill="none" />
      );
    case "provision":
      return <rect x={-r * 0.8} y={-r * 0.8} width={r * 1.6} height={r * 1.6} rx="1.5" fill="var(--surface)" stroke="var(--ink-2)" strokeWidth="1.8" />;
    case "relay":
      return <circle r={r * 0.75} fill="var(--surface)" stroke="var(--accent)" strokeWidth="1.8" />;
    case "routed":
      return <circle r={r * 0.5} fill="var(--ink-3)" />;
    case "command":
      return <rect x={-r} y={-r * 0.45} width={size} height={r * 0.9} rx="2" fill="var(--ink-2)" />;
    case "agent":
      return <rect x={-r} y={-r * 0.45} width={size} height={r * 0.9} rx="2" fill="var(--accent)" />;
    case "working":
      return (
        <g>
          <rect x={-r} y={-r * 0.45} width={size} height={r * 0.9} rx="2" fill="var(--accent)" />
          <circle cx={r} r={r * 0.55} fill="var(--accent)" stroke="var(--surface)" strokeWidth="1.5" />
        </g>
      );
  }
}

export function StitchGlyph({ kind, className = "size-4" }: { kind: GlyphKind; className?: string }) {
  return (
    <svg viewBox="-8 -8 16 16" aria-hidden="true" focusable="false" className={`shrink-0 ${className}`}>
      <StitchMark kind={kind} size={10} />
    </svg>
  );
}
