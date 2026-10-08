import { useState } from "react";
import type { ConversationTask } from "../lib/api";
import { conversationStatus } from "../lib/status";
import { formatRelativeTime } from "../lib/time";
import { StatusMark } from "../ui/StatusMark";
import { AttachCommand } from "./AttachCommand";
import { PanePanel } from "./PanePanel";

// Every task this conversation ran, newest first, each with its own attach
// command and terminal (principles 5). Today only the latest task got an
// attach command.
function TaskRow({ task, workspace, refresh, live }: { task: ConversationTask; workspace?: string; refresh: string; live: boolean }) {
  const [open, setOpen] = useState<"none" | "attach" | "terminal">("none");
  const isCommand = task.kind === "command";
  const toggle = (which: "attach" | "terminal") => setOpen((o) => (o === which ? "none" : which));
  return (
    <li className="flex flex-col gap-2 border-b border-line py-3 last:border-b-0">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3">
        <span className="font-bold text-ink">{isCommand ? "Command" : task.agent_type || "Agent"}</span>
        <span className="text-xs text-ink-3 tabular-nums">{formatRelativeTime(task.updated_at)}</span>
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-ink-2">
        <StatusMark status={conversationStatus(task.status)} className="font-normal" />
        {workspace && <span>in {workspace}</span>}
      </div>
      {isCommand && task.command && (
        <code title={task.command} className="line-clamp-3 rounded-md bg-sunken px-2 py-1 font-mono text-xs break-all text-ink">
          {task.command}
          {task.exit_code != null && <span className="text-ink-3"> (exit code {task.exit_code})</span>}
        </code>
      )}
      <div className="flex gap-4 text-sm">
        <button type="button" aria-expanded={open === "attach"} onClick={() => toggle("attach")} className="min-h-9 font-bold text-accent">
          Attach
        </button>
        <button type="button" aria-expanded={open === "terminal"} onClick={() => toggle("terminal")} className="min-h-9 font-bold text-accent">
          Terminal
        </button>
      </div>
      {open === "attach" && <AttachCommand taskId={task.id} label="Show the command" />}
      {open === "terminal" && <PanePanel taskId={task.id} running={live} refresh={refresh} />}
    </li>
  );
}

export function TaskList({
  tasks,
  workspaceName,
}: {
  tasks: ConversationTask[];
  workspaceName: (id: string) => string | undefined;
}) {
  if (tasks.length === 0) {
    return <p className="text-sm text-ink-3">No tasks yet. Work the router hands to an agent or a command shows up here.</p>;
  }
  const newest = [...tasks].sort((a, b) => Date.parse(b.updated_at) - Date.parse(a.updated_at));
  // One live terminal per conversation at most: the newest running task's.
  const liveId = newest.find((t) => t.status === "running")?.id;
  return (
    <ul aria-label="Tasks">
      {newest.map((t) => (
        <TaskRow key={t.id} task={t} workspace={workspaceName(t.workspace_id)} refresh={t.updated_at} live={t.id === liveId} />
      ))}
    </ul>
  );
}
