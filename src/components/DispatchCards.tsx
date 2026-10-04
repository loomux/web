import { useEffect, useState } from "react";
import { describeDispatchError, formatElapsed, type TurnStage } from "../lib/dispatchTurn";
import { AttachInfo } from "./AttachInfo";

// The turn in flight (LOOM-81): its stage, how long it has run, the
// attach command once an agent's session exists, and Cancel (LOOM-99).
export function DispatchProgressCard({
  stage,
  startedAt,
  onCancel,
  cancelling,
}: {
  stage: TurnStage;
  startedAt: string;
  onCancel?: () => void;
  cancelling?: boolean;
}) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  return (
    <div
      role="status"
      aria-label="Turn in progress"
      className="mr-auto max-w-[75%] rounded-lg border border-neutral-200 px-3 py-2 text-sm dark:border-neutral-700"
    >
      <div className="flex items-center gap-2">
        <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-blue-500" aria-hidden />
        <span className="font-medium">{stage.label}</span>
        <span className="text-neutral-500">{formatElapsed(now - Date.parse(startedAt))}</span>
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            disabled={cancelling}
            className="ml-auto rounded border border-neutral-300 px-2 py-0.5 text-xs hover:bg-neutral-100 disabled:opacity-50 dark:border-neutral-600 dark:hover:bg-neutral-800"
          >
            {cancelling ? "Cancelling…" : "Cancel"}
          </button>
        )}
      </div>
      {stage.taskId && (
        <div className="mt-1">
          <AttachInfo taskId={stage.taskId} />
        </div>
      )}
    </div>
  );
}

// A failed turn (LOOM-81), kept in the transcript: what went wrong in
// plain words, what to try, the server's own text, and Retry.
export function DispatchErrorCard({
  errorClass,
  error,
  onRetry,
  retryDisabled,
}: {
  errorClass?: string;
  error?: string;
  onRetry: () => void;
  retryDisabled: boolean;
}) {
  const text = describeDispatchError(errorClass, error);
  return (
    <div
      role="alert"
      className="mr-auto max-w-[75%] rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm dark:border-red-800 dark:bg-red-950"
    >
      <p className="font-medium text-red-800 dark:text-red-200">{text.message}</p>
      <p className="mt-1 text-red-700 dark:text-red-300">{text.hint}</p>
      {text.detail && (
        <details className="mt-1 text-xs text-neutral-600 dark:text-neutral-400">
          <summary className="cursor-pointer">Details</summary>
          <pre className="mt-1 whitespace-pre-wrap break-words">{text.detail}</pre>
        </details>
      )}
      <button
        type="button"
        onClick={onRetry}
        disabled={retryDisabled}
        className="mt-2 rounded bg-red-700 px-3 py-1 text-white disabled:opacity-50"
      >
        Retry
      </button>
    </div>
  );
}
