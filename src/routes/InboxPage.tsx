import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { AnsweredCard, DecisionCard, type Answered } from "../inbox/DecisionCard";
import { newId } from "../lib/id";
import type { Decision } from "../lib/needsYou";
import { conversationStatus } from "../lib/status";
import { formatRelativeTime } from "../lib/time";
import { useApiClient } from "../lib/useApiClient";
import { useNeedsYou } from "../lib/useNeedsYou";
import { useDayWeave } from "../lib/useDayWeave";
import { DayStrip } from "../today/DayStrip";
import type { ConversationSummary } from "../lib/api";
import { Button } from "../ui/Button";
import { Icon } from "../ui/icons";
import { StatusMark } from "../ui/StatusMark";

// The Inbox, home on both devices (principles 1): every decision waiting on
// the user, answerable in place, then what's working and what just
// finished, under a strip of the day so far. Desktop puts the activity
// beside the queue; a phone stacks it under.

const DAY = 24 * 60 * 60 * 1000;

function ActivityRow({ c, workspace }: { c: ConversationSummary; workspace?: string }) {
  return (
    <li>
      <Link
        to={`/conversations/${c.conversation_id}`}
        className="flex flex-col gap-1 rounded-control px-3 py-2.5 hover:bg-surface-2"
      >
        <span className="line-clamp-2 font-bold text-ink">{c.preview || "Untitled conversation"}</span>
        <span className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-ink-3">
          <StatusMark status={conversationStatus(c.status)} className="!text-ink-3 font-normal" />
          {workspace && <span>{workspace}</span>}
          <span className="tabular-nums">{formatRelativeTime(c.updated_at)}</span>
        </span>
      </Link>
    </li>
  );
}

