import { Link } from "react-router-dom";

export function NotFoundPage() {
  return (
    <div className="mx-auto max-w-xl px-4 py-16 md:px-8">
      <h1 className="text-2xl font-extrabold text-ink">There's nothing at this address</h1>
      <p className="mt-2 text-ink-2">The link may be old, or the page may have moved.</p>
      <Link
        to="/"
        className="mt-6 inline-flex min-h-11 items-center rounded-control bg-accent px-4 font-bold text-accent-ink hover:bg-accent-hover"
      >
        Go to the Inbox
      </Link>
    </div>
  );
}
