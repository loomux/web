import { describe, expect, it, vi, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { AuthProvider } from "../lib/auth";
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
});
