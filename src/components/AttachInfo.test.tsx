import { describe, expect, it, vi, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthProvider } from "../lib/auth";
import { AttachInfo } from "./AttachInfo";

function renderComponent(taskId = "task-1") {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <MemoryRouter>
          <AttachInfo taskId={taskId} />
        </MemoryRouter>
      </AuthProvider>
    </QueryClientProvider>,
  );
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status });
}

describe("AttachInfo", () => {
  const originalFetch = globalThis.fetch;
  const originalClipboard = navigator.clipboard;

  afterEach(() => {
    globalThis.fetch = originalFetch;
    Object.defineProperty(navigator, "clipboard", {
      value: originalClipboard,
      writable: true,
      configurable: true,
    });
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it("copies the attach command to the clipboard when the copy button is clicked", async () => {
    localStorage.setItem("loomux.token", "tok-1");
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText },
      writable: true,
      configurable: true,
    });

    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === "/api/v1/tasks/task-1/attach-info") {
        return jsonResponse({
          task_id: "task-1",
          tmux_session: "session-1",
          target: { id: "tgt-1", name: "devbox", kind: "ssh", host: "10.0.0.5", user: "admin" },
        });
      }
      throw new Error(`unexpected fetch: ${url}`);
    });

    const user = userEvent.setup();
    renderComponent();

    await user.click(screen.getByRole("button", { name: /show attach command/i }));
    const command = await screen.findByText(/ssh admin@10\.0\.0\.5 tmux attach -t session-1/);
    expect(command).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /copy/i }));

    await waitFor(() =>
      expect(writeText).toHaveBeenCalledWith("ssh admin@10.0.0.5 tmux attach -t session-1"),
    );
    expect(await screen.findByText(/copied/i)).toBeInTheDocument();
  });
});
