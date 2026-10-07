import type { StatusInfo, StatusShape, StatusTone } from "../lib/status";

// A status as a shape plus its label (principles 7): never colour alone.
const TONE: Record<StatusTone, string> = {
  mari: "text-mari",
  accent: "text-accent",
  good: "text-good",
  bad: "text-bad",
  muted: "text-ink-3",
};

const SHAPE: Record<StatusShape, React.ReactNode> = {
  diamond: <path d="M12 2.5l9.5 9.5-9.5 9.5L2.5 12z" fill="currentColor" />,
  "diamond-open": <path d="M12 3.8l8.2 8.2-8.2 8.2L3.8 12z" fill="none" stroke="currentColor" strokeWidth="2.6" />,
  dot: <circle cx="12" cy="12" r="6.5" fill="currentColor" />,
  ring: <circle cx="12" cy="12" r="6.5" fill="none" stroke="currentColor" strokeWidth="2.6" />,
  check: (
    <path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" />
  ),
  cross: <path d="M6.5 6.5l11 11M17.5 6.5l-11 11" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" />,
  square: <rect x="5" y="5" width="14" height="14" rx="3" fill="none" stroke="currentColor" strokeWidth="2.6" />,
  triangle: <path d="M12 3l10 17.5H2z" fill="currentColor" />,
};

// Without a tone it takes the surrounding text colour.
export function StatusShapeIcon({ shape, tone, className = "size-3.5" }: { shape: StatusShape; tone?: StatusTone; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" className={`shrink-0 ${tone ? TONE[tone] : ""} ${className}`}>
      {SHAPE[shape]}
    </svg>
  );
}

export function StatusMark({ status, className = "" }: { status: StatusInfo; className?: string }) {
  return (
    <span className={`inline-flex items-center gap-1.5 text-sm font-bold text-ink-2 ${className}`}>
      <StatusShapeIcon shape={status.shape} tone={status.tone} />
      {status.label}
    </span>
  );
}
