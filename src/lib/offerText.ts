import type { Confirmation } from "./api";

// What an offer (LOOM-123) asks, as a question: shared by every place an
// offer is answered.
export function offerHeading(c: Confirmation): string {
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
