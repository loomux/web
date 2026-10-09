import type { AttachInfoResponse } from "./api";

// A word the shell reads as itself; anything else is single-quoted.
const SAFE = /^[A-Za-z0-9_@%+=:,./-]+$/;

export function shellQuote(s: string): string {
  return SAFE.test(s) ? s : `'${s.replace(/'/g, `'\\''`)}'`;
}

// The command a human runs to attach: the server's attach_command, which
// names Loomux's own tmux server, run over ssh (-t: tmux needs a terminal)
// on a remote target, or as-is on the local one (loomuxd's own machine).
// ssh hands its command to the remote shell as one string, so it is one
// quoted argument unless every word in it is already safe.
export function attachCommand(info: AttachInfoResponse): string {
  const tmux = info.attach_command || `tmux attach -t ${shellQuote(info.tmux_session)}`;
  if (info.target.kind === "local") return tmux;
  const dest = info.target.user ? `${info.target.user}@${info.target.host}` : info.target.host;
  // 0 or absent: the SSH config's port.
  const port = info.target.ssh_port && info.target.ssh_port !== 22 ? ` -p ${info.target.ssh_port}` : "";
  const remote = tmux.split(" ").every((w) => SAFE.test(w)) ? tmux : shellQuote(tmux);
  return `ssh -t${port} ${shellQuote(dest)} ${remote}`;
}
