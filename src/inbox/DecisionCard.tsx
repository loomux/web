import { useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { describeDispatchError } from "../lib/dispatchTurn";
import type { Decision } from "../lib/needsYou";
import { offerAction, offerHeading, offerWorkspace } from "../lib/offerText";
import { answerErrorText, useAnswer, type Answer } from "../lib/useAnswer";
import { formatRelativeTime } from "../lib/time";
import { Button } from "../ui/Button";
import { StatusShapeIcon } from "../ui/StatusMark";

// One answer pattern for everything that waits on the user (principles 2):
// an offer, an agent's prompt, a conversation waiting for a reply or taken
// over, a failed turn. Same anatomy each time: who is asking and how long
// ago, the exact thing that would happen, then the answers. Approve is
// never the default focus and nothing here submits on Enter except the
// free-text reply. Every answer is the conversation's next chat message
// (useAnswer).

const KIND_LABEL: Record<Decision["kind"], string> = {
  offer: "Wants approval",
  prompt: "Asking you",
  awaiting: "Waiting for your reply",
  takeover: "You're driving",
  failed: "Failed",
};

function useClock(active: boolean) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [active]);
  return now;
}

function countdown(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

function CodeBlock({ children }: { children: string }) {
  return (
    <pre className="overflow-x-auto rounded-control bg-pane px-3.5 py-3 font-mono text-sm leading-relaxed text-pane-ink whitespace-pre-wrap break-words">
      {children}
    </pre>
  );
}

export interface Answered {
  label: string;
}

export function DecisionCard({
  decision: d,
  workspaceName,
  onAnswered,
  onSnooze,
  answerWith,
  disabled = false,
  showSource = true,
}: {
  decision: Decision;
  workspaceName: (id: string | undefined) => string | undefined;
  onAnswered?: (d: Decision, outcome: Answered) => void;
  onSnooze?: (d: Decision) => void;
  // Inside a conversation the page sends answers itself, so it can follow
  // the turn they start; elsewhere the card sends them (useAnswer).
  answerWith?: (a: Answer) => void;
  // A turn is in flight where this card lives: answers would be refused.
  disabled?: boolean;
  // "From <conversation>" and the Open conversation link, which a card
  // already inside that conversation leaves out.
  showSource?: boolean;
}) {
  const answer = useAnswer();
  const [reply, setReply] = useState("");
  const now = useClock(d.kind === "offer");

  const agent = d.task?.agent_type || "The agent";
  const workspace = (d.confirmation && offerWorkspace(d.confirmation)) || workspaceName(d.workspaceId);
  const conversationLink = (
    <Link to={`/conversations/${d.conversationId}`} className="font-bold text-accent underline underline-offset-2">
      {d.preview || "the conversation"}
    </Link>
  );

  function send(message: string, outcome: string, extra: Partial<Answer> = {}) {
    const a = { conversationId: d.conversationId, message, workspaceHint: d.workspaceHint, ...extra };
    if (answerWith) {
      answerWith(a);
      return;
    }
    answer.mutate(a, { onSuccess: () => onAnswered?.(d, { label: outcome }) });
  }

  function submitReply(e: FormEvent) {
    e.preventDefault();
    const text = reply.trim();
    if (!text || answer.isPending) return;
    send(text, "Reply sent.");
  }

  const expiresIn = d.confirmation ? Date.parse(d.confirmation.expires_at) - now : 0;
  const expired = d.kind === "offer" && expiresIn <= 0;
  const failure = d.kind === "failed" ? describeDispatchError(d.dispatch?.error_class, d.dispatch?.error) : null;

  let heading: string;
  if (d.kind === "offer") heading = offerHeading(d.confirmation!);
  else if (d.kind === "prompt" && d.task?.attention?.kind === "permission") heading = `${agent} needs your approval`;
  else if (d.kind === "prompt" && d.task?.attention?.kind === "trust") heading = `${agent} asks whether to trust this folder`;
  else if (d.kind === "prompt" && d.task?.attention) heading = `${agent} is asking you something`;
  else if (d.kind === "prompt") heading = `${agent} stopped at a prompt`;
  else if (d.kind === "awaiting") heading = `${agent} is waiting for your reply`;
  else if (d.kind === "takeover") heading = "Someone has taken over this session";
  else heading = failure!.message;

  const isFailed = d.kind === "failed";
  const attention = d.kind === "prompt" ? d.task?.attention : undefined;
  // An option is answered by its number in the agent's own list, so the
  // number is taken before "Type something…" (answered by the reply box)
  // is left out.
  const options = (attention?.options ?? [])
    .map((o, i) => ({ ...o, n: i + 1 }))
    .filter((o) => !/^type something/i.test(o.label));
  const canReply = d.kind === "awaiting" || (d.kind === "prompt" && attention && attention.kind !== "trust");
  const busy = answer.isPending || disabled;

  return (
    <section
      id={`decision-${d.key}`}
      tabIndex={-1}
      aria-label={d.kind === "offer" ? "Confirmation" : heading}
      className={`scroll-mt-4 overflow-hidden rounded-card border bg-surface shadow-1 focus-visible:outline-2 ${isFailed ? "border-bad/40" : "border-mari"}`}
    >
      <div
        className={`relative flex min-h-10 items-center gap-2 pl-4 pr-20 text-sm font-extrabold ${
          isFailed ? "bg-bad-soft text-bad" : "bg-mari text-mari-on"
        }`}
      >
        {isFailed ? (
          <StatusShapeIcon shape="cross" tone="bad" />
        ) : (
          <StatusShapeIcon shape={d.kind === "awaiting" ? "diamond-open" : d.kind === "takeover" ? "ring" : "diamond"} />
        )}
        <span className="flex-1">{KIND_LABEL[d.kind]}</span>
        <span className="relative z-10 tabular-nums">
          {d.kind === "offer" ? (expired ? "Expired" : `Expires in ${countdown(expiresIn)}`) : formatRelativeTime(d.since)}
        </span>
        {!isFailed && (
          <span
            aria-hidden="true"
            className="absolute inset-y-0 right-0 w-16"
            style={{ background: "repeating-linear-gradient(135deg, var(--mari-2) 0 6px, transparent 6px 12px)" }}
          />
        )}
      </div>

      <div className="flex flex-col gap-3 p-4 md:p-5">
        <h3 className="text-lg font-extrabold text-balance text-ink">{heading}</h3>

        {d.confirmation && offerAction(d.confirmation) && <CodeBlock>{offerAction(d.confirmation)!}</CodeBlock>}
        {attention?.title && <p className="font-bold text-ink">{attention.title}</p>}
        {attention?.detail && <CodeBlock>{attention.detail}</CodeBlock>}
        {attention?.question && <p className="text-ink">{attention.question}</p>}
        {d.kind === "prompt" && !attention && (
          <p className="text-ink-2">Its prompt couldn't be read here. Open the conversation, or attach to its terminal.</p>
        )}
        {d.kind === "takeover" && (
          <p className="text-ink-2">The agent's terminal is being driven by hand. Open the conversation to see where it stands.</p>
        )}
        {failure && <p className="text-ink-2">{failure.hint}</p>}

        {(workspace || showSource) && (
          <p className="text-sm text-ink-2">
            {workspace && (
              <>
                In <b className="text-ink">{workspace}</b>
                {d.confirmation?.agent_type ? `, ${d.confirmation.agent_type}` : ""}.{" "}
              </>
            )}
            {showSource && <>From {conversationLink}.</>}
          </p>
        )}

        {failure?.detail && (
          <details className="text-sm text-ink-2">
            <summary className="cursor-pointer font-bold">Details</summary>
            <p className="mt-1 font-mono break-words">{failure.detail}</p>
          </details>
        )}

        {d.kind === "offer" &&
          (expired ? (
            <p role="status" className="text-ink-2">
              Expired: nothing was run. Send the request again if you still want it.
            </p>
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:flex">
              <Button
                variant="primary"
                isDisabled={busy}
                isPending={busy && answer.variables?.message === "yes"}
                pendingLabel="Sending…"
                onPress={() => send("yes", "Approved.", { confirmationId: d.confirmation!.id })}
              >
                Approve
              </Button>
              <Button
                isDisabled={busy}
                isPending={busy && answer.variables?.message === "no"}
                pendingLabel="Sending…"
                onPress={() => send("no", "Denied: nothing was run.", { confirmationId: d.confirmation!.id })}
              >
                Deny
              </Button>
            </div>
          ))}

        {attention && (attention.kind === "permission" || attention.kind === "trust") && (
          <div className="grid grid-cols-2 gap-3 sm:flex">
            <Button variant="primary" isDisabled={busy} onPress={() => send("approve", "Approved.")}>
              {attention.kind === "trust" ? "Trust" : "Approve"}
            </Button>
            <Button isDisabled={busy} onPress={() => send("deny", "Denied.")}>
              Deny
            </Button>
          </div>
        )}

        {attention && attention.kind !== "trust" && options.length > 0 && (
          <ul className="flex flex-col gap-2">
            {options.map((o) => (
              <li key={o.n}>
                <Button
                  isDisabled={busy}
                  className="w-full !justify-start text-left whitespace-normal"
                  onPress={() => send(String(o.n), `Answered: ${o.label}.`)}
                >
                  <span className="grid size-6 shrink-0 place-items-center rounded-md bg-accent-soft text-sm text-accent">{o.n}</span>
                  {o.label}
                </Button>
              </li>
            ))}
          </ul>
        )}

        {canReply && (
          <form onSubmit={submitReply} className="flex gap-2">
            <label className="sr-only" htmlFor={`reply-${d.key}`}>
              Reply to the agent
            </label>
            <input
              id={`reply-${d.key}`}
              value={reply}
              onChange={(e) => setReply(e.target.value)}
              placeholder={attention ? "Or tell it what to do instead…" : "Type your reply…"}
              className="min-h-11 min-w-0 flex-1 rounded-control border border-line-strong bg-surface-2 px-3 text-ink placeholder:text-ink-3"
            />
            <Button type="submit" isDisabled={busy || !reply.trim()}>
              Reply
            </Button>
          </form>
        )}

        {isFailed && d.retryMessage && (
          <div>
            <Button
              variant="danger"
              isDisabled={busy}
              isPending={busy}
              pendingLabel="Retrying…"
              onPress={() => send(d.retryMessage!, "Sent again.", { confirmationId: d.dispatch?.confirmation_id })}
            >
              Retry
            </Button>
          </div>
        )}

        {answer.isError && (
          <p role="alert" className="text-sm text-bad">
            {answerErrorText(answer.error)}
          </p>
        )}

        {(showSource || (onSnooze && d.kind !== "offer")) && (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-line pt-3 text-sm">
            {showSource && (
              <Link to={`/conversations/${d.conversationId}`} className="min-h-9 content-center font-bold text-accent">
                Open conversation
              </Link>
            )}
            {onSnooze && d.kind !== "offer" && (
              <button type="button" onClick={() => onSnooze(d)} className="min-h-9 font-bold text-ink-2 hover:text-ink">
                Snooze until tomorrow
              </button>
            )}
          </div>
        )}
      </div>
    </section>
  );
}

// What's left of a card once it's answered: what happened, and the way
// into the conversation to follow it.
export function AnsweredCard({
  decision: d,
  outcome,
  onDismiss,
}: {
  decision: Decision;
  outcome: Answered;
  onDismiss: () => void;
}) {
  return (
    <section
      aria-label={d.kind === "offer" ? "Confirmation" : "Answered"}
      className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-card border border-line bg-surface px-4 py-3"
    >
      <StatusShapeIcon shape="check" tone="good" className="size-4" />
      <p role="status" className="flex-1 font-bold text-ink">
        {outcome.label}
      </p>
      <Link to={`/conversations/${d.conversationId}`} className="min-h-9 content-center text-sm font-bold text-accent">
        Open conversation
      </Link>
      <button type="button" onClick={onDismiss} className="min-h-9 text-sm font-bold text-ink-2 hover:text-ink">
        Dismiss
      </button>
    </section>
  );
}
