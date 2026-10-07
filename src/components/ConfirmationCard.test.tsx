import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import type { Confirmation } from "../lib/api";
import { ConfirmationCard } from "./ConfirmationCard";

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

describe("ConfirmationCard", () => {
  // API v1 calls the field workspace_name; pre-1.0 servers send `workspace`.
  it.each([
    ["workspace_name (API v1)", { workspace_name: "my-app" }],
    ["workspace (pre-1.0)", { workspace: "my-app" }],
  ])("shows the workspace from %s", (_label, fields) => {
    render(<ConfirmationCard confirmation={confirmation(fields)} disabled={false} onAnswer={() => {}} />);
    expect(screen.getByText(/Workspace my-app/)).toBeInTheDocument();
  });

  it("prefers workspace_name when both are sent", () => {
    render(
      <ConfirmationCard
        confirmation={confirmation({ workspace_name: "new-name", workspace: "old-name" })}
        disabled={false}
        onAnswer={() => {}}
      />,
    );
    expect(screen.getByText(/Workspace new-name/)).toBeInTheDocument();
    expect(screen.queryByText(/old-name/)).not.toBeInTheDocument();
  });
});
