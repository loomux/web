import { describe, expect, it, vi, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { AuthProvider } from "../lib/auth";
import { ProtectedRoute } from "../components/ProtectedRoute";
import { LoginPage } from "./LoginPage";

describe("LoginPage", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it("stores the token on successful login", async () => {
    globalThis.fetch = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify({ token: "tok-1" }), { status: 200 }));

    render(
      <MemoryRouter initialEntries={["/login"]}>
        <AuthProvider>
          <LoginPage />
        </AuthProvider>
      </MemoryRouter>,
    );

    await userEvent.type(screen.getByLabelText(/password/i), "hunter2");
    await userEvent.click(screen.getByRole("button", { name: /log in/i }));

    await waitFor(() => expect(localStorage.getItem("loomux.token")).toBe("tok-1"));
  });

  it("shows the server's error message on a failed login", async () => {
    globalThis.fetch = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ error: "invalid password" }), { status: 401 }),
      );

    render(
      <MemoryRouter initialEntries={["/login"]}>
        <AuthProvider>
          <LoginPage />
        </AuthProvider>
      </MemoryRouter>,
    );

    await userEvent.type(screen.getByLabelText(/password/i), "wrong");
    await userEvent.click(screen.getByRole("button", { name: /log in/i }));

    expect(await screen.findByText("invalid password")).toBeInTheDocument();
    expect(localStorage.getItem("loomux.token")).toBeNull();
  });

  it("returns to the page that asked for a login, not the Inbox", async () => {
    globalThis.fetch = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify({ token: "tok-1" }), { status: 200 }));

    render(
      <MemoryRouter initialEntries={["/conversations/abc123?x=1"]}>
        <AuthProvider>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route element={<ProtectedRoute />}>
              <Route path="/conversations/:id" element={<p>conversation page</p>} />
              <Route path="/" element={<p>inbox page</p>} />
            </Route>
          </Routes>
        </AuthProvider>
      </MemoryRouter>,
    );

    await userEvent.type(await screen.findByLabelText(/password/i), "hunter2");
    await userEvent.click(screen.getByRole("button", { name: /log in/i }));

    expect(await screen.findByText("conversation page")).toBeInTheDocument();
    expect(screen.queryByText("inbox page")).not.toBeInTheDocument();
  });

  it("lands on the Inbox when nothing asked for a login", async () => {
    globalThis.fetch = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify({ token: "tok-1" }), { status: 200 }));

    render(
      <MemoryRouter initialEntries={["/login"]}>
        <AuthProvider>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route element={<ProtectedRoute />}>
              <Route path="/" element={<p>inbox page</p>} />
            </Route>
          </Routes>
        </AuthProvider>
      </MemoryRouter>,
    );

    await userEvent.type(await screen.findByLabelText(/password/i), "hunter2");
    await userEvent.click(screen.getByRole("button", { name: /log in/i }));

    expect(await screen.findByText("inbox page")).toBeInTheDocument();
  });
});
