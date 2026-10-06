import { lazy, Suspense } from "react";
import { Link, Outlet, Route, Routes } from "react-router-dom";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { RouteErrorBoundary } from "./components/RouteErrorBoundary";
import { VersionBanner } from "./components/VersionBanner";
import { useAuth } from "./lib/authContext";

// Lazy-loaded per route: keeps ConversationDetailPage's markdown/syntax-
// highlighting dependencies (the bulk of the production bundle) out of the
// initial load for users who only ever see the dashboard or workspaces.
const LoginPage = lazy(() => import("./routes/LoginPage").then((m) => ({ default: m.LoginPage })));
const DashboardPage = lazy(() => import("./routes/DashboardPage").then((m) => ({ default: m.DashboardPage })));
const WorkspacesPage = lazy(() => import("./routes/WorkspacesPage").then((m) => ({ default: m.WorkspacesPage })));
const ConversationsPage = lazy(() =>
  import("./routes/ConversationsPage").then((m) => ({ default: m.ConversationsPage })),
);
const ConversationDetailPage = lazy(() =>
  import("./routes/ConversationDetailPage").then((m) => ({ default: m.ConversationDetailPage })),
);
const TargetsPage = lazy(() => import("./routes/TargetsPage").then((m) => ({ default: m.TargetsPage })));
const CredentialsPage = lazy(() =>
  import("./routes/CredentialsPage").then((m) => ({ default: m.CredentialsPage })),
);

function AppShell() {
  const { logout } = useAuth();
  return (
    <div className="min-h-svh flex flex-col">
      <VersionBanner />
      <nav className="flex items-center justify-between border-b border-neutral-200 px-4 py-2 dark:border-neutral-800">
        <div className="flex gap-4 text-sm">
          <Link to="/">Dashboard</Link>
          <Link to="/workspaces">Workspaces</Link>
          <Link to="/conversations">Conversations</Link>
          <Link to="/targets">Targets</Link>
          <Link to="/credentials">Credentials</Link>
        </div>
        <button onClick={logout} className="text-sm text-neutral-500 hover:underline">
          Log out
        </button>
      </nav>
      <div className="flex-1">
        <Outlet />
      </div>
    </div>
  );
}

function RouteFallback() {
  return <p className="p-4 text-neutral-500">Loading…</p>;
}

export function App() {
  return (
    <RouteErrorBoundary>
      <Suspense fallback={<RouteFallback />}>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route element={<ProtectedRoute />}>
            <Route element={<AppShell />}>
              <Route path="/" element={<DashboardPage />} />
              <Route path="/workspaces" element={<WorkspacesPage />} />
              <Route path="/conversations" element={<ConversationsPage />} />
              <Route path="/conversations/:id" element={<ConversationDetailPage />} />
              <Route path="/targets" element={<TargetsPage />} />
              <Route path="/credentials" element={<CredentialsPage />} />
            </Route>
          </Route>
        </Routes>
      </Suspense>
    </RouteErrorBoundary>
  );
}
