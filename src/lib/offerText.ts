import type { Confirmation } from "./api";

// What an offer (LOOM-123) asks, as a question: shared by every place an
// offer is answered.
export function offerHeading(c: Confirmation): string {
  // A machine offer's target_name is the machine it would create.
  if (c.kind === "create_target") return c.target_name ? `Create the machine ${c.target_name}?` : "Create a new machine?";
  const where = c.target_name ? ` on ${c.target_name}` : "";
  switch (c.kind) {
    case "run_command":
      return `Run this command${where}?`;
    case "install_agent":
      return `Install ${c.agent_type || "the agent"}${where}?`;
    case "clone_remote":
      return `Clone a repository you didn't name${where}?`;
    default:
      return `Start this work${where}?`;
  }
}

// The exact thing that would happen, shown in full (principles 2).
export function offerAction(c: Confirmation): string | undefined {
  return c.command || c.git_remote || undefined;
}

// API v1 calls it workspace_name; pre-1.0 servers send `workspace`.
export function offerWorkspace(c: Confirmation): string | undefined {
  return c.workspace_name ?? c.workspace;
}

export interface PlanRow {
  label: string;
  value: string;
}

// The chat's words for a machine's data and network (router writePlan).
const DATA: Record<string, string> = {
  "keeps its data": "Kept: its files survive stop, start and recreate",
  ephemeral: "Ephemeral: its files go when it is destroyed",
};
const EGRESS: Record<string, string> = {
  none: "none: DNS only, nothing else",
  trusted: "trusted: the LAN and the tailnet as well as the internet",
};

// A create_target offer's plan (LOOM-247), read from its command, the
// server's one-line summary: "plugin <p>; size <s>; <data>; egress <e>".
// Undefined when it doesn't read as one, so the command shows as it is.
export function machinePlan(c: Confirmation): PlanRow[] | undefined {
  if (c.kind !== "create_target" || !c.command) return undefined;
  const m = /^plugin (.+?); size (.+); (keeps its data|ephemeral); egress (\S+)$/.exec(c.command);
  if (!m) return undefined;
  return [
    { label: "Plugin", value: m[1] },
    { label: "Size", value: m[2] },
    { label: "Data", value: DATA[m[3]] },
    { label: "Network", value: EGRESS[m[4]] ?? m[4] },
  ];
}
