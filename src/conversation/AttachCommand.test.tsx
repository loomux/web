import { describe, expect, it, vi, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthProvider } from "../lib/auth";
import { attachCommand } from "../lib/attach";
import { AttachCommand } from "./AttachCommand";

function renderComponent(taskId = "task-1") {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <MemoryRouter>
          <AttachCommand taskId={taskId} />
        </MemoryRouter>
      </AuthProvider>
    </QueryClientProvider>,
  );
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status });
}

describe("AttachCommand", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it("copies the attach command to the clipboard when the copy button is clicked", async () => {
    localStorage.setItem("loomux.token", "tok-1");

    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === "/api/v1/tasks/task-1/attach-info") {
        return jsonResponse({
          task_id: "task-1",
          tmux_session: "session-1",
          tmux_socket: "loomux",
          attach_command: "tmux -L loomux attach -t session-1",
          target: { id: "tgt-1", name: "devbox", kind: "ssh", host: "10.0.0.5", user: "admin" },
        });
      }
      throw new Error(`unexpected fetch: ${url}`);
    });

    const user = userEvent.setup();
    renderComponent();

    await user.click(screen.getByRole("button", { name: /show attach command/i }));
    const command = await screen.findByText("ssh -t admin@10.0.0.5 tmux -L loomux attach -t session-1");
    expect(command).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /^copy$/i }));

    expect(await screen.findByText(/copied/i)).toBeInTheDocument();
  });

  it("takes the port from the target list when attach-info has none", async () => {
    localStorage.setItem("loomux.token", "tok-1");
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === "/api/v1/tasks/task-1/attach-info") {
        return jsonResponse({
          task_id: "task-1",
          tmux_session: "session-1",
          attach_command: "tmux -L loomux attach -t session-1",
          target: { id: "tgt-1", name: "devbox", kind: "ssh", host: "10.0.0.5", user: "admin" },
        });
      }
      if (url === "/api/v1/targets") return jsonResponse({ targets: [{ id: "tgt-1", name: "devbox", kind: "ssh", ssh_port: 2222 }] });
      throw new Error(`unexpected fetch: ${url}`);
    });
    const user = userEvent.setup();
    renderComponent();
    await user.click(screen.getByRole("button", { name: /show attach command/i }));
    expect(await screen.findByText("ssh -t -p 2222 admin@10.0.0.5 tmux -L loomux attach -t session-1")).toBeInTheDocument();
  });

  it("says when it couldn't load the command, beside the button rather than inside it", async () => {
    localStorage.setItem("loomux.token", "tok-1");
    globalThis.fetch = vi.fn(async () => jsonResponse({ error: "no such task" }, 404));
    const user = userEvent.setup();
    renderComponent();
    await user.click(screen.getByRole("button", { name: /show attach command/i }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Couldn't load it");
    expect(screen.getByRole("button", { name: /show attach command/i })).toBeEnabled();
  });

  it("names Loomux's tmux socket, and runs it as-is on the local target", () => {
    const base = {
      task_id: "t",
      tmux_session: "loomux-t",
      tmux_socket: "loomux-prod",
      attach_command: "tmux -L loomux-prod attach -t loomux-t",
    };
    expect(attachCommand({ ...base, target: { id: "a", name: "jet01", kind: "local", host: "", user: "" } })).toBe(
      "tmux -L loomux-prod attach -t loomux-t",
    );
    expect(attachCommand({ ...base, target: { id: "b", name: "box", kind: "remote", host: "box", user: "" } })).toBe(
      "ssh -t box tmux -L loomux-prod attach -t loomux-t",
    );
  });

  it("falls back to a plain tmux attach for a server without attach_command", () => {
    expect(
      attachCommand({
        task_id: "t",
        tmux_session: "s",
        target: { id: "b", name: "box", kind: "remote", host: "10.0.0.5", user: "admin" },
      }),
    ).toBe("ssh -t admin@10.0.0.5 tmux attach -t s");
  });
});
