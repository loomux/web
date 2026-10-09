import { createContext, useContext } from "react";

// The auth context and its hook, apart from AuthProvider (auth.tsx) so that
// file exports only a component (React fast refresh).
export interface AuthContextValue {
  token: string | null;
  login: (password: string) => Promise<void>;
  logout: () => void;
  /** Called by the API layer on a 401 with the token that got it — clears
   *  it, unless a newer login has replaced it since. */
  handleUnauthorized: (rejected: string) => void;
}

export const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within an AuthProvider");
  return ctx;
}
