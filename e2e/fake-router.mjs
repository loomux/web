// A stand-in for Loomux's router model in the e2e suite (e2e/README.md): an
// OpenAI-compatible /chat/completions endpoint that answers loomuxd's two
// tool calls from keywords in the message, so a test decides what the
// router does by what it types:
//
//   answer: <text>                  → answer_directly
//   run `<cmd>` on <target>         → run_command (an exact order: runs at once)
//   propose <cmd> on <target>       → run_command (not an exact order: an offer)
//   provision <name> on <target>: … → provision_workspace with claude-code
//   in <workspace>: …               → use_workspace with claude-code
//   anything else                   → answer_directly, echoing it
//
// Relay (condense_output) returns the agent's output as the reply, done.
import http from "node:http";

const port = Number(process.env.FAKE_ROUTER_PORT ?? 18091);

// The message, from loomuxd's prompt: "Message:\n<message>\n\nWorkspaces:".
function messageOf(prompt) {
  const all = [...prompt.matchAll(/Message:\n([\s\S]*?)\n\nWorkspaces:/g)];
  return (all.length ? all[all.length - 1][1] : prompt).trim();
}

// id ↔ name pairs listed in the prompt ("- id: X\n  name: Y").
function listed(prompt) {
  const out = [];
  for (const m of prompt.matchAll(/- id: (\S+)\n\s+name: (.+)/g)) out.push({ id: m[1], name: m[2].trim() });
  return out;
}

function decide(prompt) {
  const message = messageOf(prompt);
  const things = listed(prompt);
  const idOf = (name) => things.find((t) => t.name === name)?.id ?? "";
  let m;
  if ((m = /^answer: ([\s\S]*)$/.exec(message))) return { action: "answer_directly", direct_answer: `e2e answer: ${m[1]}` };
  if ((m = /^run `(.+)` on (\S+)$/.exec(message)) || (m = /^propose (.+) on (\S+)$/.exec(message)))
    return { action: "run_command", command: m[1], target_id: idOf(m[2]) };
  if ((m = /^provision (\S+) on (\S+): ([\s\S]*)$/.exec(message)))
    return {
      action: "provision_workspace",
      agent_type: "claude-code",
      new_workspace: { name: m[1], target_id: idOf(m[2]), kind: "empty", description: "e2e" },
    };
  if ((m = /^in (\S+): ([\s\S]*)$/.exec(message)))
    return { action: "use_workspace", workspace_id: idOf(m[1]), agent_type: "claude-code" };
  return { action: "answer_directly", direct_answer: `e2e echo: ${message}` };
}

function completion(toolName, args) {
  return {
    id: "chatcmpl-e2e",
    object: "chat.completion",
    created: Math.floor(Date.now() / 1000),
    model: "e2e",
    choices: [
      {
        index: 0,
        finish_reason: "tool_calls",
        message: {
          role: "assistant",
          content: "",
          tool_calls: [{ id: "call_e2e", type: "function", function: { name: toolName, arguments: JSON.stringify(args) } }],
        },
      },
    ],
    usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
  };
}

const server = http.createServer((req, res) => {
  let body = "";
  req.on("data", (c) => (body += c));
  req.on("end", () => {
    if (req.method !== "POST" || !req.url.endsWith("/chat/completions")) {
      res.writeHead(404).end();
      return;
    }
    const request = JSON.parse(body);
    const tool = request.tools?.[0]?.function?.name;
    // The first user message is loomuxd's prompt; a corrective retry
    // (server LOOM-107) appends another after it.
    const user = request.messages.find((m) => m.role === "user")?.content ?? "";
    const text = typeof user === "string" ? user : user.map((p) => p.text ?? "").join("");
    const args =
      tool === "condense_output" ? { reply: text.trim().split("\n").filter(Boolean).pop() ?? "", done: true } : decide(text);
    res.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify(completion(tool, args)));
  });
});

server.listen(port, "127.0.0.1", () => console.log(`fake router on 127.0.0.1:${port}`));
