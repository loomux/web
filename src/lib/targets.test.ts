import { describe, expect, it } from "vitest";
import type { Target } from "./api";
import {
  compareTargets,
  describePolicy,
  formatDestination,
  kindBadgeClasses,
  matchesKindFilter,
  targetFormFromTarget,
  toTargetRequest,
  validateTargetRequest,
  type TargetFormValues,
} from "./targets";

function makeTarget(overrides: Partial<Target> = {}): Target {
  return {
    id: "tgt-1",
    name: "alpha",
    kind: "remote",
    host: "alpha.example",
    user: "agent",
    ssh_key_ref: "vault://keys/alpha",
    workspace_root: "/srv/loomux",
    permission_mode: "manual",
    purpose: "work",
    allowed_agent_types: ["claude-code"],
    allow_provision: false,
    allow_shell: true,
    require_confirmation: true,
    created_at: "2026-09-01T00:00:00Z",
    updated_at: "2026-09-01T00:00:00Z",
    ...overrides,
  };
}

function form(overrides: Partial<TargetFormValues> = {}): TargetFormValues {
  return {
    name: "alpha",
    kind: "remote",
    host: "alpha.example",
    user: "agent",
    ssh_key_ref: "",
    workspace_root: "",
    permission_mode: "",
    purpose: "",
    allowed_agent_types: "",
    allow_provision: true,
    allow_shell: true,
    require_confirmation: false,
    ...overrides,
  };
}

describe("targetFormFromTarget", () => {
  it("round-trips every stored field, so a PUT does not clear one", () => {
    expect(targetFormFromTarget(makeTarget())).toEqual({
      name: "alpha",
      kind: "remote",
      host: "alpha.example",
      user: "agent",
      ssh_key_ref: "vault://keys/alpha",
      workspace_root: "/srv/loomux",
      permission_mode: "manual",
      purpose: "work",
      allowed_agent_types: "claude-code",
      allow_provision: false,
      allow_shell: true,
      require_confirmation: true,
    });
  });

  it("defaults the policy to allowing everything when the server omits it", () => {
    const target = makeTarget();
    delete target.purpose;
    delete target.allowed_agent_types;
    delete target.allow_provision;
    delete target.allow_shell;
    delete target.require_confirmation;
    expect(targetFormFromTarget(target)).toMatchObject({
      purpose: "",
      allowed_agent_types: "",
      allow_provision: true,
      allow_shell: true,
      require_confirmation: false,
    });
  });

  it("reads a stored purpose of personal as the default the select shows", () => {
    expect(targetFormFromTarget(makeTarget({ purpose: "personal" })).purpose).toBe("");
  });

  it("treats an absent or unknown permission_mode as the default", () => {
    const target = makeTarget();
    delete target.permission_mode;
    expect(targetFormFromTarget(target).permission_mode).toBe("");
    expect(targetFormFromTarget(makeTarget({ permission_mode: "yolo" })).permission_mode).toBe("");
  });

  it("treats an absent workspace_root as empty (older servers omit it)", () => {
    const target = makeTarget();
    delete target.workspace_root;
    expect(targetFormFromTarget(target).workspace_root).toBe("");
  });

  it("falls back to remote for an unrecognised kind", () => {
    expect(targetFormFromTarget(makeTarget({ kind: "something-new" })).kind).toBe("remote");
  });
});

describe("toTargetRequest", () => {
  it("trims every field", () => {
    const req = toTargetRequest(
      form({ name: "  alpha  ", host: " h ", user: " u ", ssh_key_ref: " k " }),
    );
    expect(req).toMatchObject({ name: "alpha", host: "h", user: "u", ssh_key_ref: "k" });
  });

  it("blanks host and user for a local target", () => {
    const req = toTargetRequest(form({ kind: "local" }));
    expect(req.host).toBe("");
    expect(req.user).toBe("");
  });

  it("keeps ssh_key_ref and workspace_root on an edit", () => {
    const req = toTargetRequest(
      form({ ssh_key_ref: "vault://keys/alpha", workspace_root: "/srv/loomux" }),
    );
    expect(req.ssh_key_ref).toBe("vault://keys/alpha");
    expect(req.workspace_root).toBe("/srv/loomux");
  });

  it("sends the policy, splitting the agent-type list", () => {
    const req = toTargetRequest(
      form({ purpose: "work", allowed_agent_types: " claude-code, codex ,", allow_provision: false,
        allow_shell: false, require_confirmation: true }),
    );
    expect(req).toMatchObject({
      purpose: "work",
      allowed_agent_types: ["claude-code", "codex"],
      allow_provision: false,
      allow_shell: false,
      require_confirmation: true,
    });
    expect(toTargetRequest(form()).allowed_agent_types).toEqual([]);
  });

  it("sends permission_mode as chosen, empty meaning the agent's default", () => {
    expect(toTargetRequest(form({ permission_mode: "manual" })).permission_mode).toBe("manual");
    expect(toTargetRequest(form()).permission_mode).toBe("");
  });
});