export function InboxPage() {
  const apiClient = useApiClient();
  const navigate = useNavigate();
  const needsYou = useNeedsYou();
  const [search] = useSearchParams();

  // The installed app's "New conversation" shortcut opens /?new=1.
  const wantsNew = search.get("new") === "1";
  useEffect(() => {
    if (wantsNew) navigate(`/conversations/${newId()}`, { replace: true, state: { fresh: true } });
  }, [wantsNew, navigate]);
  const [answered, setAnswered] = useState<{ decision: Decision; outcome: Answered }[]>([]);
  const [showSnoozed, setShowSnoozed] = useState(false);
  const [olderOpen, setOlderOpen] = useState(false);
  const [today] = useState(() => new Date());
  const day = useDayWeave(today);

  // A knot in the day strip jumps to its card (opening the older fold if
  // that's where it is).
  function showDecision(key: string) {
    if (needsYou.older.some((d) => d.key === key)) setOlderOpen(true);
    requestAnimationFrame(() => {
      const el = document.getElementById(`decision-${key}`);
      el?.scrollIntoView?.({ block: "center" });
      el?.focus({ preventScroll: true });
    });
  }

  const { data: list, dataUpdatedAt, isError: listFailed } = useQuery({ queryKey: ["conversations"], queryFn: apiClient.listConversations });
  const { data: workspacesData } = useQuery({ queryKey: ["workspaces"], queryFn: apiClient.listWorkspaces });
  const workspaceName = useMemo(() => {
    const names = new Map((workspacesData?.workspaces ?? []).map((w) => [w.id, w.name] as const));
    return (id: string | undefined) => (id ? names.get(id) : undefined);
  }, [workspacesData]);

  const { working, done } = useMemo(() => {
    const all = [...(list?.conversations ?? [])].sort((a, b) => Date.parse(b.updated_at) - Date.parse(a.updated_at));
    // "Today" relative to when the list was read, not to each render.
    const now = dataUpdatedAt;
    return {
      working: all.filter((c) => c.status === "running"),
      done: all
        .filter((c) => (c.status === "completed" || c.status === "failed") && now - Date.parse(c.updated_at) < DAY)
        .slice(0, 6),
    };
  }, [list, dataUpdatedAt]);

  // A card that was answered stays as a short "what happened" until the
  // user dismisses it, even after the decision itself is gone.
  const answeredKeys = new Set(answered.map((a) => a.decision.key));
  const current = needsYou.current.filter((d) => !answeredKeys.has(d.key));
  const onAnswered = (decision: Decision, outcome: Answered) =>
    setAnswered((prev) => [...prev.filter((a) => a.decision.key !== decision.key), { decision, outcome }]);
  const dismiss = (key: string) => setAnswered((prev) => prev.filter((a) => a.decision.key !== key));
  const snoozeOne = (d: Decision) => needsYou.snooze(d.key, new Date(Date.now() + DAY));

  const count = needsYou.count;
  const summary =
    needsYou.isLoading ? "Checking what needs you…" : count === 0 ? "Nothing needs you right now." : count === 1 ? "1 thing needs you." : `${count} things need you.`;

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-5 md:px-8 md:py-8">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-[1.75rem] font-extrabold text-ink">Inbox</h1>
          <p className="text-ink-2" aria-live="polite">
            {summary}
          </p>
        </div>
        <Button variant="primary" onPress={() => navigate(`/conversations/${newId()}`, { state: { fresh: true } })}>
          <Icon name="plus" />
          New conversation
        </Button>
      </header>

      {day.weave && (day.weave.lanes.length > 0 || day.weave.knots.length > 0) && (
        <div className="mt-5">
          <DayStrip weave={day.weave} now={day.now} onKnot={showDecision} />
        </div>
      )}

      <div className="mt-6 grid gap-8 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <section aria-labelledby="needs-you" className="flex min-w-0 flex-col gap-4">
          <h2 id="needs-you" className="flex items-center gap-2 text-lg font-extrabold text-ink">
            Needs you <span className="font-bold text-ink-3 tabular-nums">{count}</span>
          </h2>

          {needsYou.error ? (
            <p role="alert" className="rounded-card border border-bad/40 bg-bad-soft p-4 text-bad">
              Couldn't load your conversations. Check that Loomux is reachable; this page retries on its own.
            </p>
          ) : null}

          {answered.map((a) => (
            <AnsweredCard key={a.decision.key} decision={a.decision} outcome={a.outcome} onDismiss={() => dismiss(a.decision.key)} />
          ))}
          {current.map((d) => (
            <DecisionCard key={d.key} decision={d} workspaceName={workspaceName} onAnswered={onAnswered} onSnooze={snoozeOne} />
          ))}

          {!needsYou.isLoading && !needsYou.error && current.length === 0 && answered.length === 0 && (
            <div className="rounded-card border border-dashed border-line px-5 py-8 text-center">
              <p className="font-bold text-ink">You're all caught up.</p>
              <p className="mt-1 text-ink-2">Offers, agent questions and failed turns show up here as they happen.</p>
            </div>
          )}

          {needsYou.older.length > 0 && (
            <details
              open={olderOpen}
              onToggle={(e) => setOlderOpen(e.currentTarget.open)}
              className="group rounded-card border border-line bg-surface-2"
            >
              <summary className="flex min-h-12 cursor-pointer items-center gap-2 px-4 font-bold text-ink">
                <Icon name="diamond" className="size-3.5 text-mari" />
                Older, still waiting ({needsYou.older.length})
              </summary>
              <div className="flex flex-col gap-4 p-4 pt-0">
                {needsYou.older.map((d) => (
                  <DecisionCard key={d.key} decision={d} workspaceName={workspaceName} onAnswered={onAnswered} onSnooze={snoozeOne} />
                ))}
              </div>
            </details>
          )}

          {needsYou.snoozed.length > 0 && (
            <div className="text-sm text-ink-2">
              <button type="button" className="min-h-9 font-bold hover:text-ink" onClick={() => setShowSnoozed((v) => !v)} aria-expanded={showSnoozed}>
                {needsYou.snoozed.length} snoozed {showSnoozed ? "(hide)" : "(show)"}
              </button>
              {showSnoozed && (
                <ul className="mt-2 flex flex-col gap-1">
                  {needsYou.snoozed.map((d) => (
                    <li key={d.key} className="flex flex-wrap items-center gap-x-3">
                      <Link to={`/conversations/${d.conversationId}`} className="font-bold text-accent">
                        {d.preview || "A conversation"}
                      </Link>
                      <button type="button" className="min-h-9 font-bold hover:text-ink" onClick={() => needsYou.unsnooze(d.key)}>
                        Unsnooze
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </section>

        <aside className="flex min-w-0 flex-col gap-6" aria-label="Activity">
          <section aria-labelledby="working">
            <h2 id="working" className="mb-2 text-lg font-extrabold text-ink">
              Working
            </h2>
            {listFailed && !list ? (
              <p className="text-ink-3">Couldn't load this.</p>
            ) : working.length === 0 ? (
              <p className="text-ink-3">Nothing is running.</p>
            ) : (
              <ul className="-mx-3 flex flex-col">
                {working.map((c) => (
                  <ActivityRow key={c.conversation_id} c={c} workspace={workspaceName(c.workspace_id)} />
                ))}
              </ul>
            )}
          </section>
          <section aria-labelledby="done">
            <h2 id="done" className="mb-2 text-lg font-extrabold text-ink">
              Done today
            </h2>
            {listFailed && !list ? (
              <p className="text-ink-3">Couldn't load this.</p>
            ) : done.length === 0 ? (
              <p className="text-ink-3">Nothing finished in the last day.</p>
            ) : (
              <ul className="-mx-3 flex flex-col">
                {done.map((c) => (
                  <ActivityRow key={c.conversation_id} c={c} workspace={workspaceName(c.workspace_id)} />
                ))}
              </ul>
            )}
            <Link to="/today" className="mt-2 inline-flex min-h-9 items-center px-0 text-sm font-bold text-accent">
              All conversations
            </Link>
          </section>
        </aside>
      </div>
    </div>
  );
}
