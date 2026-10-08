import { useEffect, useState } from "react";
import { useApiClient } from "./useApiClient";

// The live terminal of a running task, where the server can serve it
// (build-plan §7): probed once, then polled every 1.5 s while the turn runs
// and the tab is visible. A server without the endpoint answers the probe
// with 404/501, and the client stops asking for the rest of the visit;
// screens then show the last turn's capture instead.
const POLL_MS = 1500;
let unsupported = false;

export function liveTailUnsupported() {
  return unsupported;
}

// For tests.
export function resetLiveTailProbe() {
  unsupported = false;
}

export function useTaskPane(taskId: string | undefined, running: boolean) {
  const apiClient = useApiClient();
  const [lines, setLines] = useState<string[] | null>(null);
  const [supported, setSupported] = useState(!unsupported);

  useEffect(() => {
    if (!taskId || !running || unsupported) return;
    let stopped = false;
    let cursor: string | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;

    async function tick() {
      if (stopped) return;
      if (document.visibilityState === "visible") {
        try {
          const pane = await apiClient.getTaskPane(taskId!, cursor);
          if (stopped) return;
          if (pane) {
            cursor = pane.cursor;
            setLines(pane.lines);
          } else if (cursor === undefined) {
            // The very first answer was "no such endpoint".
            unsupported = true;
            setSupported(false);
            return;
          }
        } catch {
          // A failed poll just waits for the next one.
        }
      }
      timer = setTimeout(tick, POLL_MS);
    }
    void tick();
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [taskId, running, apiClient]);

  return { lines: running ? lines : null, supported };
}
