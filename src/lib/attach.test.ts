import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import type { AttachInfoResponse } from "./api";
import { attachCommand, shellQuote } from "./attach";

function info(target: Partial<AttachInfoResponse["target"]>, extra: Partial<AttachInfoResponse> = {}): AttachInfoResponse {
  return {
    task_id: "t",
    tmux_session: "loomux-t",
    attach_command: "tmux -L loomux attach -t loomux-t",
    target: { id: "x", name: "box", kind: "ssh", host: "10.0.0.5", user: "admin", ...target },
    ...extra,
  };
}

// The words a POSIX shell splits a command line into.
function words(cmd: string): string[] {
  return JSON.parse(execFileSync("sh", ["-c", `node -e 'console.log(JSON.stringify(process.argv.slice(1)))' -- ${cmd}`]).toString());
}

describe("attachCommand", () => {
  it("adds -p for a port other than 22", () => {
    expect(attachCommand(info({ ssh_port: 2222 }))).toBe("ssh -t -p 2222 admin@10.0.0.5 tmux -L loomux attach -t loomux-t");
  });

  it.each([[22], [0], [undefined]])("leaves the port to ssh for %s", (ssh_port) => {
    expect(attachCommand(info({ ssh_port }))).toBe("ssh -t admin@10.0.0.5 tmux -L loomux attach -t loomux-t");
  });

  it("quotes a user or host the shell would read otherwise", () => {
    const cmd = attachCommand(info({ user: "a b", host: "h;rm -rf ~" }));
    expect(cmd).toBe("ssh -t 'a b@h;rm -rf ~' tmux -L loomux attach -t loomux-t");
    expect(words(cmd)).toEqual(["ssh", "-t", "a b@h;rm -rf ~", "tmux", "-L", "loomux", "attach", "-t", "loomux-t"]);
  });

  it("passes an unsafe remote command to ssh as one argument, as the server wrote it", () => {
    const tmux = `tmux -L 'my sock' attach -t "x$(id)";ls`;
    const cmd = attachCommand(info({}, { attach_command: tmux }));
    expect(words(cmd)).toEqual(["ssh", "-t", "admin@10.0.0.5", tmux]);
  });

  it("quotes the session name in the fallback, on both shell layers", () => {
    const session = `it's $HOME; ls`;
    const local = attachCommand(info({ kind: "local" }, { attach_command: undefined, tmux_session: session }));
    expect(words(local)).toEqual(["tmux", "attach", "-t", session]);
    const remote = attachCommand(info({}, { attach_command: undefined, tmux_session: session }));
    const [, , , sent] = words(remote);
    expect(words(sent)).toEqual(["tmux", "attach", "-t", session]);
  });
});

describe("shellQuote", () => {
  it("leaves a plain word alone and single-quotes the rest", () => {
    expect(shellQuote("loomux-t")).toBe("loomux-t");
    expect(shellQuote("")).toBe("''");
    expect(shellQuote("it's")).toBe(`'it'\\''s'`);
  });
});
