import { MARK, WORDMARK, WORDMARK_SMALL } from "./brandPaths";

// The Loomux wordmark and mark (LOOM-176, docs/brand.md): the name as one
// kingfisher thread, the x crossed by the golden weft. Colours come from the
// tokens, so both follow the theme.

// Below 24 px tall the small cut is used: the tie between the o's fuses at
// that size, so it drops the tie and opens the gap.
export function Wordmark({ height }: { height: number }) {
  const spec = height < 24 ? WORDMARK_SMALL : WORDMARK;
  return (
    <svg
      viewBox={spec.viewBox}
      height={height}
      width={(height * spec.width) / spec.height}
      role="img"
      aria-label="Loomux"
      className="shrink-0"
    >
      <path d={spec.thread} fill="none" stroke="var(--accent)" strokeWidth={spec.stroke} strokeLinecap="round" strokeLinejoin="round" />
      <path d={spec.weft} fill="none" stroke="var(--mari-deep)" strokeWidth={spec.stroke} strokeLinecap="round" />
    </svg>
  );
}

// The lx monogram on its kingfisher-mist tile, as on the app icon.
export function BrandTile({ className = "size-8" }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" aria-hidden="true" focusable="false" className={`shrink-0 ${className}`}>
      <rect width="64" height="64" rx="14" fill="var(--accent-soft)" />
      <g transform="translate(9.6 9.6) scale(0.7)">
        <path d={MARK.thread} fill="none" stroke="var(--accent)" strokeWidth={MARK.strokeSmall} strokeLinecap="round" strokeLinejoin="round" />
        <path d={MARK.weft} fill="none" stroke="var(--mari-deep)" strokeWidth={MARK.strokeSmall} strokeLinecap="round" />
      </g>
    </svg>
  );
}