// These expectations are the server's own messages (registry.Target.Validate).
// If they drift, the client is no longer previewing what the server will say.
describe("validateTargetRequest", () => {
  const base = { name: "alpha", kind: "remote", host: "h", user: "u", ssh_key_ref: "" };

  it("accepts a valid remote target", () => {
    expect(validateTargetRequest(base)).toBeNull();
  });

  it("accepts a valid local target", () => {
    expect(validateTargetRequest({ ...base, kind: "local", host: "", user: "" })).toBeNull();
  });

  it("requires a name", () => {
    expect(validateTargetRequest({ ...base, name: "   " })).toBe("name is required");
  });

  it("requires host and user for a remote target", () => {
    expect(validateTargetRequest({ ...base, host: "" })).toBe(
      "host and user are required for a remote target",
    );
    expect(validateTargetRequest({ ...base, user: "" })).toBe(
      "host and user are required for a remote target",
    );
  });

  it("forbids host and user on a local target", () => {
    expect(validateTargetRequest({ ...base, kind: "local", user: "" })).toBe(
      "host and user must be empty for a local target",
    );
    expect(validateTargetRequest({ ...base, kind: "local", host: "" })).toBe(
      "host and user must be empty for a local target",
    );
  });

  it("rejects an unknown kind", () => {
    expect(validateTargetRequest({ ...base, kind: "kubernetes" })).toBe(
      'kind must be "local" or "remote"',
    );
  });

  it("rejects an unknown permission_mode", () => {
    expect(validateTargetRequest({ ...base, permission_mode: "auto" })).toBeNull();
    expect(validateTargetRequest({ ...base, permission_mode: "yolo" })).toBe(
      'permission_mode must be empty, "auto", "accept-edits" or "manual"',
    );
  });

  it("allows an empty or absent workspace_root", () => {
    expect(validateTargetRequest({ ...base, workspace_root: "" })).toBeNull();
    expect(validateTargetRequest(base)).toBeNull();
  });

  it("requires workspace_root to be absolute", () => {
    expect(validateTargetRequest({ ...base, workspace_root: "relative/path" })).toBe(
      "workspace_root must be an absolute path",
    );
  });

  it("requires workspace_root to be clean", () => {
    const unclean = ["/srv/loomux/", "/srv/./loomux", "/srv/../loomux", "/srv//loomux"];
    for (const workspace_root of unclean) {
      expect(validateTargetRequest({ ...base, workspace_root })).toBe(
        "workspace_root must be a clean path (no ., .. or trailing /)",
      );
    }
  });

  it("rejects / as workspace_root", () => {
    expect(validateTargetRequest({ ...base, workspace_root: "/" })).toBe(
      "workspace_root must not be /",
    );
  });
});

describe("compareTargets", () => {
  it("sorts by name, then id", () => {
    const rows = [
      { name: "zulu", id: "b" },
      { name: "alpha", id: "b" },
      { name: "alpha", id: "a" },
    ];
    expect([...rows].sort(compareTargets).map((r) => `${r.name}:${r.id}`)).toEqual([
      "alpha:a",
      "alpha:b",
      "zulu:b",
    ]);
  });
});

describe("formatDestination", () => {
  it("reads user@host for a remote target", () => {
    expect(formatDestination({ kind: "remote", host: "h", user: "u" })).toBe("u@h");
  });

  it("names the local host", () => {
    expect(formatDestination({ kind: "local", host: "", user: "" })).toBe("this host");
  });

  it("falls back to whichever half is present", () => {
    expect(formatDestination({ kind: "remote", host: "h", user: "" })).toBe("h");
    expect(formatDestination({ kind: "remote", host: "", user: "u" })).toBe("u");
    expect(formatDestination({ kind: "remote", host: "", user: "" })).toBe("—");
  });
});

describe("kindBadgeClasses", () => {
  it("colours remote and local differently", () => {
    expect(kindBadgeClasses("remote")).toContain("bg-blue-100");
    expect(kindBadgeClasses("local")).toContain("bg-neutral-200");
    expect(kindBadgeClasses("future-kind")).toContain("bg-neutral-100");
  });
});

describe("matchesKindFilter", () => {
  it("passes everything for all", () => {
    expect(matchesKindFilter("remote", "all")).toBe(true);
    expect(matchesKindFilter("local", "all")).toBe(true);
  });

  it("matches on exact kind otherwise", () => {
    expect(matchesKindFilter("remote", "remote")).toBe(true);
    expect(matchesKindFilter("local", "remote")).toBe(false);
  });
});

describe("describePolicy", () => {
  it("summarises a non-default policy and says nothing for the default", () => {
    expect(describePolicy(makeTarget())).toBe("work machine · no new workspaces · only claude-code · asks before new work");
    expect(
      describePolicy(makeTarget({ purpose: "", allowed_agent_types: [], allow_provision: true, require_confirmation: false })),
    ).toBe("");
  });
});
