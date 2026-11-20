import { useEffect, useState, type ReactNode } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { ApiError, type LoginSession } from "../lib/api";
import { isFramed, linkCode, parseLinkFragment } from "../lib/link";
import { useApiClient } from "../lib/useApiClient";
import { Button } from "../ui/Button";
import { BrandTile, Wordmark } from "../ui/Wordmark";

// /link (LOOM-273, TUI W1): approve a terminal's sign-in. `loomux login`
// opens /link#h=<token hash>&label=<host> and shows a code; this page shows
// the code it derives from the same hash, and Approve creates the
// terminal's session (POST /api/v1/sessions). See lib/link.ts and
// loomux/server docs/design/tui-client-design.md "The link flow".
//
// What keeps it safe:
// - Nothing is sent until Approve, and Approve sends only the hash whose
//   code is on screen: the link is read once, and a fragment that changes
//   afterwards is refused, not followed.
// - Approve arms only once the page has had the focus for a second, so a
//   click meant for another page (a double-click there that brings this
//   tab to the front) can't land on it unread.
// - The link is never logged, and leaves the address once it's used.
// - No code, no Approve: not in a frame (the server forbids framing too),
//   not without WebCrypto, not for a malformed link.
// - A replayed link is a 409 that changes nothing. A stale one (the
//   terminal stopped waiting) makes a session no one holds; Undo revokes it.

type Outcome =
  | { kind: "approved"; session: LoginSession }
  | { kind: "used" }
  | { kind: "declined" }
  | { kind: "undone" };

function Cmd({ children }: { children: ReactNode }) {
  return <code className="rounded bg-sunken px-1 font-mono text-[0.9em]">{children}</code>;
}

const LOGIN = <Cmd>loomux login</Cmd>;

function approveError(err: unknown): string {
  if (err instanceof ApiError) {
    // Usually this browser is signed out and the login brings it back
    // here; this shows only if a newer login (another tab) kept it in.
    if (err.status === 401) return "Your sign-in to Loomux had ended, so nothing was approved. Try again.";
    // A server from before LOOM-268 has no POST /sessions.
    if (err.status === 404 || err.status === 405) return "This Loomux server is too old to link a terminal. Update it, then try again.";
    return `Couldn't approve: ${err.message}`;
  }
  return "Couldn't reach Loomux. Check your connection and try again.";
}

function Shell({ children }: { children: ReactNode }) {
  return (
    <main className="flex min-h-svh items-center justify-center bg-ground px-4 py-10">
      <section aria-labelledby="link-title" className="flex w-full max-w-md flex-col gap-4 rounded-card border border-line bg-surface p-6 shadow-2">
        <div className="flex items-center gap-3">
          <BrandTile className="size-10" />
          <Wordmark height={30} />
        </div>
        <h1 id="link-title" className="text-xl font-bold text-ink">
          Sign in a terminal
        </h1>
        {children}
      </section>
    </main>
  );
}

function Note({ children }: { children: ReactNode }) {
  return <p className="text-ink-2">{children}</p>;
}

const ARM_DELAY_MS = 1000;

// useArmed: true once the window has had the focus for ARM_DELAY_MS since
// `active` became true; losing the focus disarms it until the next focus.
function useArmed(active: boolean): boolean {
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (!active) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const arm = () => {
      clearTimeout(timer);
      timer = setTimeout(() => setArmed(true), ARM_DELAY_MS);
    };
    const disarm = () => {
      clearTimeout(timer);
      setArmed(false);
    };
    if (document.hasFocus()) arm();
    window.addEventListener("focus", arm);
    window.addEventListener("blur", disarm);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("focus", arm);
      window.removeEventListener("blur", disarm);
    };
  }, [active]);
  return active && armed;
}

