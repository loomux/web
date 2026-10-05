import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "react-router-dom";
import { useApiClient } from "../lib/useApiClient";
import { WebClientUpdate } from "../components/WebClientUpdate";
import {
  compareConversationSummaries,
  formatStatusLabel,
  matchesStatusFilter,
  statusBadgeClasses,
} from "../lib/conversations";

function formatLastUsed(iso?: string): string {
  if (!iso) return "Unknown";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "Unknown";
  return date.toLocaleDateString();
}

export function DashboardPage() {
  const apiClient = useApiClient();
  const navigate = useNavigate();

  const { data: conversationsData, isLoading: conversationsLoading, error: conversationsError } = useQuery({
    queryKey: ["conversations"],
    queryFn: apiClient.listConversations,
  });

  const { data: workspacesData, isLoading: workspacesLoading, error: workspacesError } = useQuery({
    queryKey: ["workspaces"],
    queryFn: apiClient.listWorkspaces,
  });

  const workspaceNameById = useMemo(() => {
    const map = new Map<string, string>();
    workspacesData?.workspaces?.forEach((ws) => map.set(ws.id, ws.name));
    return map;
  }, [workspacesData]);

  const attentionConversations = useMemo(() => {
    const conversations = conversationsData?.conversations ?? [];
    return [...conversations]
      .filter((c) => matchesStatusFilter(c.status, "needs-you"))
      .sort(compareConversationSummaries);
  }, [conversationsData]);

  return (
    <div className="p-4 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold">Dashboard</h1>
        <button
          onClick={() => navigate(`/conversations/${crypto.randomUUID()}`)}
          className="rounded bg-neutral-900 px-3 py-1.5 text-sm text-white dark:bg-neutral-100 dark:text-neutral-900"
        >
          New conversation
        </button>
      </div>

      <section>
        <h2 className="mb-3 text-sm font-medium text-neutral-500 uppercase tracking-wide">
          Needs attention
        </h2>
        {conversationsLoading ? (
          <p className="text-neutral-500">Loading conversations…</p>
        ) : conversationsError ? (
          <p className="text-red-600">{(conversationsError as Error).message}</p>
        ) : attentionConversations.length === 0 ? (
          <p className="text-neutral-500">No conversations need your attention right now.</p>
        ) : (
          <ul className="divide-y divide-neutral-200 dark:divide-neutral-800">
            {attentionConversations.map((c) => {
              const workspaceName = workspaceNameById.get(c.workspace_id);
              return (
                <li key={c.conversation_id} className="py-3">
                  <Link
                    to={`/conversations/${c.conversation_id}`}
                    className="flex items-center justify-between hover:underline"
                  >
                    <div>
                      <p className="font-medium">{workspaceName ?? c.workspace_id}</p>
                      <p className="text-sm text-neutral-500">{c.conversation_id}</p>
                    </div>
                    <span className={`text-sm rounded-full px-2 py-0.5 ${statusBadgeClasses(c.status)}`}>
                      {formatStatusLabel(c.status)}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section>
        <h2 className="mb-3 text-sm font-medium text-neutral-500 uppercase tracking-wide">
          Workspace health
        </h2>
        {workspacesLoading ? (
          <p className="text-neutral-500">Loading workspaces…</p>
        ) : workspacesError ? (
          <p className="text-red-600">{(workspacesError as Error).message}</p>
        ) : workspacesData?.workspaces.length === 0 ? (
          <p className="text-neutral-500">No workspaces registered.</p>
        ) : (
          <div className="flex gap-3 overflow-x-auto pb-2">
            {workspacesData?.workspaces.map((ws) => (
              <div
                key={ws.id}
                className="min-w-[16rem] flex-1 rounded border border-neutral-200 p-3 dark:border-neutral-800"
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="font-medium truncate">{ws.name}</p>
                  <span className="text-sm rounded-full border border-neutral-300 px-2 py-0.5 dark:border-neutral-700">
                    {ws.status}
                  </span>
                </div>
                {ws.rolling_summary && (
                  <p className="mt-2 line-clamp-2 text-sm text-neutral-600 dark:text-neutral-400">
                    {ws.rolling_summary}
                  </p>
                )}
                {ws.tags && ws.tags.length > 0 && (
                  <p className="mt-2 flex flex-wrap gap-1">
                    {ws.tags.map((tag) => (
                      <span
                        key={tag}
                        className="rounded bg-neutral-100 px-1.5 py-0.5 text-xs text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400"
                      >
                        {tag}
                      </span>
                    ))}
                  </p>
                )}
                <p className="mt-2 text-xs text-neutral-500">
                  Last used: {formatLastUsed(ws.last_used_at)}
                  {ws.is_dynamic && (
                    <span className="ml-2 rounded bg-neutral-100 px-1.5 py-0.5 dark:bg-neutral-800">
                      dynamic
                    </span>
                  )}
                </p>
              </div>
            ))}
          </div>
        )}
      </section>

      <WebClientUpdate />
    </div>
  );
}
