// Snoozing a decision (principles 1): hides it from the Inbox and the
// count until a time, on this device only. The server's status is
// untouched; a new prompt or offer has a new key, so it shows at once.
const STORAGE_KEY = "loomux.snoozed";

type SnoozeMap = Record<string, string>;

// Every useNeedsYou re-reads when a snooze changes, in this tab or another.
let version = 0;
const listeners = new Set<() => void>();
function changed() {
  version++;
  listeners.forEach((l) => l());
}
export function subscribeSnoozes(listener: () => void) {
  listeners.add(listener);
  const onStorage = (e: StorageEvent) => {
    if (e.key === STORAGE_KEY) changed();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}
export function snoozeVersion() {
  return version;
}

function read(): SnoozeMap {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as SnoozeMap) : {};
  } catch {
    return {};
  }
}

function write(map: SnoozeMap) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
  } catch {
    // not kept past this visit
  }
}

export function snoozedUntil(key: string, now: number): number | null {
  const until = Date.parse(read()[key] ?? "");
  return Number.isFinite(until) && until > now ? until : null;
}

export function snooze(key: string, until: Date, now: number) {
  const map = read();
  // Drop snoozes that have run out, so the map doesn't grow forever.
  for (const [k, v] of Object.entries(map)) if (!(Date.parse(v) > now)) delete map[k];
  map[key] = until.toISOString();
  write(map);
  changed();
}

export function unsnooze(key: string) {
  const map = read();
  delete map[key];
  write(map);
  changed();
}
