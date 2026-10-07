import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { MessageContent } from "../components/MessageContent";
import { Composer } from "../conversation/Composer";
import { TaskList } from "../conversation/TaskList";
import { TurnCard } from "../conversation/TurnCard";
import { useConversation, type DisplayMessage } from "../conversation/useConversation";
import { DecisionCard } from "../inbox/DecisionCard";
import type { Confirmation } from "../lib/api";
import type { Decision, DecisionKind } from "../lib/needsYou";
import { offerAction, offerHeading } from "../lib/offerText";
import { formatRelativeTime } from "../lib/time";
import { useDocumentTitle } from "../lib/useDocumentTitle";
import { Button } from "../ui/Button";
import { Icon } from "../ui/icons";
import { Sheet } from "../ui/Sheet";
import { StatusShapeIcon } from "../ui/StatusMark";

// A conversation (build-plan §6 PR 4): the thread, with every decision
// answered in place where it arose (an offer under the reply that made it,
// a failure under the message that started it, an agent's prompt at the
// end), the turn in flight with its steps, attach command and terminal,
// and a composer you can keep writing in while a turn runs. On wide
// screens the conversation's tasks sit beside the thread; narrower, they
// open from the header. The behaviour lives in useConversation.

const RESOLVED: Record<Confirmation["status"], string> = {
  pending: "",
  approved: "Approved",
  denied: "Denied: nothing was run",
  expired: "Expired: nothing was run. Send the request again if you still want it.",
};

const TASK_DECISION: Record<string, DecisionKind> = {
  needs_attention: "prompt",
  awaiting_input: "awaiting",
  human_takeover: "takeover",
};

// An offer once it's answered or has expired: what it was and how it
// ended, under the same name as the card it replaces.
function ResolvedOffer({ c }: { c: Confirmation }) {
  const status = c.status;
  const action = offerAction(c);
  return (
    <section aria-label="Confirmation" className="flex flex-col gap-2 rounded-card border border-line bg-surface-2 p-4">
      <p className="font-bold text-ink-2">{offerHeading(c)}</p>
      {action && <code className="rounded-md bg-sunken px-2 py-1 font-mono text-sm break-all text-ink-2">{action}</code>}
      <p role="status" className="flex items-center gap-2 font-bold text-ink">
        <StatusShapeIcon shape={status === "approved" ? "check" : "cross"} tone={status === "approved" ? "good" : "muted"} />
        {RESOLVED[status]}
      </p>
    </section>
  );
}

function Bubble({ m }: { m: DisplayMessage }) {
  const mine = m.role === "user";
  return (
    <div className={`flex gap-2.5 ${mine ? "justify-end" : ""}`}>
      {!mine && (
        <span aria-hidden="true" className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-[9px] bg-ink text-surface">
          <Icon name="shuttle" className="size-5" />
        </span>
      )}
      <div
        className={`min-w-0 max-w-[min(42rem,85%)] rounded-card px-4 py-3 ${
          mine ? "bg-accent text-accent-ink" : "border border-line bg-surface text-ink"
        }`}
      >
        <span className="sr-only">{mine ? "You:" : "Loomux:"}</span>
        <MessageContent role={m.role} text={m.text} />
        {m.createdAt && (
          <time
            dateTime={new Date(m.createdAt).toISOString()}
            title={new Date(m.createdAt).toLocaleString()}
            className={`mt-1 block text-xs ${mine ? "text-right text-accent-ink/75" : "text-ink-3"}`}
          >
            {formatRelativeTime(m.createdAt)}
          </time>
        )}
      </div>
    </div>
  );
}

