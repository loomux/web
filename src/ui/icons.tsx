// The app's icons, from the merged mockup (24-unit grid, currentColor).
// Decorative: every use sits beside a visible label, so they're
// aria-hidden.
const PATHS = {
  inbox: (
    <path
      d="M3.5 13.5l2.6-7.2A2 2 0 0 1 8 5h8a2 2 0 0 1 1.9 1.3l2.6 7.2V18a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2z M3.5 13.5h5l1.2 2.5h4.6l1.2-2.5h5"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinejoin="round"
    />
  ),
  // Warp threads with a weft weaving across them: the Today weave.
  today: (
    <>
      <path d="M3.5 6h17M3.5 12h17M3.5 18h17" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" opacity="0.55" />
      <path d="M12 3c-4 1.5-4 4.5 0 6s4 4.5 0 6-4 4.5 0 6" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
    </>
  ),
  machines: (
    <>
      <rect x="3.5" y="4" width="17" height="7" rx="2" fill="none" stroke="currentColor" strokeWidth="2" />
      <rect x="3.5" y="13" width="17" height="7" rx="2" fill="none" stroke="currentColor" strokeWidth="2" />
      <circle cx="7.5" cy="7.5" r="1.2" fill="currentColor" />
      <circle cx="7.5" cy="16.5" r="1.2" fill="currentColor" />
    </>
  ),
  vault: (
    <>
      <circle cx="8" cy="15" r="4.5" fill="none" stroke="currentColor" strokeWidth="2" />
      <path d="M11.3 11.7L20 3m-3.5 3.5l2.5 2.5m-5-0.2l2 2" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </>
  ),
  settings: (
    <>
      <circle cx="12" cy="12" r="3.2" fill="none" stroke="currentColor" strokeWidth="2" />
      <path
        d="M12 2.8v3M12 18.2v3M2.8 12h3M18.2 12h3M5.5 5.5l2.1 2.1M16.4 16.4l2.1 2.1M5.5 18.5l2.1-2.1M16.4 7.6l2.1-2.1"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </>
  ),
  more: (
    <>
      <circle cx="5" cy="12" r="1.9" fill="currentColor" />
      <circle cx="12" cy="12" r="1.9" fill="currentColor" />
      <circle cx="19" cy="12" r="1.9" fill="currentColor" />
    </>
  ),
  logout: (
    <path
      d="M14 4h4a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-4M10 16l-4-4 4-4M6 12h10"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  ),
  plus: <path d="M12 5v14M5 12h14" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />,
  diamond: <path d="M12 2.5l9.5 9.5-9.5 9.5L2.5 12z" fill="currentColor" />,
  // The shuttle: Loomux's mark.
  shuttle: (
    <>
      <path d="M1.8 12c3.4-4.4 7-6.2 10.2-6.2S18.8 7.6 22.2 12c-3.4 4.4-7 6.2-10.2 6.2S5.2 16.4 1.8 12z" fill="currentColor" />
      <rect x="8.3" y="10.6" width="7.4" height="2.8" rx="1.4" fill="var(--surface)" />
    </>
  ),
} as const;

export type IconName = keyof typeof PATHS;

export function Icon({ name, className = "size-5" }: { name: IconName; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" className={`shrink-0 ${className}`}>
      {PATHS[name]}
    </svg>
  );
}
