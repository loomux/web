import { describe, expect, it } from "vitest";
import type { Confirmation } from "./api";
import { offerAction, offerHeading, offerWorkspace } from "./offerText";

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
});
