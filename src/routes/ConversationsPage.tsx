import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "react-router-dom";
import { useApiClient } from "../lib/useApiClient";

export function ConversationsPage() {
  const apiClient = useApiClient();
  const navigate = useNavigate();
  const { data, isLoading, error } = useQuery({
    queryKey: ["conversations"],
    queryFn: apiClient.listConversations,
  });

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

      {isLoading && <p className="text-neutral-500">Loading…</p>}
      {error && <p className="text-red-600">{(error as Error).message}</p>}
      {data?.conversations.length === 0 && (
        <p className="text-neutral-500">No conversations yet — start one above.</p>
      )}

      <ul className="divide-y divide-neutral-200 dark:divide-neutral-800">
        {data?.conversations.map((c) => (
          <li key={c.conversation_id} className="py-3">
            <Link
              to={`/conversations/${c.conversation_id}`}
              className="flex items-center justify-between hover:underline"
            >
              <div>
                <p className="font-medium">{c.conversation_id}</p>
                <p className="text-sm text-neutral-500">workspace: {c.workspace_id}</p>
              </div>
              <span className="text-sm rounded-full border border-neutral-300 px-2 py-0.5 dark:border-neutral-700">
                {c.status}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
