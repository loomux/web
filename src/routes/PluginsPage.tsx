import { useMemo, useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { ApiError, PluginCheckError, type AvailablePlugin, type Plugin, type PluginCheck } from "../lib/api";
import { buildConfig, initialValues, schemaFields, type FormValues } from "../lib/pluginSchema";
import { canCreateMachines, capabilityWords, isolationLine, needsTrustConfirmation, pluginState, trustLine, upgradeAvailable } from "../lib/plugins";
import { useApiClient } from "../lib/useApiClient";
import { useDocumentTitle } from "../lib/useDocumentTitle";
import { ConfigForm } from "../plugins/ConfigForm";
import { Button } from "../ui/Button";
import { StatusShapeIcon } from "../ui/StatusMark";

// Plugins (Settings › Plugins, server LOOM-178, design target-providers.md
// §6): the installed instances with their state and check, configure,
// enable/disable, check, upgrade and uninstall; and the catalog, each
// entry with what it is, who vouches for it and what it may do, and
// Install. Secrets in a configuration are write-only (ConfigForm).

const INPUT = "min-h-11 w-full min-w-0 rounded-control border border-line-strong bg-surface-2 px-3 text-ink placeholder:text-ink-3";

// server plugins.ValidPluginLabel
const LABEL = /^[a-z0-9][a-z0-9-]{0,31}$/;

const SHAPE = { good: "check", mari: "diamond", bad: "cross", muted: "square" } as const;

function message(err: unknown, what: string): string {
  if (err instanceof ApiError && err.status === 503) return "This server has no LOOMUX_MASTER_KEY, so it can't keep plugin settings.";
  return err instanceof Error ? `${what}: ${err.message}` : `${what} failed.`;
}

function StateLine({ label, tone }: { label: string; tone: keyof typeof SHAPE }) {
  return (
    <p className="flex items-start gap-1.5 text-sm text-ink-2">
      <span className="mt-0.5">
        <StatusShapeIcon shape={SHAPE[tone]} tone={tone} />
      </span>
      <span className="min-w-0 break-words">{label}</span>
    </p>
  );
}

function Problems({ check }: { check: PluginCheck | null }) {
  if (!check || check.problems.length === 0) return null;
  return (
    <ul className="flex flex-col gap-1">
      {check.problems.map((p) => (
        <li
          key={p.code + p.message}
          className={`rounded-control border px-3 py-2 text-sm ${p.severity === "warning" ? "border-mari/40 bg-mari-soft text-ink" : "border-bad/40 bg-bad-soft text-bad"}`}
        >
          <b>{p.severity === "warning" ? "Warning" : "Problem"}:</b> {p.message} <span className="font-mono text-ink-3">({p.code})</span>
        </li>
      ))}
    </ul>
  );
}

function useInvalidatePlugins() {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: ["plugins"] });
    void queryClient.invalidateQueries({ queryKey: ["plugins-available"] });
    void queryClient.invalidateQueries({ queryKey: ["targets"] });
  };
}

