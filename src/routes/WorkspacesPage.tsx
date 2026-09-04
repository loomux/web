import { useQuery } from "@tanstack/react-query";
import { useApiClient } from "../lib/useApiClient";

export function WorkspacesPage() {
  const apiClient = useApiClient();
  const { data, isLoading, error } = useQuery({
    queryKey: ["workspaces"],
    queryFn: apiClient.listWorkspaces,
  });

  if (isLoading) return <p className="p-4 text-neutral-500">Loading workspaces…</p>;
  if (error) return <p className="p-4 text-red-600">{(error as Error).message}</p>;

  return (
    <div className="p-4 space-y-2">
      <h1 className="text-lg font-semibold">Workspaces</h1>
      {data?.workspaces.length === 0 && (
        <p className="text-neutral-500">No workspaces registered yet.</p>
      )}
      <ul className="divide-y divide-neutral-200 dark:divide-neutral-800">
        {data?.workspaces.map((ws) => (
          <li key={ws.id} className="py-3 flex items-center justify-between">
            <div>
              <p className="font-medium">{ws.name}</p>
              <p className="text-sm text-neutral-500">target: {ws.target_id}</p>
            </div>
            <span className="text-sm rounded-full border border-neutral-300 px-2 py-0.5 dark:border-neutral-700">
              {ws.status}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
