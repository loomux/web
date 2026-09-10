import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "react-router-dom";
import { useApiClient } from "../lib/useApiClient";
import {
  compareConversationSummaries,
  FILTER_OPTIONS,
  formatStatusLabel,
  matchesStatusFilter,
  statusBadgeClasses,
  type FilterKey,
} from "../lib/conversations";

export function ConversationsPage() {
  const apiClient = useApiClient();
  const navigate = useNavigate();
  const [filter, setFilter] = useState<FilterKey>("all");

  const { data, isLoading, error } = useQuery({
    queryKey: ["conversations"],
    queryFn: apiClient.listConversations,
  });

  const { data: workspacesData } = useQuery({
    queryKey: ["workspaces"],
    queryFn: apiClient.listWorkspaces,
  });

  const workspaceNameById = useMemo(() => {
    const map = new Map<string, string>();
    workspacesData?.workspaces.forEach((ws) => map.set(ws.id, ws.name));
    return map;
  }, [workspacesData]);

  const visibleConversations = useMemo(() => {
    const conversations = data?.conversations ?? [];
    return [...conversations]
      .filter((c) => matchesStatusFilter(c.status, filter))
      .sort(compareConversationSummaries);
  }, [data, filter]);

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold">Conversations</h1>
        <button
          onClick={() => navigate(`/conversations/${crypto.randomUUID()}`)}
          className="rounded bg-neutral-900 px-3 py-1.5 text-sm text-white dark:bg-neutral-100 dark:text-neutral-900"
        >
          New conversation
        </button>
      </div>

      <div className="flex flex-wrap gap-2">
        {FILTER_OPTIONS.map((option) => (
          <button
            key={option.key}
            onClick={() => setFilter(option.key)}
            className={
              "rounded-full border px-3 py-1 text-sm " +
              (filter === option.key
                ? "border-neutral-900 bg-neutral-900 text-white dark:border-neutral-100 dark:bg-neutral-100 dark:text-neutral-900"
                : "border-neutral-300 bg-white text-neutral-700 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-300")
            }
          >
            {option.label}
          </button>
        ))}
      </div>

      {isLoading && <p className="text-neutral-500">Loading…</p>}
      {error && <p className="text-red-600">{(error as Error).message}</p>}
      {!isLoading && !error && visibleConversations.length === 0 && (
        <p className="text-neutral-500">
          {filter === "all"
            ? "No conversations yet — start one above."
            : "No conversations match this filter."}
        </p>
      )}

      <ul className="divide-y divide-neutral-200 dark:divide-neutral-800">
        {visibleConversations.map((c) => {
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
    </div>
  );
}
