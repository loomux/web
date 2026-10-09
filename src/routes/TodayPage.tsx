import { useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useLocation, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { compareConversationSummaries, matchesStatusFilter, type FilterKey } from "../lib/conversations";
import { newId } from "../lib/id";
import { conversationStatus } from "../lib/status";
import { formatRelativeTime } from "../lib/time";
import { useApiClient } from "../lib/useApiClient";
import { useDayWeave } from "../lib/useDayWeave";
import { useDocumentTitle } from "../lib/useDocumentTitle";
import { DayTimeline } from "../today/DayTimeline";
import { Weave } from "../today/Weave";
import { Button } from "../ui/Button";
import { Icon } from "../ui/icons";
import { Segmented } from "../ui/Segmented";
import { StatusMark } from "../ui/StatusMark";

// Today (principles.md "Decision"): the read-back view. The chosen day's
// weave (desktop) or timeline (phone), then every conversation, searchable
// and filterable, with the filters in the URL. It replaces the old
// Conversations list; /conversations redirects here.

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: "all", label: "All" },
  { key: "needs-you", label: "Needs you" },
  { key: "running", label: "Working" },
  { key: "done", label: "Done" },
];

function parseDay(param: string | undefined): Date {
  const m = param?.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) {
    const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    if (!Number.isNaN(d.getTime())) return d;
  }
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

function dayParam(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function shiftDay(d: Date, days: number) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + days);
}

