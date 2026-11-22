import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthProvider } from "./lib/auth";
import { App } from "./App";

// The shared vector (src/lib/link.test.ts).
const H = "ea866a757e4c38babfa8127cbe9a409d3e1f93a00ff1488ff735fcf917afffd0";

function renderApp(entry: string) {
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <AuthProvider>
        <MemoryRouter initialEntries={[entry]}>
          <App />
        </MemoryRouter>
      </AuthProvider>
    </QueryClientProvider>,
  );
}

describe("App", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  // LOOM-273: the terminal opens /link#h=…; it's behind the login, and on
  // its own page, without the app's navigation around it.
  it("serves the link page at /link, on its own", async () => {
    localStorage.setItem("loomux.token", "tok");
    vi.stubGlobal("fetch", vi.fn(() => new Promise(() => {})));
    renderApp(`/link#h=${H}&label=laptop`);
    expect(await screen.findByText("7ESB-UHZP")).toBeInTheDocument();
    expect(screen.queryByRole("navigation", { name: "Main" })).not.toBeInTheDocument();
  });

  it("asks for the login before the link page", async () => {
    renderApp(`/link#h=${H}&label=laptop`);
    expect(await screen.findByLabelText(/password/i)).toBeInTheDocument();
    expect(screen.queryByText("7ESB-UHZP")).not.toBeInTheDocument();
  });
});
