import type { TaskHold } from "./api";

// Holds (loomux/server LOOM-264/267, docs/design/tui-client-design.md
// "Server awareness: holds"): who drives a task from a terminal, in the
// words every screen uses for it.

const HOLDER: Record<string, string> = {
  tui: "the terminal",
  web: "the web",
  app: "the app",
};

// "the terminal on laptop": the same words as the server's refusal of a
// message to a held conversation (router HeldError), so the two agree.
export function holderName(kind: string, label: string): string {
  const who = HOLDER[kind] ?? "a client";
  return label ? `${who} on ${label}` : who;
}

// The hold a person drives the task with, or null: nobody holds it, the
// server is from before holds, the hold has ended, or it's a read-only
// watch (automation keeps typing under one).
export function drivingHold(h: TaskHold | null | undefined): TaskHold | null {
  if (!h || h.ended_at || h.mode === "watch") return null;
  return h;
}

// "14:02" for a hold taken today, "18 Nov, 09:30" before that.
export function heldSince(iso: string, now = Date.now()): string {
  const at = new Date(iso);
  const time = at.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  if (at.toDateString() === new Date(now).toDateString()) return time;
  return `${at.toLocaleDateString([], { day: "numeric", month: "short" })}, ${time}`;
}

const CLIENT: Record<string, string> = {
  tui: "loomux TUI",
  web: "Web",
  app: "App",
};

// A session's client, for the devices list ("loomux TUI · laptop"); ""
// when the server doesn't say (older servers, older sessions).
export function clientName(kind: string | undefined): string {
  return (kind && CLIENT[kind]) || "";
}
