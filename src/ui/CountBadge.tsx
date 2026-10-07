// The needs-you count: marigold, beside a nav item. Hidden at zero.
// Screen readers hear it as part of the item's name ("Inbox, 3 need you").
export function CountBadge({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <span className="inline-flex min-w-5 h-5 items-center justify-center rounded-full bg-mari px-1.5 text-xs font-extrabold text-mari-on tabular-nums">
      <span aria-hidden="true">{count > 99 ? "99+" : count}</span>
      <span className="sr-only">, {count} need you</span>
    </span>
  );
}
