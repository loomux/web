import { useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { useApiClient } from "../lib/useApiClient";
import { useTaskPane } from "../lib/useTaskPane";

function clock(iso: string) {
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

// A task's terminal (build-plan §7). Live while its turn runs when the
// server can serve it; otherwise the pane as captured at the end of the
// last turn (GET /tasks/{id}/transcript), labelled with its time so it
// never passes for live. `refresh` changes when a turn ends, to fetch the
// new capture.
export function PanePanel({ taskId, running, refresh }: { taskId: string; running: boolean; refresh?: string }) {
  const apiClient = useApiClient();
  const live = useTaskPane(taskId, running);
  const { data, isLoading, isError } = useQuery({
    queryKey: ["transcript", taskId, "latest", refresh ?? ""],
    queryFn: () => apiClient.getTaskTranscript(taskId, { limit: 1 }),
    retry: false,
  });
  const turn = data?.turns[data.turns.length - 1];
  const showingLive = running && live.lines !== null;
  const text = showingLive ? live.lines!.join("\n") : turn?.pane;

  const preRef = useRef<HTMLPreElement>(null);
  useEffect(() => {
    const pre = preRef.current;
    if (pre) pre.scrollTop = pre.scrollHeight;
  }, [text]);

  let caption: string;
  if (showingLive) caption = "Live";
  else if (turn) caption = `As it was at the end of the last turn, ${clock(turn.created_at)}`;
  else if (isLoading) caption = "Loading…";
  else if (isError) caption = "Couldn't load the terminal.";
  else caption = "Nothing captured yet.";

  return (
    <section aria-label="Terminal" className="overflow-hidden rounded-control bg-pane">
      <header className="flex items-center gap-2 border-b border-pane-dim/30 px-3 py-2 text-xs font-bold text-pane-dim">
        {showingLive && <span aria-hidden="true" className="size-2 rounded-full bg-pane-hi" />}
        <span>Terminal</span>
        <span className="font-normal">{caption}</span>
      </header>
      {text ? (
        <pre ref={preRef} className="max-h-72 overflow-auto px-3 py-2.5 font-mono text-[0.8125rem] leading-snug text-pane-ink">
          {text}
        </pre>
      ) : null}
      {running && !live.supported && (
        <p className="border-t border-pane-dim/30 px-3 py-2 text-xs text-pane-dim">
          This server doesn't stream the terminal while a turn runs. Attach to watch it live.
        </p>
      )}
    </section>
  );
}
