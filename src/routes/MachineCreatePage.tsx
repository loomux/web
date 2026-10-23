import { useId, useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import type { MachineRequest, Plugin } from "../lib/api";
import { canCreateMachines, EGRESS, machineChoices, machineRequest, TRUSTED_WARNING } from "../lib/plugins";
import { EMPTY_TARGET_FORM, type TargetFormValues } from "../lib/targets";
import { useApiClient } from "../lib/useApiClient";
import { useDocumentTitle } from "../lib/useDocumentTitle";
import { PolicyFields, RelayFields } from "../machines/MachineForm";
import { Button } from "../ui/Button";
import { Switch } from "../ui/Switch";

// Creating a machine (/machines/create?plugin=<instance id>, design
// target-providers.md §6): a plugin instance makes it, so there is no host,
// user or key to give: a name, its size, whether it keeps its data, its
// network, and the usual policy. Create opens the machine, whose page
// follows it coming up (Creating → Starting → Ready).

const INPUT = "min-h-11 w-full min-w-0 rounded-control border border-line-strong bg-surface-2 px-3 text-ink placeholder:text-ink-3";

function CreateForm({ plugin, others }: { plugin: Plugin; others: Plugin[] }) {
  const id = useId();
  const apiClient = useApiClient();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [values, setValues] = useState<TargetFormValues>(EMPTY_TARGET_FORM);
  const [size, setSize] = useState("");
  const [keep, setKeep] = useState<boolean | null>(null);
  const [egress, setEgress] = useState("");
  const [trustedOK, setTrustedOK] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const describe = useQuery({ queryKey: ["plugin-machines", plugin.id], queryFn: () => apiClient.describeMachines(plugin.id), retry: false });
  const choices = machineChoices(plugin, describe.data ?? null, values.name);
  const persistent = keep ?? choices.persistentDefault;
  // A choice no longer offered (trusted, once the name changes) falls back.
  const chosenEgress = choices.egress.includes(egress) ? egress : (choices.egress[0] ?? "");
  const trusted = chosenEgress === "trusted";
  const onChange = (p: Partial<TargetFormValues>) => setValues((v) => ({ ...v, ...p }));

  const create = useMutation({
    mutationFn: (body: MachineRequest) => apiClient.createMachine(body),
    onSuccess: async (t) => {
      await queryClient.invalidateQueries({ queryKey: ["targets"] });
      void queryClient.invalidateQueries({ queryKey: ["plugins"] });
      navigate(`/machines/${t.id}`);
    },
    onError: (err) => setError(err instanceof Error ? err.message : "Couldn't create it."),
  });

  function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!values.name.trim()) {
      setError("Give it a name.");
      return;
    }
    if (trusted && !trustedOK) {
      setError("Confirm that this machine may reach your LAN and the tailnet, or pick another network.");
      return;
    }
    create.mutate(
      machineRequest(values, {
        id: plugin.id,
        ...(size.trim() ? { size: size.trim() } : {}),
        ...(choices.canChooseKeep ? { persistent } : {}),
        ...(chosenEgress ? { egress: chosenEgress } : {}),
      }),
    );
  }

  return (
    <form onSubmit={submit} aria-label="Create machine" className="mt-6 flex flex-col gap-5">
      {others.length > 1 && (
        <div className="flex flex-col gap-1">
          <label htmlFor={`${id}-plugin`} className="font-bold text-ink">
            Made by
          </label>
          <select
            id={`${id}-plugin`}
            className={INPUT}
            value={plugin.id}
            onChange={(e) => navigate(`/machines/create?plugin=${encodeURIComponent(e.target.value)}`, { replace: true })}
          >
            {others.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label} ({p.name})
              </option>
            ))}
          </select>
        </div>
      )}
      <div className="flex flex-col gap-1">
        <label htmlFor={`${id}-name`} className="font-bold text-ink">
          Name
        </label>
        <input
          id={`${id}-name`}
          className={INPUT}
          value={values.name}
          onChange={(e) => onChange({ name: e.target.value })}
          autoCapitalize="none"
          spellCheck={false}
          placeholder="builds"
        />
        <p className="text-sm text-ink-3">What you and the router call it, like a registered machine.</p>
      </div>

      <fieldset className="flex flex-col gap-2">
        <legend className="font-bold text-ink">Size</legend>
        {choices.sizesKnown ? (
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            {choices.sizes.map((s, i) => {
              const selected = size === s.name || (size === "" && i === 0);
              return (
                <label
                  key={s.name}
                  className={`flex min-h-11 cursor-pointer flex-col rounded-card border p-3 ${selected ? "border-accent bg-surface-2" : "border-line"}`}
                >
                  <span className="flex items-center gap-2">
                    <input type="radio" name={`${id}-size`} className="size-5" checked={selected} onChange={() => setSize(s.name)} />
                    <b className="text-ink">{s.name}</b>
                  </span>
                  {s.detail && <span className="text-sm text-ink-2">{s.detail}</span>}
                </label>
              );
            })}
          </div>
        ) : (
          <>
            <input aria-label="Size" className={INPUT} value={size} onChange={(e) => setSize(e.target.value)} placeholder="The plugin's default" autoCapitalize="none" />
            <p className="text-sm text-ink-3">
              Empty: the plugin's first size. This server doesn't list its sizes; if the name is wrong, the answer says which ones there are.
            </p>
          </>
        )}
      </fieldset>

      {choices.canChooseKeep && (
        <Switch
          label="Keep its data"
          description={persistent ? "Its disk stays when it's stopped; delete the machine to throw it away." : "Throwaway: stopping it destroys it, with everything on it."}
          isSelected={persistent}
          onChange={setKeep}
        />
      )}

      {choices.egress.length > 0 && (
        <fieldset className="flex flex-col gap-2">
          <legend className="font-bold text-ink">Network</legend>
          {choices.egress.map((e) => (
            <label key={e} className={`flex min-h-11 cursor-pointer items-start gap-2 rounded-card border p-3 ${chosenEgress === e ? "border-accent bg-surface-2" : "border-line"}`}>
              <input type="radio" name={`${id}-egress`} className="mt-1 size-5" checked={chosenEgress === e} onChange={() => setEgress(e)} />
              <span>
                <b className={e === "trusted" ? "text-bad" : "text-ink"}>{EGRESS[e]?.label ?? e}</b>
                <span className="block text-sm text-ink-2">{EGRESS[e]?.description ?? ""}</span>
              </span>
            </label>
          ))}
          {trusted && (
            <div role="alert" className="flex flex-col gap-2 rounded-card border border-bad/40 bg-bad-soft p-3 text-sm text-ink">
              <p>{TRUSTED_WARNING}</p>
              <label className="flex min-h-11 items-start gap-2">
                <input type="checkbox" className="mt-0.5 size-5" checked={trustedOK} onChange={(e) => setTrustedOK(e.target.checked)} />
                <span className="font-bold">{values.name.trim() || "This machine"} may reach my LAN and the tailnet.</span>
              </label>
            </div>
          )}
          {!choices.fromDescribe && (
            <p className="text-sm text-ink-3">
              {choices.egress.includes("trusted")
                ? "Trusted is offered because this plugin's trusted_machines setting names this machine."
                : "Trusted appears only for a name this plugin's trusted_machines setting lists."}
            </p>
          )}
        </fieldset>
      )}

      <details className="rounded-card border border-line bg-surface p-4">
        <summary className="min-h-9 cursor-pointer font-bold text-ink">What may run there, and what the router sees</summary>
        <div className="mt-4 flex flex-col gap-5">
          <PolicyFields values={values} onChange={onChange} />
          <RelayFields values={values} onChange={onChange} />
        </div>
      </details>

      {error && (
        <p role="alert" className="text-bad">
          {error}
        </p>
      )}
      <div className="flex flex-wrap gap-3 pb-8">
        <Button type="submit" variant="primary" isPending={create.isPending} pendingLabel="Creating…">
          Create machine
        </Button>
        <Button variant="quiet" onPress={() => navigate("/machines")}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

