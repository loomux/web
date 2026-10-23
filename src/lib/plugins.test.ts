import { describe, expect, it } from "vitest";
import {
  canCreateMachines,
  capabilityWords,
  machineChoices,
  machinePhase,
  machineRequest,
  machineShape,
  needsTrustConfirmation,
  pluginState,
  trustLine,
  upgradeAvailable,
} from "./plugins";
import { EMPTY_TARGET_FORM } from "./targets";
import { aMachine, aPlugin } from "../test/pluginFixtures";

describe("trust and capabilities", () => {
  it("says who vouches for a plugin", () => {
    expect(trustLine("bundled")).toEqual({ label: "Part of this Loomux release", tone: "good" });
    expect(trustLine("signed:github.com/loomux/server/.github/workflows/image.yml@refs/heads/main").label).toBe(
      "Signed by github.com/loomux/server/.github/workflows/image.yml@refs/heads/main",
    );
    expect(trustLine("pinned:sha256:0123456789abcdef0123456789").label).toBe("Pinned to sha256:0123456789ab…");
    expect(trustLine("unsigned").tone).toBe("mari");
    expect(needsTrustConfirmation({ trust: "unsigned" })).toBe(true);
    expect(needsTrustConfirmation({ trust: "bundled" })).toBe(false);
  });

  it("puts capabilities in plain words", () => {
    expect(capabilityWords(["targets.create", "targets.stop_start", "targets.persistent"])).toBe(
      "Creates machines, can stop and start them and can keep their data.",
    );
    expect(capabilityWords(["unknown"])).toBe("");
  });
});

describe("pluginState", () => {
  it("reports the worst thing first", () => {
    expect(pluginState(aPlugin())).toEqual({ label: "Running", tone: "good" });
    expect(pluginState(aPlugin({ status: "error", status_reason: "kubeconfig unreadable" })).label).toBe("Error: kubeconfig unreadable");
    expect(pluginState(aPlugin({ enabled: false, status: "disabled" })).tone).toBe("muted");
    expect(pluginState(aPlugin({ instance: "restarting", instance_reason: "exit 2" })).label).toBe("Restarting: exit 2");
    expect(pluginState(aPlugin({ check: { ok: false, problems: [{ code: "x", message: "y", severity: "error" }] } })).tone).toBe("bad");
    expect(
      pluginState(aPlugin({ check: { ok: true, problems: [{ code: "network_policy_not_enforced", message: "m", severity: "warning" }] } })).tone,
    ).toBe("mari");
    expect(pluginState(aPlugin({ secrets_unreadable: true })).tone).toBe("bad");
  });

  it("knows when an instance can make machines and when an upgrade waits", () => {
    expect(canCreateMachines(aPlugin())).toBe(true);
    expect(canCreateMachines(aPlugin({ instance: "failed" }))).toBe(false);
    expect(canCreateMachines(aPlugin({ enabled: false }))).toBe(false);
    expect(canCreateMachines(aPlugin({ capabilities: [] }))).toBe(false);
    expect(canCreateMachines(aPlugin({ check: { ok: false, problems: [] } }))).toBe(false);
    expect(upgradeAvailable(aPlugin({ available_version: "0.5.0" }))).toBe(true);
    expect(upgradeAvailable(aPlugin())).toBe(false);
  });
});

describe("machinePhase", () => {
  it("follows a machine coming up, the image pull included", () => {
    expect(machinePhase(aMachine({ status: "creating" }))).toMatchObject({ label: "Creating", busy: true, step: 0, pulling: false });
    expect(machinePhase(aMachine({ status: "creating", status_reason: "pulling the image on node wyzerkube (for 2m10s)" }))).toMatchObject({
      label: "Pulling the image",
      pulling: true,
    });
    expect(machinePhase(aMachine({ status: "starting", progress: "image_pull" })).pulling).toBe(true);
    expect(machinePhase(aMachine())).toMatchObject({ label: "Running", busy: false, step: 2 });
    expect(machinePhase(aMachine({ status: "error", status_reason: "create timed out" }))).toMatchObject({ tone: "bad", busy: false, step: -1 });
    expect(machinePhase(aMachine({ status: "detached" })).busy).toBe(false);
  });

  it("describes a machine's shape", () => {
    expect(machineShape(aMachine())).toBe("medium · keeps its data · internet");
    expect(machineShape(aMachine({ persistent: false, egress: "trusted" }))).toBe("medium · throwaway · trusted network");
  });
});

describe("machineChoices", () => {
  it("uses the instance's targets.describe when the server has it", () => {
    const c = machineChoices(aPlugin(), {
      sizes: [{ name: "small", cpu: "1", memory: "2Gi", disk: "10Gi" }],
      persistent_default: true,
      egress_options: ["internet", "none", "trusted"],
      image: "",
      max_environments: 5,
      environments: 1,
    }, "cc");
    expect(c).toMatchObject({ sizesKnown: true, canChooseKeep: true, persistentDefault: true, egress: ["internet", "none", "trusted"], fromDescribe: true });
    expect(c.sizes[0]).toEqual({ name: "small", detail: "1 CPU · 2Gi · 10Gi disk" });
  });

  it("falls back to the configuration, offering trusted only for a name trusted_machines lists", () => {
    const p = aPlugin({ config: { sizes: { big: { cpu: "8", memory: "16Gi" } }, trusted_machines: "cc, hub" } });
    expect(machineChoices(p, null, "cc").egress).toEqual(["internet", "none", "trusted"]);
    expect(machineChoices(p, null, "builds").egress).toEqual(["internet", "none"]);
    expect(machineChoices(p, null, "").egress).toEqual(["internet", "none"]);
    expect(machineChoices(p, null, "cc").sizes).toEqual([{ name: "big", detail: "8 CPU · 16Gi" }]);
    const noSizes = machineChoices(aPlugin({ capabilities: ["targets.create", "targets.persistent"] }), null, "x");
    expect(noSizes).toMatchObject({ sizesKnown: false, canChooseKeep: false, egress: [] });
  });
});

describe("machineRequest", () => {
  it("sends the name, the policy and the plugin object, never connection fields", () => {
    const body = machineRequest({ ...EMPTY_TARGET_FORM, name: " cc ", host: "x", user: "y", ssh_port: "22", require_confirmation: true, relay: "last_message" }, {
      id: "p-1",
      size: "large",
      persistent: true,
      egress: "trusted",
    });
    expect(body).toMatchObject({ name: "cc", require_confirmation: true, relay: "last_message", plugin: { id: "p-1", size: "large", persistent: true, egress: "trusted" } });
    for (const k of ["kind", "host", "user", "ssh_port", "ssh_key_id", "generate_ssh_key", "ssh_proxy", "workspace_root"]) expect(body).not.toHaveProperty(k);
  });
});
