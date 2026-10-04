import { useState, type FormEvent } from "react";
import type { Attention } from "../lib/api";

// What an agent stopped at a prompt is asking (LOOM-97), with buttons for
// its answers. Each button just sends a chat message ("approve", "deny",
// an option's number, the user's own words): the server reads the
// conversation's next message as the prompt's answer and types the
// matching keys into the pane.
export function AttentionCard({
  attention,
  agent,
  disabled,
  onAnswer,
}: {
  attention: Attention;
  agent: string;
  disabled: boolean;
  onAnswer: (message: string) => void;
}) {
  const [reply, setReply] = useState("");
  const options = attention.options ?? [];
  const isPermission = attention.kind === "permission";
  const isTrust = attention.kind === "trust";
  const heading = isPermission
    ? `${agent} needs your approval`
    : isTrust
      ? `${agent} asks whether to trust this folder`
      : `${agent} is asking you something`;

  function submitReply(e: FormEvent) {
    e.preventDefault();
    if (reply.trim() === "" || disabled) return;
    onAnswer(reply.trim());
    setReply("");
  }

  const buttonBase = "rounded px-3 py-1.5 text-sm disabled:opacity-50";
  return (
    <section
      aria-label="Agent needs attention"
      className="mx-4 mb-2 rounded-lg border border-amber-300 bg-amber-50 p-3 dark:border-amber-700 dark:bg-amber-950"
    >
      <p className="text-sm font-medium text-amber-900 dark:text-amber-100">{heading}</p>
      {attention.title && <p className="mt-2 text-sm font-semibold">{attention.title}</p>}
      {attention.detail && (
        <pre className="mt-1 overflow-x-auto whitespace-pre-wrap rounded bg-white px-2 py-1 text-xs dark:bg-neutral-900">
          {attention.detail}
        </pre>
      )}
      {attention.question && <p className="mt-2 text-sm">{attention.question}</p>}

      <div className="mt-2 flex flex-wrap gap-2">
        {(isPermission || isTrust) && (
          <>
            <button
              type="button"
              disabled={disabled}
              onClick={() => onAnswer("approve")}
              className={`${buttonBase} bg-green-700 text-white`}
            >
              {isTrust ? "Trust" : "Approve"}
            </button>
            <button
              type="button"
              disabled={disabled}
              onClick={() => onAnswer("deny")}
              className={`${buttonBase} bg-red-700 text-white`}
            >
              Deny
            </button>
          </>
        )}
        {!isTrust &&
          options.map((o, i) =>
            /^type something/i.test(o.label) ? null : (
              <button
                key={i}
                type="button"
                disabled={disabled}
                title={o.description}
                onClick={() => onAnswer(String(i + 1))}
                className={`${buttonBase} border border-neutral-300 bg-white dark:border-neutral-700 dark:bg-neutral-900`}
              >
                {i + 1}. {o.label}
              </button>
            ),
          )}
      </div>

      {!isTrust && (
        <form onSubmit={submitReply} className="mt-2 flex gap-2">
          <input
            value={reply}
            onChange={(e) => setReply(e.target.value)}
            disabled={disabled}
            aria-label="Reply to the agent"
            placeholder={isPermission ? "Or tell it what to do instead…" : "Or type your own answer…"}
            className="flex-1 rounded border border-neutral-300 px-2 py-1 text-sm disabled:opacity-50 dark:border-neutral-700 dark:bg-neutral-900"
          />
          <button
            type="submit"
            disabled={disabled || reply.trim() === ""}
            className={`${buttonBase} bg-neutral-900 text-white dark:bg-neutral-100 dark:text-neutral-900`}
          >
            Reply
          </button>
        </form>
      )}
    </section>
  );
}
