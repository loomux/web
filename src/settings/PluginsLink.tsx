import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { ApiError } from "../lib/api";
import { pluginState } from "../lib/plugins";
import { useApiClient } from "../lib/useApiClient";

// Settings › Plugins (LOOM-178): how many instances there are and whether
// any needs a look, with the way in. Hidden on a server without plugins.
export function PluginsLink() {
  const apiClient = useApiClient();
  const plugins = useQuery({ queryKey: ["plugins"], queryFn: apiClient.listPlugins, retry: false });
  if (plugins.error instanceof ApiError && plugins.error.status === 404) return null;
  const list = plugins.data?.plugins ?? [];
  const troubled = list.filter((p) => pluginState(p).tone === "bad").length;
  return (
    <section aria-labelledby="plugins" className="rounded-card border border-line bg-surface p-5">
      <h2 id="plugins" className="text-lg font-bold text-ink">
        Plugins
      </h2>
      <p className="mt-1 mb-4 text-sm text-ink-2">
        {plugins.isLoading
          ? "Loading…"
          : plugins.isError
            ? "Couldn't load them."
            : list.length === 0
              ? "None installed. A plugin makes machines on demand: a Kubernetes cluster, a Docker host."
              : `${list.length} installed${troubled > 0 ? `, ${troubled} needing a look` : ""}.`}
      </p>
      <Link
        to="/settings/plugins"
        className="inline-flex min-h-11 items-center rounded-control border border-line px-4 font-bold text-ink hover:bg-surface-2"
      >
        Open plugins
      </Link>
    </section>
  );
}
