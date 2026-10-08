import { useSyncExternalStore } from "react";

// Whether the browser thinks it's online. An installed app on a phone goes
// offline often; the shell says so instead of letting fetches fail with
// the browser's own "Failed to fetch".
function subscribe(onChange: () => void) {
  window.addEventListener("online", onChange);
  window.addEventListener("offline", onChange);
  return () => {
    window.removeEventListener("online", onChange);
    window.removeEventListener("offline", onChange);
  };
}

export function useOnline(): boolean {
  return useSyncExternalStore(subscribe, () => navigator.onLine, () => true);
}
