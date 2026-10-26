import { describe, expect, it } from "vitest";
import type { Confirmation } from "./api";
import { machinePlan, offerAction, offerHeading, offerWorkspace } from "./offerText";

function confirmation(overrides: Partial<Confirmation> = {}): Confirmation {
  return {
    id: "cf-1",
    kind: "policy",
    agent_type: "claude-code",
    status: "pending",
    created_at: "2026-10-07T10:00:00Z",
    expires_at: "2026-10-07T10:10:00Z",
    ...overrides,
  };
}

describe("offer wording", () => {
  it.each([
    ["run_command", { command: "df -h", target_name: "devbox" }, "Run this command on devbox?"],
    ["install_agent", { agent_type: "codex" }, "Install codex?"],
    ["clone_remote", { target_name: "atlas" }, "Clone a repository you didn't name on atlas?"],
    ["policy", {}, "Start this work?"],
    ["create_target", { target_name: "builds" }, "Create the machine builds?"],
    ["create_target", {}, "Create a new machine?"],
  ] as const)("asks about a %s offer", (kind, fields, heading) => {
    expect(offerHeading(confirmation({ kind, ...fields }))).toBe(heading);
  });

  it("shows the command, or the remote to clone", () => {
    expect(offerAction(confirmation({ command: "df -h" }))).toBe("df -h");
    expect(offerAction(confirmation({ git_remote: "git@example.test:x/y.git" }))).toBe("git@example.test:x/y.git");
    expect(offerAction(confirmation())).toBeUndefined();
  });

  // API v1 calls the field workspace_name; pre-1.0 servers send `workspace`.
  it("reads the workspace from either spelling, preferring workspace_name", () => {
    expect(offerWorkspace(confirmation({ workspace_name: "my-app" }))).toBe("my-app");
    expect(offerWorkspace(confirmation({ workspace: "my-app" }))).toBe("my-app");
    expect(offerWorkspace(confirmation({ workspace_name: "new-name", workspace: "old-name" }))).toBe("new-name");
  });

  // LOOM-247: a create_target offer's command is the server's planSummary,
  // shown as the plan's parts.
  it("reads a machine offer's plan", () => {
    const command = "plugin kubernetes (thewysekube); size small: 1 CPU, 2Gi memory, 10Gi disk; ephemeral; egress internet";
    expect(machinePlan(confirmation({ kind: "create_target", target_name: "builds", command }))).toEqual([
      { label: "Plugin", value: "kubernetes (thewysekube)" },
      { label: "Size", value: "small: 1 CPU, 2Gi memory, 10Gi disk" },
      { label: "Data", value: "Ephemeral: its files go when it is destroyed" },
      { label: "Network", value: "internet" },
    ]);
    const kept = machinePlan(
      confirmation({
        kind: "create_target",
        command: "plugin docker; size medium: 2 CPU, 4Gi memory, 20Gi disk (placed by its request of 1 CPU and 2Gi memory); keeps its data; egress none",
      }),
    );
    expect(kept?.map((r) => r.value)).toEqual([
      "docker",
      "medium: 2 CPU, 4Gi memory, 20Gi disk (placed by its request of 1 CPU and 2Gi memory)",
      "Kept: its files survive stop, start and recreate",
      "none: DNS only, nothing else",
    ]);
  });

  it("spells out a trusted network, as the chat does", () => {
    const plan = machinePlan(confirmation({ kind: "create_target", command: "plugin docker; size small: 1 CPU, 1Gi memory, 5Gi disk; ephemeral; egress trusted" }));
    expect(plan?.[3]).toEqual({ label: "Network", value: "trusted: the LAN and the tailnet as well as the internet" });
  });

  it("leaves a plan it can't read, and other offers, to the command", () => {
    const odd = confirmation({ kind: "create_target", command: "something else entirely" });
    expect(machinePlan(odd)).toBeUndefined();
    expect(offerAction(odd)).toBe("something else entirely");
    expect(machinePlan(confirmation({ kind: "run_command", command: "plugin a; size b; ephemeral; egress c" }))).toBeUndefined();
  });
});
