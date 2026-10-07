// What the user sees for each server status (principles.md "Status
// vocabulary"). Every status has a plain label and a shape as well as a
// tone, so nothing is told apart by colour alone. Statuses arrive
// snake_case (api.ts normalizeStatus).

// Token pairs in styles/tokens.css: mari = needs you, accent = working.
export type StatusTone = "mari" | "accent" | "good" | "bad" | "muted";

export type StatusShape = "diamond" | "diamond-open" | "dot" | "check" | "cross" | "ring" | "square" | "triangle";

export type StatusGroup = "needs-you" | "working" | "done" | "other";

export interface StatusInfo {
  label: string;
  tone: StatusTone;
  shape: StatusShape;
  group: StatusGroup;
}

// "some_new_status" → "Some new status", for anything the server adds later.
export function humanize(status: string): string {
  const words = status.replace(/[-_]+/g, " ").trim();
  return words ? words[0].toUpperCase() + words.slice(1) : "Unknown";
}

const CONVERSATION: Record<string, StatusInfo> = {
  needs_attention: { label: "Asking you", tone: "mari", shape: "diamond", group: "needs-you" },
  awaiting_input: { label: "Waiting for your reply", tone: "mari", shape: "diamond-open", group: "needs-you" },
  human_takeover: { label: "You're driving", tone: "mari", shape: "ring", group: "needs-you" },
  running: { label: "Working", tone: "accent", shape: "dot", group: "working" },
  completed: { label: "Done", tone: "good", shape: "check", group: "done" },
  failed: { label: "Failed", tone: "bad", shape: "cross", group: "done" },
};

// A conversation's status is its latest task's (server api/server.go).
export function conversationStatus(status: string): StatusInfo {
  return CONVERSATION[status] ?? { label: humanize(status), tone: "muted", shape: "ring", group: "other" };
}

const WORKSPACE: Record<string, StatusInfo> = {
  idle: { label: "Idle", tone: "muted", shape: "ring", group: "other" },
  active: { label: "Agent attached", tone: "accent", shape: "dot", group: "working" },
  provisioning: { label: "Setting up", tone: "accent", shape: "ring", group: "working" },
  archived: { label: "Archived", tone: "muted", shape: "square", group: "other" },
  failed: { label: "Broken", tone: "bad", shape: "triangle", group: "other" },
};

export function workspaceStatus(status: string): StatusInfo {
  return WORKSPACE[status] ?? { label: humanize(status), tone: "muted", shape: "ring", group: "other" };
}

// Relay (operations.md "What the router models see"): how much of a
// target's work the third-party router models get.
export interface RelayInfo {
  label: string;
  description: string;
}

const RELAY: Record<string, RelayInfo> = {
  full: {
    label: "Everything",
    description: "The router models see the agent's output, your messages and the running summary.",
  },
  last_message: {
    label: "Final answer only",
    description: "The router models see only the agent's final message, never its screen or your earlier messages.",
  },
  none: {
    label: "Nothing",
    description:
      "The router models see none of this machine's work. The agent's final message is the reply, as it is, and notifications only say there's news.",
  },
};

export function relayInfo(relay: string): RelayInfo {
  return RELAY[relay] ?? { label: humanize(relay), description: "" };
}
