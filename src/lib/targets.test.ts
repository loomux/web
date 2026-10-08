import { describe, expect, it } from "vitest";
import type { Target } from "./api";
import {
  defaultRelay,
  compareTargets,
  describePolicy,
  formatDestination,
  targetFormFromTarget,
  toTargetRequest,
  validateTargetRequest,
  validManagedHost,
  EMPTY_TARGET_FORM,
  type TargetFormValues,
} from "./targets";

function makeTarget(overrides: Partial<Target> = {}): Target {
  return {
    id: "tgt-1",
    name: "alpha",
    kind: "remote",
    host: "alpha.example",
    user: "agent",
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
    workspace_root: "",
    permission_mode: "",
    purpose: "",
    allowed_agent_types: "",
    allow_provision: true,
    allow_shell: true,
    require_confirmation: false,
    relay: "",
    ssh_port: "",
    ssh_access: "config",
    ssh_proxy: "",
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
      workspace_root: "/srv/loomux",
      permission_mode: "manual",
      purpose: "work",
      allowed_agent_types: "claude-code",
      allow_provision: false,
      allow_shell: true,
      require_confirmation: true,
      relay: "",
      ssh_port: "",
      ssh_access: "config",
      ssh_proxy: "",
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
      form({ name: "  alpha  ", host: " h ", user: " u ", workspace_root: " /srv " }),
    );
    expect(req).toMatchObject({ name: "alpha", host: "h", user: "u", workspace_root: "/srv" });
  });

  it("blanks host and user for a local target", () => {
    const req = toTargetRequest(form({ kind: "local" }));
    expect(req.host).toBe("");
    expect(req.user).toBe("");
  });

  it("keeps workspace_root on an edit, and sends no ssh_key_ref (removed in API v1)", () => {
    const req = toTargetRequest(form({ workspace_root: "/srv/loomux" }));
    expect(req).not.toHaveProperty("ssh_key_ref");
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
  const base = { name: "alpha", kind: "remote", host: "h", user: "u" };

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
      'permission_mode must be empty, "auto", "accept_edits" or "manual"',
    );
  });

  // The API spells it accept_edits since its v1 freeze; servers before
  // said accept-edits. Both read into the form, and a request sends the
  // legacy spelling, which every server accepts.
  it("reads permission_mode in either spelling and sends the one every server takes", () => {
    for (const stored of ["accept_edits", "accept-edits"]) {
      const values = targetFormFromTarget(makeTarget({ permission_mode: stored }));
      expect(values.permission_mode).toBe("accept_edits");
      const req = toTargetRequest(values);
      expect(req.permission_mode).toBe("accept-edits");
      expect(validateTargetRequest(req)).toBeNull();
    }
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
  it("adds a port that isn't the SSH config's", () => {
    expect(formatDestination({ kind: "remote", host: "kestrel.corp.example", user: "ci", ssh_port: 2222 })).toBe("ci@kestrel.corp.example:2222");
  });

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

describe("describePolicy", () => {
  it("summarises a non-default policy and says nothing for the default", () => {
    expect(describePolicy(makeTarget())).toBe("Work machine, no new workspaces, only claude-code, asks before new work.");
    expect(
      describePolicy(makeTarget({ purpose: "", allowed_agent_types: [], allow_provision: true, require_confirmation: false })),
    ).toBe("");
  });
});

describe("relay and SSH port", () => {
  it("defaults relay to nothing for a work machine and everything otherwise", () => {
    expect(defaultRelay("work")).toBe("none");
    expect(defaultRelay("")).toBe("full");
    expect(defaultRelay("personal")).toBe("full");
  });

  it("round-trips relay and the SSH port", () => {
    const f = targetFormFromTarget(makeTarget({ relay: "last_message", ssh_port: 2222 }));
    expect(f).toMatchObject({ relay: "last_message", ssh_port: "2222" });
    expect(toTargetRequest(f)).toMatchObject({ relay: "last_message", ssh_port: 2222 });
  });

  it("sends port 0 (the SSH config's) when blank, and for a local target", () => {
    expect(toTargetRequest(form({ ssh_port: " " })).ssh_port).toBe(0);
    expect(toTargetRequest(form({ kind: "local", ssh_port: "22" })).ssh_port).toBe(0);
  });

  it("rejects a port that isn't one", () => {
    expect(validateTargetRequest(toTargetRequest(form({ ssh_port: "70000" })))).toMatch(/ssh_port/);
    expect(validateTargetRequest(toTargetRequest(form({ ssh_port: "ab" })))).toMatch(/ssh_port/);
    expect(validateTargetRequest(toTargetRequest(form({ ssh_port: "2222" })))).toBeNull();
  });

  it("reads an unknown stored relay as the default", () => {
    expect(targetFormFromTarget(makeTarget({ relay: "everything" })).relay).toBe("");
  });
});

// LOOM-138: how Loomux signs in to a machine.
describe("SSH access", () => {
  it("defaults a new machine to a Loomux key, through the server's proxy", () => {
    expect(EMPTY_TARGET_FORM.ssh_access).toBe("managed");
    expect(EMPTY_TARGET_FORM.ssh_proxy).toBe("");
  });

  it("asks for a key of its own when registering a managed machine", () => {
    expect(toTargetRequest(form({ ssh_access: "managed" }), { isNew: true })).toMatchObject({ generate_ssh_key: true, ssh_proxy: "default" });
    expect(toTargetRequest(form({ ssh_access: "managed", ssh_proxy: "none" }), { isNew: true })).toMatchObject({ ssh_proxy: "none" });
  });

  it("sends nothing about keys for the SSH config or a local machine", () => {
    for (const req of [
      toTargetRequest(form({ ssh_access: "config" }), { isNew: true }),
      toTargetRequest(form({ kind: "local", ssh_access: "managed" }), { isNew: true }),
    ]) {
      expect(req.generate_ssh_key).toBeUndefined();
      expect(req.ssh_key_id).toBeUndefined();
      expect(req.ssh_proxy).toBeUndefined();
    }
  });

  it("keeps a managed machine's key on an edit, and its proxy choice", () => {
    const req = toTargetRequest(form({ ssh_access: "managed", ssh_proxy: "none" }));
    expect(req.generate_ssh_key).toBeUndefined();
    expect(req.ssh_key_id).toBeUndefined(); // omitted: the server keeps it
    expect(req.ssh_proxy).toBe("none");
  });

  it("reads the access back from a stored machine", () => {
    expect(targetFormFromTarget(makeTarget({ ssh_mode: "managed", ssh_proxy: "none" }))).toMatchObject({ ssh_access: "managed", ssh_proxy: "none" });
    expect(targetFormFromTarget(makeTarget({ ssh_mode: "config", ssh_proxy: "default" }))).toMatchObject({ ssh_access: "config", ssh_proxy: "" });
    // Older servers say nothing: the SSH config.
    expect(targetFormFromTarget(makeTarget())).toMatchObject({ ssh_access: "config" });
  });

  it("holds a managed machine's host to a real name or address, as the server does", () => {
    for (const host of ["wyzer", "wyzer.tail78a87c.ts.net", "10.0.0.7", "fd7a:115c:a1e0::1", "a-b.c-d"]) {
      expect(validManagedHost(host), host).toBe(true);
    }
    for (const host of ["a_b", "a;id", "$(id)", "%h", "-x", "a..b", ".a", "a.", "a b", "[::1]", "a:22", "é.example", "a".repeat(64)]) {
      expect(validManagedHost(host), host).toBe(false);
    }
    const managed = toTargetRequest(form({ ssh_access: "managed", host: "a_b" }), { isNew: true });
    expect(validateTargetRequest(managed)).toBe(
      "host must be a host name (letters, digits and -, dot-separated) or an IP address for a target with a Loomux SSH key",
    );
    expect(validateTargetRequest(toTargetRequest(form({ ssh_access: "managed", host: "a_b" })), { managed: true })).not.toBeNull();
    // An alias stays fine for the SSH config.
    expect(validateTargetRequest(toTargetRequest(form({ host: "a_b" }), { isNew: true }))).toBeNull();
  });
});