export function ConversationPage() {
  const { id } = useParams<{ id: string }>();
  const conversationId = id ?? null;
  const c = useConversation(conversationId);
  const [draft, setDraft] = useState("");
  const [queued, setQueued] = useState<string | null>(null);
  const [tasksOpen, setTasksOpen] = useState(false);

  const firstUser = c.messages.find((m) => m.role === "user")?.text;
  const title = firstUser ? firstUser.split("\n")[0] : "New conversation";
  useDocumentTitle(firstUser ? title.slice(0, 60) : "New conversation");

  const send = (text: string) => void c.send(text, { onAccepted: () => setDraft(""), onRejected: (t) => setDraft((d) => d || t) });

  // A message held while a turn ran goes once the turn ends. If the
  // server still refuses it (another turn started), it's back in the box.
  const { inFlight, sending, send: sendNow } = c;
  useEffect(() => {
    if (queued === null || inFlight || sending) return;
    void sendNow(queued, {
      onAccepted: () => setQueued(null),
      onRejected: (t) => setDraft((d) => d || t),
    });
  }, [queued, inFlight, sending, sendNow]);

  // Keep the end in view as the thread grows, unless the reader has
  // scrolled up to read something: then leave them where they are.
  const endRef = useRef<HTMLDivElement>(null);
  const stick = useRef(true);
  const lastKey = c.messages[c.messages.length - 1]?.key;
  useLayoutEffect(() => {
    if (stick.current) endRef.current?.scrollIntoView?.({ block: "end" });
  }, [lastKey, c.messages.length, c.inFlight, c.stage?.label]);

  const workspaceName = (wid: string | undefined) => (wid ? c.workspaceNameById.get(wid) : undefined);

  // The latest task's own decision (an agent's prompt, a wait for your
  // reply, a takeover), shown at the end until it's answered.
  const latest = c.latestTask;
  const endKind = latest ? TASK_DECISION[latest.status] : undefined;
  const endDecision: Decision | null =
    latest && endKind && c.pendingUser === null
      ? {
          key: `task:${latest.id}:${latest.status}`,
          kind: endKind,
          conversationId: conversationId!,
          since: latest.updated_at,
          workspaceId: latest.workspace_id,
          task: latest,
        }
      : null;

  const answerWith = ({ message, confirmationId }: { message: string; confirmationId?: string }) =>
    void c.send(message, { confirmationId });

  const tasks = c.history?.tasks ?? [];
  const loading = c.historyStatus === "pending";
  const loadFailed = c.historyStatus === "error" && !c.notFound;

  return (
    <div className="flex h-[calc(100svh-var(--shell-bottom,0px))] min-w-0">
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-start gap-3 border-b border-line bg-surface px-4 py-3 md:px-6">
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-lg font-extrabold text-ink">{title}</h1>
            <p className="flex flex-wrap items-center gap-x-3 text-sm text-ink-2">
              {c.latestWorkspaceName && <span>workspace: {c.latestWorkspaceName}</span>}
              {c.history && (
                <span className="inline-flex items-center gap-1.5">
                  <span aria-hidden="true" className={`size-2 rounded-full ${c.connected ? "bg-good" : "bg-ink-3"}`} />
                  {c.connected ? "Live" : "Reconnecting…"}
                </span>
              )}
            </p>
          </div>
          <Button size="sm" className="xl:hidden" onPress={() => setTasksOpen(true)}>
            Tasks ({tasks.length})
          </Button>
        </header>

        <div
          onScroll={(e) => {
            const el = e.currentTarget;
            stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
          }}
          className="flex-1 overflow-y-auto"
        >
          <div role="log" aria-label="Messages" className="mx-auto flex max-w-3xl flex-col gap-4 px-4 py-5 md:px-6">
            {loading && <p className="text-ink-3">Loading the conversation…</p>}
            {loadFailed && (
              <div role="alert" className="rounded-card border border-bad/40 bg-bad-soft p-4">
                <p className="font-bold text-bad">Couldn't load this conversation.</p>
                <p className="mt-1 text-sm text-ink-2">Check that Loomux is reachable, then try again.</p>
                <Button size="sm" className="mt-3" onPress={() => void c.refetchHistory()}>
                  Try again
                </Button>
              </div>
            )}
            {!loading && !loadFailed && c.messages.length === 0 && (
              <div className="py-10 text-center">
                <p className="text-lg font-bold text-ink">Start the conversation</p>
                <p className="mt-1 text-ink-2">Say what you want done and, if it matters, on which machine.</p>
              </div>
            )}

            {c.messages.map((m) => {
              // A pending offer is a decision card, which goes inert by itself
              // at expires_at; an answered one is a record of how it ended.
              const conf = m.confirmation;
              const open = conf?.status === "pending";
              return (
                <div key={m.key} className="flex flex-col gap-3">
                  <Bubble m={m} />
                  {conf && open && (
                    <DecisionCard
                      decision={{ key: `offer:${conf.id}`, kind: "offer", conversationId: conversationId!, since: conf.created_at, confirmation: conf }}
                      workspaceName={workspaceName}
                      answerWith={answerWith}
                      disabled={c.busy}
                      showSource={false}
                    />
                  )}
                  {conf && !open && <ResolvedOffer c={conf} />}
                  {m.failed && (
                    <DecisionCard
                      decision={{
                        key: `failed:${m.failed.dispatch_id}`,
                        kind: "failed",
                        conversationId: conversationId!,
                        since: m.failed.finished_at ?? m.failed.created_at,
                        dispatch: m.failed,
                        retryMessage: m.text,
                      }}
                      workspaceName={workspaceName}
                      answerWith={answerWith}
                      disabled={c.busy}
                      showSource={false}
                    />
                  )}
                </div>
              );
            })}

            {c.inFlight && c.active && c.stage && (
              <TurnCard active={c.active} stage={c.stage} onCancel={() => void c.cancelActive()} cancelling={c.cancelling} />
            )}

            {endDecision && (
              <DecisionCard decision={endDecision} workspaceName={workspaceName} answerWith={answerWith} disabled={c.sending} showSource={false} />
            )}

            {c.error && (
              <p role="alert" className="text-sm text-bad">
                {c.error}
              </p>
            )}
            <div ref={endRef} />
          </div>
        </div>

        <Composer
          draft={draft}
          onDraftChange={setDraft}
          sending={c.sending}
          inFlight={c.inFlight}
          queued={queued}
          onSend={send}
          onQueue={(text) => {
            setQueued(text);
            setDraft("");
          }}
          onUnqueue={() => {
            setDraft(queued ?? "");
            setQueued(null);
          }}
          autoFocusKey={`${conversationId}:${c.busy}`}
        />
      </div>

      <aside aria-label="Tasks in this conversation" className="hidden w-80 shrink-0 overflow-y-auto border-l border-line bg-surface px-4 py-4 xl:block">
        <h2 className="mb-1 text-lg font-extrabold text-ink">Tasks</h2>
        <TaskList tasks={tasks} workspaceName={(wid) => workspaceName(wid)} />
      </aside>

      <Sheet title="Tasks in this conversation" isOpen={tasksOpen} onOpenChange={setTasksOpen}>
        <div className="max-h-[70svh] overflow-y-auto px-5 pb-2">
          <TaskList tasks={tasks} workspaceName={(wid) => workspaceName(wid)} />
        </div>
      </Sheet>
    </div>
  );
}
