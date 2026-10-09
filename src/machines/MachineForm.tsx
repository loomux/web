import { useId } from "react";
import { relayInfo } from "../lib/status";
import { defaultRelay, PERMISSION_MODES, type PermissionMode, type Relay, type TargetFormValues } from "../lib/targets";
import { Segmented } from "../ui/Segmented";
import { Switch } from "../ui/Switch";

// A machine's settings, for registering one and editing it: how to reach
// it, what may run there, and what the router models may see of its work.
// Plain words throughout; the server's field names stay out of sight.

function Field({
  label,
  hint,
  children,
  id,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
  id: string;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <label htmlFor={id} className="font-bold text-ink">
        {label}
      </label>
      {children}
      {hint && <p className="text-sm text-ink-3">{hint}</p>}
    </div>
  );
}

const INPUT = "min-h-11 w-full min-w-0 rounded-control border border-line-strong bg-surface-2 px-3 text-ink placeholder:text-ink-3";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <fieldset className="flex flex-col gap-4 rounded-card border border-line bg-surface p-4 md:p-5">
      <legend className="px-1 text-lg font-extrabold text-ink">{title}</legend>
      {children}
    </fieldset>
  );
}

export function ConnectionFields({
  values,
  onChange,
  isNew,
  managedAvailable = false,
}: {
  values: TargetFormValues;
  onChange: (patch: Partial<TargetFormValues>) => void;
  isNew: boolean;
  // The server can keep a key for a new machine (LOOM-138).
  managedAvailable?: boolean;
}) {
  const id = useId();
  const remote = values.kind === "remote";
  const managedEdit = !isNew && remote && values.ssh_access === "managed";
  return (
    <Section title="Connection">
      <Field id={`${id}-name`} label="Name" hint="What you'll call it in chat, like atlas or my laptop.">
        <input id={`${id}-name`} className={INPUT} value={values.name} onChange={(e) => onChange({ name: e.target.value })} required />
      </Field>
      {isNew && (
        <div className="flex flex-col gap-1">
          <span className="font-bold text-ink">Where it is</span>
          <Segmented
            label="Where it is"
            options={[
              { key: "remote", label: "Over SSH" },
              { key: "local", label: "This host" },
            ]}
            value={values.kind}
            onChange={(k) => onChange({ kind: k })}
          />
        </div>
      )}
      {remote && (
        <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_7rem]">
          <Field id={`${id}-host`} label="Host">
            <input id={`${id}-host`} className={INPUT} value={values.host} onChange={(e) => onChange({ host: e.target.value })} placeholder="atlas.lab.example" />
          </Field>
          <Field id={`${id}-user`} label="User">
            <input id={`${id}-user`} className={INPUT} value={values.user} onChange={(e) => onChange({ user: e.target.value })} placeholder="dev" />
          </Field>
          <Field id={`${id}-port`} label="SSH port">
            <input
              id={`${id}-port`}
              className={INPUT}
              inputMode="numeric"
              value={values.ssh_port}
              onChange={(e) => onChange({ ssh_port: e.target.value })}
              placeholder="22"
            />
          </Field>
        </div>
      )}
      {managedEdit && (
        <p className="text-sm text-ink-2">Changing the host or port means you pin its host key again: the new address is checked like a new machine.</p>
      )}
      {remote && isNew && managedAvailable && (
        <div className="flex flex-col gap-1">
          <span className="font-bold text-ink">How Loomux signs in</span>
          <Segmented
            label="How Loomux signs in"
            options={[
              { key: "managed", label: "A key of its own" },
              { key: "config", label: "The server's SSH config" },
            ]}
            value={values.ssh_access}
            onChange={(k) => onChange({ ssh_access: k })}
          />
          <span className="text-sm text-ink-2">
            {values.ssh_access === "managed"
              ? "Loomux makes a key for this machine. You add its public key to the user's authorized_keys, and the host must be the machine's real name or address."
              : "Signs in the way the deployment's SSH config says, for a host set up there."}
          </span>
        </div>
      )}
      {remote && values.ssh_access === "managed" && (
        <Switch
          label="Through the server's proxy"
          description="On: connect through the proxy the server is set up with (LOOMUX_SSH_PROXY), such as a Tailscale sidecar. Off: connect straight to the host."
          isSelected={values.ssh_proxy !== "none"}
          onChange={(on) => onChange({ ssh_proxy: on ? "" : "none" })}
        />
      )}
      <Field id={`${id}-root`} label="Workspace folder (optional)" hint="Where new workspaces go. Blank: loomux-workspaces in the user's home.">
        <input
          id={`${id}-root`}
          className={`${INPUT} font-mono`}
          value={values.workspace_root}
          onChange={(e) => onChange({ workspace_root: e.target.value })}
          placeholder="/home/agent/loomux-workspaces"
        />
      </Field>
    </Section>
  );
}