function ConfigurePanel({ plugin, schema, onDone }: { plugin: Plugin; schema: unknown; onDone: () => void }) {
  const apiClient = useApiClient();
  const invalidate = useInvalidatePlugins();
  const fields = useMemo(() => schemaFields(schema), [schema]);
  const [values, setValues] = useState<FormValues>(() => initialValues(fields, plugin.config));
  const [clear, setClear] = useState<Set<string>>(new Set());
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [check, setCheck] = useState<PluginCheck | null>(null);

  const save = useMutation({
    mutationFn: (config: Record<string, unknown>) => apiClient.setPluginConfig(plugin.id, config),
    onSuccess: () => {
      invalidate();
      onDone();
    },
    onError: (err) => {
      if (err instanceof PluginCheckError) {
        // Saved, but it can't work this way: show why, keep the form open.
        invalidate();
        setCheck(err.plugin.check);
        setError(`Saved, but ${plugin.label} can't work this way${err.plugin.status_reason ? `: ${err.plugin.status_reason}` : "."}`);
        return;
      }
      setError(message(err, "Couldn't save"));
    },
    // Whatever happened, typed secrets don't stay in the page.
    onSettled: () => setValues((v) => Object.fromEntries(Object.entries(v).map(([k, x]) => [k, fields.find((f) => f.key === k)?.secret ? "" : x]))),
  });

  function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setCheck(null);
    const built = buildConfig(fields, values, { mode: "configure", clear, config: plugin.config });
    setErrors(built.errors);
    if (Object.keys(built.errors).length > 0) return;
    save.mutate(built.config);
  }

  return (
    <form onSubmit={submit} aria-label={`Configure ${plugin.label}`} className="mt-2 flex flex-col gap-4 border-t border-line pt-4">
      {schema === undefined ? (
        <p className="text-sm text-ink-2">The catalog no longer lists this plugin, so its settings can't be shown as a form here.</p>
      ) : (
        <ConfigForm
          fields={fields}
          values={values}
          onChange={(k, v) => setValues((cur) => ({ ...cur, [k]: v }))}
          errors={errors}
          mode="configure"
          config={plugin.config}
          clear={clear}
          onToggleClear={(k) =>
            setClear((cur) => {
              const next = new Set(cur);
              if (next.has(k)) next.delete(k);
              else next.add(k);
              return next;
            })
          }
        />
      )}
      <Problems check={check} />
      {error && (
        <p role="alert" className="text-bad">
          {error}
        </p>
      )}
      <div className="flex flex-wrap gap-3">
        <Button type="submit" variant="primary" isDisabled={schema === undefined} isPending={save.isPending} pendingLabel="Saving and checking…">
          Save
        </Button>
        <Button variant="quiet" onPress={onDone}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

function UninstallPanel({ plugin, onDone }: { plugin: Plugin; onDone: () => void }) {
  const apiClient = useApiClient();
  const invalidate = useInvalidatePlugins();
  const owns = plugin.machines > 0;
  const [choice, setChoice] = useState<"keep" | "destroy" | null>(null);
  const [typed, setTyped] = useState("");
  const remove = useMutation({
    mutationFn: () => apiClient.uninstallPlugin(plugin.id, owns ? (choice ?? undefined) : undefined),
    onSuccess: () => {
      invalidate();
      onDone();
    },
  });
  const ready = !owns || choice === "keep" || (choice === "destroy" && typed === plugin.label);
  return (
    <div role="group" aria-label={`Uninstall ${plugin.label}`} className="mt-2 flex flex-col gap-3 rounded-card border border-bad/40 p-4">
      <p className="font-bold text-ink">Uninstall {plugin.label}?</p>
      {owns ? (
        <fieldset className="flex flex-col gap-2">
          <legend className="text-sm text-ink-2">
            It made {plugin.machines} machine{plugin.machines === 1 ? "" : "s"}. Choose what happens to {plugin.machines === 1 ? "it" : "them"}:
          </legend>
          <label className="flex min-h-11 items-start gap-2">
            <input type="radio" name={`uninstall-${plugin.id}`} className="mt-1 size-5" checked={choice === "keep"} onChange={() => setChoice("keep")} />
            <span>
              <b className="text-ink">Keep them</b>
              <span className="block text-sm text-ink-2">They stay as plain hosts; nobody can stop, start or update them from Loomux, and you remove them by hand.</span>
            </span>
          </label>
          <label className="flex min-h-11 items-start gap-2">
            <input type="radio" name={`uninstall-${plugin.id}`} className="mt-1 size-5" checked={choice === "destroy"} onChange={() => setChoice("destroy")} />
            <span>
              <b className="text-bad">Destroy them</b>
              <span className="block text-sm text-ink-2">Each machine goes with its data, workspaces, tasks and credentials. This can't be undone.</span>
            </span>
          </label>
          {choice === "destroy" && (
            <label className="flex flex-col gap-1">
              <span className="text-sm text-ink">
                Type <b className="font-mono">{plugin.label}</b> to destroy its machines
              </span>
              <input className={INPUT} value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" spellCheck={false} />
            </label>
          )}
        </fieldset>
      ) : (
        <p className="text-sm text-ink-2">It has no machines. Its process stops and its saved secrets are erased.</p>
      )}
      {remove.error && (
        <p role="alert" className="text-sm text-bad">
          {message(remove.error, "Couldn't uninstall")}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <Button variant="danger" isDisabled={!ready} isPending={remove.isPending} pendingLabel="Uninstalling…" onPress={() => remove.mutate()}>
          {owns && choice === "destroy" ? `Uninstall and destroy ${plugin.machines}` : `Uninstall ${plugin.label}`}
        </Button>
        <Button variant="quiet" onPress={onDone}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

function InstanceCard({ plugin, schema }: { plugin: Plugin; schema: unknown }) {
  const apiClient = useApiClient();
  const invalidate = useInvalidatePlugins();
  const [panel, setPanel] = useState<"configure" | "uninstall" | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const state = pluginState(plugin);
  const trust = trustLine(plugin.trust);
  const action = useMutation({
    mutationFn: (verb: "enable" | "disable" | "upgrade" | "check") => apiClient.pluginAction(plugin.id, verb),
    onSuccess: (p, verb) => {
      invalidate();
      setNote(
        verb === "upgrade"
          ? `Upgraded to ${p.version}. ${trustLine(p.trust).label}.`
          : verb === "check"
            ? p.check?.ok
              ? "The check passed."
              : "The check found problems (below)."
            : null,
      );
    },
    onError: (err, verb) => {
      if (err instanceof PluginCheckError) {
        invalidate();
        setNote(`${verb === "upgrade" ? "The new version failed its check; the old one keeps running" : "Its check failed"}${err.plugin.status_reason ? `: ${err.plugin.status_reason}` : "."}`);
        return;
      }
      // An upgrade whose build attestation doesn't verify (LOOM-218) is a 422
      // naming why; the old version keeps running.
      setNote(message(err, verb === "upgrade" ? "Not upgraded" : `Couldn't ${verb}`));
    },
  });
  return (
    <li aria-label={plugin.label} className="flex flex-col gap-3 rounded-card border border-line bg-surface p-4 shadow-1 md:p-5">
      <header className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="text-lg font-extrabold break-words text-ink">{plugin.label}</h3>
          <p className="text-sm text-ink-2">
            {plugin.name} {plugin.version} · {plugin.source}
            {plugin.machines > 0 && ` · ${plugin.machines} machine${plugin.machines === 1 ? "" : "s"}`}
          </p>
        </div>
        {canCreateMachines(plugin) && (
          <Link
            to={`/machines/create?plugin=${encodeURIComponent(plugin.id)}`}
            className="inline-flex min-h-11 items-center rounded-control bg-accent px-4 font-bold text-accent-ink hover:bg-accent-hover"
          >
            Create a machine
          </Link>
        )}
      </header>
      <StateLine label={state.label} tone={state.tone} />
      <StateLine label={trust.label} tone={trust.tone} />
      {upgradeAvailable(plugin) && <StateLine label={`Version ${plugin.available_version} is available (this one is ${plugin.version}).`} tone="mari" />}
      <Problems check={plugin.check} />
      {note && (
        <p role="status" className="text-sm text-ink">
          {note}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <Button size="sm" onPress={() => setPanel(panel === "configure" ? null : "configure")}>
          Configure
        </Button>
        <Button size="sm" isPending={action.isPending && action.variables === "check"} pendingLabel="Checking…" onPress={() => action.mutate("check")}>
          Check
        </Button>
        {plugin.enabled ? (
          <Button size="sm" variant="quiet" isPending={action.isPending && action.variables === "disable"} pendingLabel="Disabling…" onPress={() => action.mutate("disable")}>
            Disable
          </Button>
        ) : (
          <Button size="sm" variant="quiet" isPending={action.isPending && action.variables === "enable"} pendingLabel="Enabling…" onPress={() => action.mutate("enable")}>
            Enable
          </Button>
        )}
        {upgradeAvailable(plugin) && (
          <Button size="sm" variant="primary" isPending={action.isPending && action.variables === "upgrade"} pendingLabel="Verifying and upgrading…" onPress={() => action.mutate("upgrade")}>
            Upgrade to {plugin.available_version}
          </Button>
        )}
        <Button size="sm" variant="danger" onPress={() => setPanel(panel === "uninstall" ? null : "uninstall")}>
          Uninstall
        </Button>
      </div>
      {!plugin.enabled && plugin.machines > 0 && (
        <p className="text-sm text-ink-2">Its machines keep working as hosts; stopping, starting and updating them wait until it's enabled again.</p>
      )}
      {panel === "configure" && <ConfigurePanel plugin={plugin} schema={schema} onDone={() => setPanel(null)} />}
      {panel === "uninstall" && <UninstallPanel plugin={plugin} onDone={() => setPanel(null)} />}
    </li>
  );
}

function freeLabel(name: string, taken: Set<string>): string {
  if (!taken.has(name)) return name;
  for (let i = 2; ; i++) if (!taken.has(`${name}-${i}`)) return `${name}-${i}`;
}

function CatalogCard({ entry, taken }: { entry: AvailablePlugin; taken: Set<string> }) {
  const apiClient = useApiClient();
  const invalidate = useInvalidatePlugins();
  const fields = useMemo(() => schemaFields(entry.config_schema), [entry.config_schema]);
  const [open, setOpen] = useState(false);
  const [label, setLabel] = useState(() => freeLabel(entry.name, taken));
  const [values, setValues] = useState<FormValues>(() => initialValues(fields));
  const [trusted, setTrusted] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ plugin: Plugin; ok: boolean } | null>(null);
  const trust = trustLine(entry.trust);
  const caps = capabilityWords(entry.capabilities);

  const install = useMutation({
    mutationFn: (config: Record<string, unknown>) => apiClient.installPlugin({ plugin: entry.name, source: entry.source, label, config }),
    onSuccess: (p) => {
      invalidate();
      setResult({ plugin: p, ok: true });
      setOpen(false);
    },
    onError: (err) => {
      if (err instanceof PluginCheckError) {
        invalidate();
        setResult({ plugin: err.plugin, ok: false });
        setOpen(false);
        return;
      }
      // An unverified build (LOOM-218) is a 422 with the reason.
      setError(message(err, err instanceof ApiError && err.status === 422 ? "Not installed: its build couldn't be verified" : "Not installed"));
    },
    onSettled: () => setValues((v) => Object.fromEntries(Object.entries(v).map(([k, x]) => [k, fields.find((f) => f.key === k)?.secret ? "" : x]))),
  });

  function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!LABEL.test(label)) {
      setError("Label: lowercase letters, digits and '-', at most 32, starting with a letter or digit.");
      return;
    }
    if (taken.has(label)) {
      setError(`An instance labelled ${label} is already installed.`);
      return;
    }
    const built = buildConfig(fields, values, { mode: "install" });
    setErrors(built.errors);
    if (Object.keys(built.errors).length > 0) return;
    install.mutate(built.config);
  }

  return (
    <li aria-label={entry.title || entry.name} className="flex flex-col gap-3 rounded-card border border-line bg-surface p-4 md:p-5">
      <header className="min-w-0">
        <h3 className="text-lg font-extrabold break-words text-ink">{entry.title || entry.name}</h3>
        <p className="text-sm text-ink-2">
          {[entry.vendor, entry.version, entry.source].filter(Boolean).join(" · ")}
          {entry.installed.length > 0 && ` · ${entry.installed.length} installed`}
        </p>
      </header>
      {entry.description && <p className="text-ink">{entry.description}</p>}
      <StateLine label={trust.label} tone={trust.tone} />
      <StateLine label={isolationLine(entry.isolation)} tone="muted" />
      {caps && <p className="text-sm text-ink-2">{caps}</p>}
      {entry.incompatible && <StateLine label={`Can't be installed on this server: ${entry.incompatible}`} tone="bad" />}
      {entry.incompatible_warning && <StateLine label={entry.incompatible_warning} tone="mari" />}
      {result && (
        <div role="status" className={`flex flex-col gap-2 rounded-control border p-3 text-sm ${result.ok ? "border-line" : "border-bad/40 bg-bad-soft"}`}>
          <p className="text-ink">
            {result.ok ? `Installed ${result.plugin.label}.` : `Installed ${result.plugin.label}, but its check failed: fix its settings with Configure, below.`}{" "}
            {trustLine(result.plugin.trust).label}.
          </p>
          <Problems check={result.plugin.check} />
        </div>
      )}
      {!open ? (
        <div>
          <Button variant="primary" isDisabled={!!entry.incompatible} onPress={() => setOpen(true)}>
            Install
          </Button>
        </div>
      ) : (
        <form onSubmit={submit} aria-label={`Install ${entry.title || entry.name}`} className="flex flex-col gap-4 border-t border-line pt-4">
          {entry.permissions.length > 0 && (
            <div>
              <h4 className="font-bold text-ink">It will be able to</h4>
              <ul className="mt-1 max-h-48 list-disc overflow-y-auto pl-5 text-sm text-ink-2">
                {entry.permissions.map((p) => (
                  <li key={p.scope + p.detail}>
                    <b className="text-ink">{p.scope}</b>: {p.detail}
                  </li>
                ))}
              </ul>
            </div>
          )}
          <div className="flex flex-col gap-1">
            <label htmlFor={`label-${entry.source}-${entry.name}`} className="font-bold text-ink">
              Label
            </label>
            <input
              id={`label-${entry.source}-${entry.name}`}
              className={`${INPUT} font-mono`}
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              autoCapitalize="none"
              spellCheck={false}
            />
            <p className="text-sm text-ink-3">Names this instance; a plugin can be installed more than once (two Docker hosts).</p>
          </div>
          <ConfigForm fields={fields} values={values} onChange={(k, v) => setValues((cur) => ({ ...cur, [k]: v }))} errors={errors} mode="install" />
          {needsTrustConfirmation(entry) && (
            <label className="flex min-h-11 items-start gap-2 rounded-control border border-mari/40 bg-mari-soft p-3">
              <input type="checkbox" className="mt-1 size-5" checked={trusted} onChange={(e) => setTrusted(e.target.checked)} />
              <span className="text-sm text-ink">
                I trust this plugin. It isn't signed by Loomux, and {isolationLine(entry.isolation).toLowerCase()}
              </span>
            </label>
          )}
          {error && (
            <p role="alert" className="text-bad">
              {error}
            </p>
          )}
          <div className="flex flex-wrap gap-3">
            <Button
              type="submit"
              variant="primary"
              isDisabled={needsTrustConfirmation(entry) && !trusted}
              isPending={install.isPending}
              pendingLabel="Verifying, installing and checking…"
            >
              Install {label || entry.name}
            </Button>
            <Button variant="quiet" onPress={() => setOpen(false)}>
              Cancel
            </Button>
          </div>
        </form>
      )}
    </li>
  );
}

export function PluginsPage() {
  useDocumentTitle("Plugins");
  const apiClient = useApiClient();
  const installed = useQuery({ queryKey: ["plugins"], queryFn: apiClient.listPlugins, retry: false, refetchInterval: 15_000 });
  const available = useQuery({ queryKey: ["plugins-available"], queryFn: apiClient.listAvailablePlugins, retry: false });
  const schemaFor = (p: Plugin) => available.data?.plugins.find((a) => a.name === p.name && a.source === p.source)?.config_schema;
  const taken = new Set((installed.data?.plugins ?? []).map((p) => p.label));
  const unsupported = installed.error instanceof ApiError && installed.error.status === 404;

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-5 md:px-8 md:py-8">
      <Link to="/settings" className="inline-flex min-h-9 items-center text-sm font-bold text-accent">
        <span aria-hidden="true">‹&nbsp;</span>Settings
      </Link>
      <h1 className="text-[1.75rem] font-extrabold text-ink">Plugins</h1>
      <p className="text-ink-2">What makes machines for your agents on demand: a Kubernetes cluster, a Docker host.</p>

      {unsupported && (
        <p className="mt-6 rounded-card border border-line bg-surface p-4 text-ink">This Loomux server has no plugins. Upgrade it to make machines from here.</p>
      )}
      {!unsupported && (
        <>
          <section aria-labelledby="installed" className="mt-6">
            <h2 id="installed" className="text-lg font-extrabold text-ink">
              Installed
            </h2>
            {installed.isLoading && <p className="py-2 text-ink-3">Loading…</p>}
            {installed.isError && (
              <p role="alert" className="mt-2 rounded-card border border-bad/40 bg-bad-soft p-4 text-bad">
                Couldn't load the plugins. Check that Loomux is reachable; this page retries on its own.
              </p>
            )}
            {installed.data && installed.data.plugins.length === 0 && <p className="py-2 text-ink-2">None yet. Install one below.</p>}
            <ul className="mt-3 flex flex-col gap-4">
              {(installed.data?.plugins ?? []).map((p) => (
                <InstanceCard key={p.id} plugin={p} schema={schemaFor(p)} />
              ))}
            </ul>
          </section>
          <section aria-labelledby="catalog" className="mt-8 pb-8">
            <h2 id="catalog" className="text-lg font-extrabold text-ink">
              Available
            </h2>
            {available.isError && (
              <p role="alert" className="mt-2 rounded-card border border-bad/40 bg-bad-soft p-4 text-bad">
                Couldn't load the catalog.
              </p>
            )}
            {available.data && available.data.plugins.length === 0 && <p className="py-2 text-ink-2">The server found no plugins to install.</p>}
            <ul className="mt-3 flex flex-col gap-4">
              {(available.data?.plugins ?? []).map((a) => (
                <CatalogCard key={`${a.source}:${a.name}`} entry={a} taken={taken} />
              ))}
            </ul>
          </section>
        </>
      )}
    </div>
  );
}
