import { Link, Outlet, Route, Routes } from "react-router-dom";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { VersionBanner } from "./components/VersionBanner";
import { LoginPage } from "./routes/LoginPage";
import { DashboardPage } from "./routes/DashboardPage";
import { WorkspacesPage } from "./routes/WorkspacesPage";
import { ConversationsPage } from "./routes/ConversationsPage";
import { ConversationDetailPage } from "./routes/ConversationDetailPage";
import { useAuth } from "./lib/auth";

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

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route element={<ProtectedRoute />}>
        <Route element={<AppShell />}>
          <Route path="/" element={<DashboardPage />} />
          <Route path="/workspaces" element={<WorkspacesPage />} />
          <Route path="/conversations" element={<ConversationsPage />} />
          <Route path="/conversations/:id" element={<ConversationDetailPage />} />
        </Route>
      </Route>
    </Routes>
  );
}
