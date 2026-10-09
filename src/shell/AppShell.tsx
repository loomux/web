import { useState } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { Button as AriaButton } from "react-aria-components";
import { useQueryClient } from "@tanstack/react-query";
import { VersionBanner } from "../components/VersionBanner";
import { useAuth } from "../lib/authContext";
import { useNeedsYouCount } from "../lib/useNeedsYouCount";
import { useOnline } from "../lib/useOnline";
import { CountBadge } from "../ui/CountBadge";
import { Icon, type IconName } from "../ui/icons";
import { Sheet } from "../ui/Sheet";

// The frame around every signed-in screen (build-plan §3, principles 4).
// Daily work (Inbox, Today, Machines) is one tap away on both devices;
// setup (Vault, Settings) sits one step down: lower in the desktop
// sidebar, inside More on a phone. The needs-you count rides on Inbox in
// both. Below 768 px the sidebar gives way to a bottom bar, and
// --shell-bottom tells full-height screens how much of the viewport the
// bar takes.
interface NavItem {
  to: string;
  label: string;
  icon: IconName;
  end?: boolean;
}

const DAILY: NavItem[] = [
  { to: "/", label: "Inbox", icon: "inbox", end: true },
  { to: "/today", label: "Today", icon: "today" },
  { to: "/machines", label: "Machines", icon: "machines" },
];

const SETUP: NavItem[] = [
  { to: "/vault", label: "Vault", icon: "vault" },
  { to: "/settings", label: "Settings", icon: "settings" },
];

const sidebarLink = ({ isActive }: { isActive: boolean }) =>
  `flex min-h-11 items-center gap-3 rounded-control px-3 text-[0.9375rem] font-bold ${
    isActive ? "bg-accent-soft text-accent" : "text-ink-2 hover:bg-surface-2 hover:text-ink"
  }`;

const barLink = ({ isActive }: { isActive: boolean }) =>
  `flex flex-1 flex-col items-center justify-center gap-1 min-h-14 text-xs font-bold ${
    isActive ? "text-accent" : "text-ink-3"
  }`;

function Brand() {
  return (
    <div className="flex items-center gap-2.5 px-3 pb-4 text-lg font-extrabold text-ink">
      <span className="grid size-8 place-items-center rounded-[9px] bg-ink text-surface">
        <Icon name="shuttle" className="size-5" />
      </span>
      Loomux
    </div>
  );
}

export function AppShell() {
  const { logout: endSession } = useAuth();
  const queryClient = useQueryClient();
  // Nothing read during the session stays in memory after it.
  const logout = () => {
    endSession();
    queryClient.clear();
  };
  const navigate = useNavigate();
  const needsYou = useNeedsYouCount();
  const [moreOpen, setMoreOpen] = useState(false);
  const online = useOnline();

  return (
    <div className="min-h-svh md:grid md:grid-cols-[15rem_1fr] [--shell-bottom:calc(4rem+env(safe-area-inset-bottom))] md:[--shell-bottom:0px]">
      <nav
        aria-label="Main"
        className="hidden md:flex sticky top-0 h-svh flex-col border-r border-line bg-surface px-3 pt-5 pb-4"
      >
        <Brand />
        <ul className="flex flex-col gap-1">
          {DAILY.map((item) => (
            <li key={item.to}>
              <NavLink to={item.to} end={item.end} className={sidebarLink}>
                <Icon name={item.icon} />
                <span className="flex-1">{item.label}</span>
                {item.to === "/" && <CountBadge count={needsYou} />}
              </NavLink>
            </li>
          ))}
        </ul>
        <ul className="mt-auto flex flex-col gap-1">
          {SETUP.map((item) => (
            <li key={item.to}>
              <NavLink to={item.to} className={sidebarLink}>
                <Icon name={item.icon} />
                {item.label}
              </NavLink>
            </li>
          ))}
          <li>
            <button type="button" onClick={logout} className={sidebarLink({ isActive: false }) + " w-full"}>
              <Icon name="logout" />
              Log out
            </button>
          </li>
        </ul>
      </nav>

      <div className="flex min-h-svh min-w-0 flex-col pb-[var(--shell-bottom)]">
        {!online && (
          <div role="status" className="bg-ink px-4 py-2 text-center text-sm text-surface">
            You're offline. Loomux catches up when you're back.
          </div>
        )}
        <VersionBanner />
        <main className="min-w-0 flex-1">
          <Outlet />
        </main>
      </div>

      <nav
        aria-label="Main"
        className="md:hidden fixed inset-x-0 bottom-0 z-40 flex border-t border-line bg-surface pb-[env(safe-area-inset-bottom)]"
      >
        {DAILY.map((item) => (
          <NavLink key={item.to} to={item.to} end={item.end} className={barLink}>
            <span className="relative">
              <Icon name={item.icon} className="size-6" />
              {item.to === "/" && (
                <span className="absolute -top-2 left-4">
                  <CountBadge count={needsYou} />
                </span>
              )}
            </span>
            {item.label}
          </NavLink>
        ))}
        <AriaButton onPress={() => setMoreOpen(true)} className={barLink({ isActive: moreOpen })}>
          <Icon name="more" className="size-6" />
          More
        </AriaButton>
      </nav>

      <Sheet title="More" isOpen={moreOpen} onOpenChange={setMoreOpen}>
        <ul className="flex flex-col px-2 pb-2">
          {SETUP.map((item) => (
            <li key={item.to}>
              <AriaButton
                onPress={() => {
                  setMoreOpen(false);
                  navigate(item.to);
                }}
                className="flex min-h-12 w-full items-center gap-3 rounded-control px-3 text-base font-bold text-ink data-[hovered]:bg-surface-2"
              >
                <Icon name={item.icon} />
                {item.label}
              </AriaButton>
            </li>
          ))}
          <li>
            <AriaButton
              onPress={() => {
                setMoreOpen(false);
                logout();
              }}
              className="flex min-h-12 w-full items-center gap-3 rounded-control px-3 text-base font-bold text-ink data-[hovered]:bg-surface-2"
            >
              <Icon name="logout" />
              Log out
            </AriaButton>
          </li>
        </ul>
      </Sheet>
    </div>
  );
}
