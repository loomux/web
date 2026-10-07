import type { Confirmation } from "../lib/api";
import { offerHeading as heading } from "../lib/offerText";

const resolved: Record<Confirmation["status"], string> = {
  pending: "",
  approved: "Approved",
  denied: "Denied: nothing was run",
  expired: "Expired: nothing was run. Send the request again if you still want it.",
};

// An offer awaiting a yes (LOOM-123), as a card under the reply that made
// it: Approve or Deny instead of typing. Each button sends "yes" or "no"
// naming the offer, so a click that comes too late runs nothing. Once
// answered, the card says how. It looks like the agent-prompt card
// (AttentionCard) on purpose: every approval is answered the same way.
export function ConfirmationCard({
  confirmation: c,
  disabled,
  onAnswer,
}: {
  confirmation: Confirmation;
  disabled: boolean;
  onAnswer: (message: "yes" | "no") => void;
}) {
  const pending = c.status === "pending";
  // API v1 renamed it workspace_name; pre-1.0 servers send `workspace`.
  const workspace = c.workspace_name ?? c.workspace;
  const buttonBase = "rounded px-3 py-1.5 text-sm disabled:opacity-50";
  return (
    <section
      aria-label="Confirmation"
      className={`mr-auto max-w-[75%] rounded-lg border p-3 ${
        pending
          ? "border-amber-300 bg-amber-50 dark:border-amber-700 dark:bg-amber-950"
          : "border-neutral-200 dark:border-neutral-800"
      }`}
    >
      <p className="text-sm font-medium">{heading(c)}</p>
      {(c.command || c.git_remote) && (
        <pre className="mt-1 overflow-x-auto whitespace-pre-wrap rounded bg-white px-2 py-1 text-xs dark:bg-neutral-900">
          {c.command || c.git_remote}
        </pre>
      )}
      {(workspace || (c.agent_type && c.kind !== "install_agent")) && (
        <p className="mt-1 text-xs text-neutral-600 dark:text-neutral-400">
          {workspace && <>Workspace {workspace}</>}
          {workspace && c.agent_type && c.kind !== "install_agent" && " · "}
          {c.agent_type && c.kind !== "install_agent" && <>{c.agent_type}</>}
        </p>
      )}
      {pending ? (
        <div className="mt-2 flex flex-wrap gap-2">
          <button
            type="button"
            disabled={disabled}
            onClick={() => onAnswer("yes")}
            className={`${buttonBase} bg-green-700 text-white`}
          >
            Approve
          </button>
          <button
            type="button"
            disabled={disabled}
            onClick={() => onAnswer("no")}
            className={`${buttonBase} border border-neutral-300 dark:border-neutral-700`}
          >
            Deny
          </button>
        </div>
      ) : (
        <p role="status" className="mt-2 text-sm text-neutral-600 dark:text-neutral-400">
          {resolved[c.status]}
        </p>
      )}
    </section>
  );
}
