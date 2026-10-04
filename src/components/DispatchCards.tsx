import { useEffect, useState } from "react";
import { describeDispatchError, formatElapsed, type TurnStage } from "../lib/dispatchTurn";
import { AttachInfo } from "./AttachInfo";

// The turn in flight (LOOM-81): its stage, how long it has run, and the
// attach command once an agent's session exists.
export function DispatchProgressCard({ stage, startedAt }: { stage: TurnStage; startedAt: string }) {
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