export function PolicyFields({ values, onChange }: { values: TargetFormValues; onChange: (patch: Partial<TargetFormValues>) => void }) {
  const id = useId();
  const mode = PERMISSION_MODES.find((m) => m.value === values.permission_mode) ?? PERMISSION_MODES[0];
  return (
    <Section title="What may run here">
      <div className="flex flex-col gap-1">
        <span className="font-bold text-ink">Purpose</span>
        <Segmented
          label="Purpose"
          options={[
            { key: "personal", label: "Personal" },
            { key: "work", label: "Work" },
          ]}
          value={values.purpose === "work" ? "work" : "personal"}
          onChange={(k) => onChange({ purpose: k === "work" ? "work" : "" })}
        />
        <p className="text-sm text-ink-3">
          {values.purpose === "work"
            ? "Agents here run under your work logins. By default the router models see nothing of this machine's work."
            : "Your own machine. By default the router models see its work, to route and summarise it."}
        </p>
      </div>
      <Switch
        label="Allow new workspaces here"
        description="The router may set up new workspaces on this machine."
        isSelected={values.allow_provision}
        onChange={(v) => onChange({ allow_provision: v })}
      />
      <Switch
        label="Allow plain shell commands"
        description="The router may run commands here directly, without an agent."
        isSelected={values.allow_shell}
        onChange={(v) => onChange({ allow_shell: v })}
      />
      <Switch
        label="Ask me before starting new work here"
        description="New work on this machine waits for your approval as an offer."
        isSelected={values.require_confirmation}
        onChange={(v) => onChange({ require_confirmation: v })}
      />
      <Field id={`${id}-agents`} label="Agents allowed (optional)" hint="Comma-separated, like claude-code, codex. Blank: any agent.">
        <input
          id={`${id}-agents`}
          className={INPUT}
          value={values.allowed_agent_types}
          onChange={(e) => onChange({ allowed_agent_types: e.target.value })}
          placeholder="any agent"
        />
      </Field>
      <Field id={`${id}-mode`} label="What agents may do without asking" hint={mode.description}>
        <select
          id={`${id}-mode`}
          className={INPUT}
          value={values.permission_mode}
          onChange={(e) => onChange({ permission_mode: e.target.value as PermissionMode })}
        >
          {PERMISSION_MODES.map((m) => (
            <option key={m.value} value={m.value}>
              {m.label}
            </option>
          ))}
        </select>
      </Field>
    </Section>
  );
}

const RELAY_KEYS = ["default", "full", "last_message", "none"] as const;

export function RelayFields({ values, onChange }: { values: TargetFormValues; onChange: (patch: Partial<TargetFormValues>) => void }) {
  const fallback = defaultRelay(values.purpose);
  const effective = values.relay || fallback;
  return (
    <Section title="What the router models see">
      <p className="text-sm text-ink-2">
        The router and relay models are outside services. This decides how much of this machine's work reaches them.
        Everything sent is redacted first, and the message being routed always reaches the router.
      </p>
      <Segmented
        label="What the router models see"
        options={RELAY_KEYS.map((k) => ({
          key: k,
          label: k === "default" ? `Default (${relayInfo(fallback).label})` : relayInfo(k).label,
        }))}
        value={values.relay === "" ? "default" : values.relay}
        onChange={(k) => onChange({ relay: (k === "default" ? "" : k) as Relay })}
      />
      <p role="status" className="text-sm text-ink">
        <b>{relayInfo(effective).label}:</b> {relayInfo(effective).description}
      </p>
    </Section>
  );
}