export function TodayPage() {
  const apiClient = useApiClient();
  const navigate = useNavigate();
  const location = useLocation();
  const { date } = useParams<{ date?: string }>();
  const [params, setParams] = useSearchParams();
  const day = useMemo(() => parseDay(date), [date]);
  const today = parseDay(undefined);
  const isToday = day.getTime() === today.getTime();
  const { weave, now, isLoading, error } = useDayWeave(day);

  const label = isToday
    ? "Today"
    : day.toLocaleDateString([], { weekday: "long", day: "numeric", month: "long" });
  useDocumentTitle(isToday ? "Today" : label);

  const q = params.get("q") ?? "";
  const rawStatus = params.get("status");
  const status: FilterKey = FILTERS.some((f) => f.key === rawStatus) ? (rawStatus as FilterKey) : "all";
  const setParam = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    setParams(next, { replace: true });
  };

  const { data: list, isLoading: listLoading } = useQuery({ queryKey: ["conversations"], queryFn: apiClient.listConversations });
  const { data: workspacesData } = useQuery({ queryKey: ["workspaces"], queryFn: apiClient.listWorkspaces });
  const workspaceName = useMemo(() => {
    const names = new Map((workspacesData?.workspaces ?? []).map((w) => [w.id, w.name] as const));
    return (id: string) => names.get(id);
  }, [workspacesData]);

  const conversations = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return [...(list?.conversations ?? [])]
      .filter((c) => matchesStatusFilter(c.status, status))
      .filter((c) => !needle || (c.preview ?? "").toLowerCase().includes(needle) || (workspaceName(c.workspace_id) ?? "").toLowerCase().includes(needle))
      .sort(compareConversationSummaries);
  }, [list, q, status, workspaceName]);

  // /today#all (where /conversations lands) starts at the list.
  useEffect(() => {
    if (location.hash === "#all") document.getElementById("all")?.scrollIntoView?.();
  }, [location.hash]);

  const waiting = weave?.knots.length ?? 0;
  const working = weave?.threads.filter((t) => t.stitches.some((s) => s.kind === "working")).length ?? 0;
  const touched = weave?.threads.length ?? 0;

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-5 md:px-8 md:py-8">
      <header className="flex flex-wrap items-center gap-x-5 gap-y-3">
        <h1 className="text-[1.75rem] font-extrabold text-ink">{label}</h1>
        <nav aria-label="Day" className="flex items-center gap-1 rounded-control border border-line bg-surface p-1">
          <Link
            to={`/today/${dayParam(shiftDay(day, -1))}`}
            className="flex min-h-9 items-center gap-1 rounded-[7px] px-3 text-sm font-bold text-ink-2 hover:bg-surface-2 hover:text-ink"
          >
            <span aria-hidden="true">‹</span> Previous day
          </Link>
          {!isToday && (
            <Link to="/today" className="flex min-h-9 items-center rounded-[7px] px-3 text-sm font-bold text-accent hover:bg-surface-2">
              Today
            </Link>
          )}
          {!isToday && (
            <Link
              to={shiftDay(day, 1).getTime() === today.getTime() ? "/today" : `/today/${dayParam(shiftDay(day, 1))}`}
              className="flex min-h-9 items-center gap-1 rounded-[7px] px-3 text-sm font-bold text-ink-2 hover:bg-surface-2 hover:text-ink"
            >
              Next day <span aria-hidden="true">›</span>
            </Link>
          )}
        </nav>
        <p className="basis-full text-ink-2 md:flex-1 md:basis-auto">
          {weave
            ? isToday
              ? `${waiting} waiting on you, ${working} working, ${touched} conversation${touched === 1 ? "" : "s"} today.`
              : `${touched} conversation${touched === 1 ? "" : "s"} that day.`
            : ""}
        </p>
        <Button variant="primary" onPress={() => navigate(`/conversations/${newId()}`)}>
          <Icon name="plus" />
          New conversation
        </Button>
      </header>

      <section aria-labelledby="weave-heading" className="mt-6 rounded-card border border-line bg-surface p-4 md:p-5">
        <h2 id="weave-heading" className="mb-3 font-extrabold text-ink">
          {isToday ? "The day so far" : "That day"}
        </h2>
        {isLoading && <p className="text-ink-3">Reading the day…</p>}
        {error ? (
          <p role="alert" className="text-bad">
            Couldn't read the day's work. Check that Loomux is reachable; this page retries on its own.
          </p>
        ) : null}
        {weave && (
          <>
            <div className="hidden md:block">
              <Weave weave={weave} isToday={isToday} now={now} />
            </div>
            <div className="md:hidden">
              <DayTimeline weave={weave} />
            </div>
            {weave.omitted > 0 && (
              <p className="mt-3 text-sm text-ink-3">
                {isToday
                  ? `${weave.omitted} more conversation${weave.omitted === 1 ? "" : "s"} today aren't drawn; they're in the list below.`
                  : `Showing the 60 most recently active conversations. ${weave.omitted} more aren't drawn, and some from that day may have moved on since; the list below has them all.`}
              </p>
            )}
          </>
        )}
      </section>

      <section id="all" aria-labelledby="all-heading" className="mt-8 scroll-mt-4">
        <h2 id="all-heading" className="text-lg font-extrabold text-ink">
          All conversations
        </h2>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <label htmlFor="conversation-search" className="sr-only">
            Search conversations
          </label>
          <input
            id="conversation-search"
            type="search"
            value={q}
            onChange={(e) => setParam("q", e.target.value)}
            placeholder="Search conversations"
            className="min-h-11 min-w-0 flex-1 basis-60 rounded-control border border-line-strong bg-surface px-3 text-ink placeholder:text-ink-3"
          />
          <Segmented label="Show" options={FILTERS} value={status} onChange={(k) => setParam("status", k === "all" ? "" : k)} />
        </div>
        {listLoading ? (
          <p className="mt-4 text-ink-3">Loading…</p>
        ) : conversations.length === 0 ? (
          <p className="mt-4 text-ink-2">
            {q || status !== "all" ? "No conversations match. Clear the search or pick All." : "No conversations yet. Start one with New conversation."}
          </p>
        ) : (
          <ul className="mt-3 divide-y divide-line overflow-hidden rounded-card border border-line bg-surface">
            {conversations.map((c) => (
              <li key={c.conversation_id}>
                <Link to={`/conversations/${c.conversation_id}`} className="flex flex-col gap-1 px-4 py-3 hover:bg-surface-2">
                  <span className="flex items-baseline justify-between gap-3">
                    <span className="line-clamp-2 font-bold text-ink">{c.preview || "Untitled conversation"}</span>
                    <span className="shrink-0 text-sm text-ink-3 tabular-nums">{formatRelativeTime(c.updated_at)}</span>
                  </span>
                  <span className="flex flex-wrap items-center gap-x-3 text-sm text-ink-3">
                    <StatusMark status={conversationStatus(c.status)} className="font-normal" />
                    {workspaceName(c.workspace_id) && <span>{workspaceName(c.workspace_id)}</span>}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