export function LinkPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const apiClient = useApiClient();
  // The link as this page first saw it. Everything shown and sent comes
  // from here, never from a later location.hash.
  const [seen] = useState(() => ({ hash: location.hash, link: parseLinkFragment(location.hash) }));
  const [framed] = useState(isFramed);
  const [code, setCode] = useState<string | null>(null);
  const [noCrypto, setNoCrypto] = useState(false);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [approving, setApproving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [undoing, setUndoing] = useState(false);
  const [undoError, setUndoError] = useState<string | null>(null);

  const link = seen.link;
  const tokenHash = link.kind === "ok" ? link.tokenHash : null;
  const armed = useArmed(code !== null && outcome === null);

  useEffect(() => {
    if (!tokenHash || framed) return;
    let live = true;
    linkCode(tokenHash).then(
      (c) => live && setCode(c),
      () => live && setNoCrypto(true),
    );
    return () => {
      live = false;
    };
  }, [tokenHash, framed]);

  function finish(o: Outcome) {
    setOutcome(o);
    // Used up: out of the address, so Back or a reload doesn't offer it
    // again.
    navigate({ pathname: location.pathname, search: location.search }, { replace: true });
  }

  async function approve() {
    if (link.kind !== "ok" || approving) return;
    setApproving(true);
    setError(null);
    try {
      const session = await apiClient.linkSession({ token_hash: link.tokenHash, label: link.label, client_kind: "tui" });
      finish({ kind: "approved", session });
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) finish({ kind: "used" });
      else setError(approveError(err));
    } finally {
      setApproving(false);
    }
  }

  async function undo(session: LoginSession) {
    setUndoing(true);
    setUndoError(null);
    try {
      await apiClient.deleteSession(session.id);
      setOutcome({ kind: "undone" });
    } catch (err) {
      // Gone already (revoked elsewhere, or expired): undone all the same.
      if (err instanceof ApiError && err.status === 404) setOutcome({ kind: "undone" });
      else setUndoError(err instanceof ApiError ? `Couldn't undo it: ${err.message}` : "Couldn't undo it: Loomux didn't answer. Try again.");
    } finally {
      setUndoing(false);
    }
  }

  const device = (label: string) =>
    label ? (
      <>
        {" on "}
        <bdi className="font-bold text-ink">{label}</bdi>
      </>
    ) : null;

  if (framed) {
    return (
      <Shell>
        <Note>This page can't approve anything inside another page. Open the link from your terminal in its own tab.</Note>
      </Shell>
    );
  }

  // The address should hold this page's link until it's decided, and
  // after that nothing (finish takes it out, a render or so later: the
  // router navigates in a transition) or the same link. Anything else is a
  // link this page didn't check: swapped in while it was open, or a new
  // one opened in this tab. It's shown only after a reload, never acted on
  // here.
  if (location.hash !== seen.hash && !(outcome && location.hash === "")) {
    return (
      <Shell>
        <Note>The link in the address changed while this page was open, so it can't be approved here. Reload the page to check the new link.</Note>
      </Shell>
    );
  }

  if (outcome) {
    switch (outcome.kind) {
      case "approved":
        return (
          <Shell>
            <p role="status" className="rounded-control bg-good-soft px-3 py-2 text-ink">
              Approved. The terminal{device(outcome.session.label ?? (link.kind === "ok" ? link.label : ""))} signs in within a few seconds. You can close
              this page.
            </p>
            <Note>
              Terminal still waiting? It stops after 10 minutes. If it stopped before you pressed Approve, undo this and run {LOGIN} again.
            </Note>
            {undoError && (
              <p role="alert" className="text-sm text-bad">
                {undoError}
              </p>
            )}
            <div>
              <Button variant="danger" isPending={undoing} pendingLabel="Undoing…" onPress={() => void undo(outcome.session)}>
                Undo approval
              </Button>
            </div>
          </Shell>
        );
      case "used":
        return (
          <Shell>
            <p role="status" className="text-ink">
              This link was used already: a terminal is signed in with it, and approving again changes nothing.
            </p>
            <Note>To sign in again, run {LOGIN} for a new link.</Note>
          </Shell>
        );
      case "declined":
        return (
          <Shell>
            <p role="status" className="text-ink">
              Not approved. Nothing was signed in, and you can close this page.
            </p>
          </Shell>
        );
      case "undone":
        return (
          <Shell>
            <p role="status" className="text-ink">
              Undone: that terminal is signed out. Run {LOGIN} to sign in again.
            </p>
          </Shell>
        );
    }
  }

  if (link.kind === "missing") {
    return (
      <Shell>
        <Note>
          This link has no terminal in it. Open the link your terminal printed when you ran {LOGIN}. If you had to sign in on the way here, that may
          have cut the link short: open it again.
        </Note>
      </Shell>
    );
  }

  if (link.kind === "invalid") {
    return (
      <Shell>
        <Note>This isn't a link Loomux made, so it can't be approved. Run {LOGIN} again and open the new link.</Note>
      </Shell>
    );
  }

  if (noCrypto) {
    return (
      <Shell>
        <Note>This browser can't check this link's code here, so it can't be approved. Open Loomux over HTTPS and try again.</Note>
      </Shell>
    );
  }

  if (!code) {
    return (
      <Shell>
        <p className="text-ink-3">Checking the link…</p>
      </Shell>
    );
  }

  return (
    <Shell>
      <p className="text-ink">A terminal{device(link.label)} wants to sign in to Loomux as you.</p>
      <div className="rounded-control bg-surface-2 px-4 py-3 text-center">
        <p className="text-sm text-ink-2">Its code</p>
        <p className="font-mono text-3xl font-medium tracking-widest text-ink select-all">{code}</p>
      </div>
      <p className="rounded-control bg-mari-soft px-3 py-2 font-bold text-mari-ink">Approve only if your terminal is showing this code right now.</p>
      <Note>
        If you didn't just run {LOGIN}, don't approve: whoever sent you this link would be signed in to your Loomux.
      </Note>
      {error && (
        <p role="alert" className="text-sm text-bad">
          {error}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <Button variant="primary" isDisabled={!armed} isPending={approving} pendingLabel="Approving…" onPress={() => void approve()}>
          Approve
        </Button>
        <Button variant="quiet" isDisabled={approving} onPress={() => finish({ kind: "declined" })}>
          Don't approve
        </Button>
      </div>
    </Shell>
  );
}