export function MachineCreatePage() {
  useDocumentTitle("Create machine");
  const apiClient = useApiClient();
  const [params] = useSearchParams();
  const plugins = useQuery({ queryKey: ["plugins"], queryFn: apiClient.listPlugins, retry: false });
  const able = (plugins.data?.plugins ?? []).filter(canCreateMachines);
  const wanted = params.get("plugin");
  const plugin = able.find((p) => p.id === wanted) ?? (wanted ? undefined : able[0]);

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-5 md:px-8 md:py-8">
      <Link to="/machines" className="inline-flex min-h-9 items-center text-sm font-bold text-accent">
        <span aria-hidden="true">‹&nbsp;</span>Machines
      </Link>
      <h1 className="text-[1.75rem] font-extrabold text-ink">Create machine</h1>
      {plugin ? (
        <p className="text-ink-2">
          Made by <b className="text-ink">{plugin.label}</b> ({plugin.name}). It comes up in the background; its page shows how far it got.
        </p>
      ) : null}
      {plugins.isLoading && <p className="mt-6 text-ink-3">Loading…</p>}
      {plugins.isError && (
        <p role="alert" className="mt-6 rounded-card border border-bad/40 bg-bad-soft p-4 text-bad">
          Couldn't load the plugins. Check that Loomux is reachable, then reload.
        </p>
      )}
      {plugins.data && !plugin && (
        <div className="mt-6 rounded-card border border-dashed border-line px-5 py-8 text-center">
          <p className="font-bold text-ink">{wanted ? "That plugin can't make machines right now." : "No plugin can make machines yet."}</p>
          <p className="mt-1 text-ink-2">
            Install or fix one in{" "}
            <Link to="/settings/plugins" className="font-bold text-accent">
              Settings › Plugins
            </Link>
            : it must be enabled, running and pass its check.
          </p>
        </div>
      )}
      {plugin && <CreateForm key={plugin.id} plugin={plugin} others={able} />}
    </div>
  );
}
