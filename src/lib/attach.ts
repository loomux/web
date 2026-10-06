import type { AttachInfoResponse } from "./api";

// The command a human runs to attach: the server's attach_command, which
// names Loomux's own tmux server, run over ssh (-t: tmux needs a terminal)
// on a remote target, or as-is on the local one (loomuxd's own machine).
export function attachCommand(info: AttachInfoResponse): string {
  const tmux = info.attach_command || `tmux attach -t ${info.tmux_session}`;
  if (info.target.kind === "local") return tmux;
  const host = info.target.user ? `${info.target.user}@${info.target.host}` : info.target.host;
  return `ssh -t ${host} ${tmux}`;
}
