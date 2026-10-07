import { describe, expect, it } from "vitest";
import { conversationStatus, humanize, relayInfo, workspaceStatus } from "./status";

describe("status vocabulary", () => {
  it("names conversation statuses in plain words, each with its own shape", () => {
    expect(conversationStatus("needs_attention")).toMatchObject({ label: "Asking you", tone: "mari", group: "needs-you" });
    expect(conversationStatus("awaiting_input").label).toBe("Waiting for your reply");
    expect(conversationStatus("human_takeover").label).toBe("You're driving");
    expect(conversationStatus("running")).toMatchObject({ label: "Working", group: "working" });
    expect(conversationStatus("completed").label).toBe("Done");
    expect(conversationStatus("failed").label).toBe("Failed");

    // The three needs-you statuses differ by shape, not colour alone.
    const shapes = ["needs_attention", "awaiting_input", "human_takeover"].map((s) => conversationStatus(s).shape);
    expect(new Set(shapes).size).toBe(3);
  });

  it("names workspace statuses", () => {
    expect(["idle", "active", "provisioning", "archived", "failed"].map((s) => workspaceStatus(s).label)).toEqual([
      "Idle",
      "Agent attached",
      "Setting up",
      "Archived",
      "Broken",
    ]);
  });

  it("names relay levels and says what the router models see", () => {
    expect(relayInfo("full").label).toBe("Everything");
    expect(relayInfo("last_message").label).toBe("Final answer only");
    expect(relayInfo("none").label).toBe("Nothing");
    expect(relayInfo("none").description).toMatch(/none of this machine's work/);
  });

  it("shows a status it doesn't know as readable words", () => {
    expect(humanize("some_new-status")).toBe("Some new status");
    expect(conversationStatus("paused")).toMatchObject({ label: "Paused", tone: "muted", group: "other" });
    expect(humanize("")).toBe("Unknown");
  });
});
