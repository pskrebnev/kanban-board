import { useState, type ReactElement } from "react";
import { useNavigate } from "react-router-dom";

import { useAuthStore } from "../store/auth";

const NAV_ITEMS: Array<{ label: string; path: string }> = [
  { label: "Board", path: "/" },
  { label: "Teams", path: "/teams" },
  { label: "Epics", path: "/epics" },
  { label: "Tickets", path: "/tickets" },
];

/**
 * Shared top bar: brand, primary navigation, and the account/log-out menu.
 * Used by the ticket screens so the chrome matches the rest of the app.
 */
export function AppHeader(): ReactElement {
  const navigate = useNavigate();
  const user = useAuthStore((state) => state.user);
  const logout = useAuthStore((state) => state.logout);
  const [menuOpen, setMenuOpen] = useState(false);

  async function handleLogout() {
    await logout();
    navigate("/login", { replace: true });
  }

  return (
    <header className="sticky top-0 z-30 flex items-center justify-between border-b border-line bg-white/80 px-8 py-4 backdrop-blur-md">
      <span className="font-extrabold tracking-tight">Kanban Ticketing</span>
      <nav className="ml-8 flex flex-1 gap-2">
        {NAV_ITEMS.map((item) => (
          <button
            key={item.path}
            type="button"
            className="rounded-full bg-transparent px-3 py-2 font-bold text-brand hover:bg-brand-soft"
            onClick={() => navigate(item.path)}
          >
            {item.label}
          </button>
        ))}
      </nav>
      <div className="relative flex items-center gap-2">
        <button
          type="button"
          className="rounded-full bg-brand-soft px-4 py-2 font-bold text-brand"
          onClick={() => setMenuOpen((open) => !open)}
        >
          {user?.email ?? "Account"}
        </button>
        {menuOpen && (
          <div className="absolute right-0 top-12 rounded-xl border border-line bg-white p-2 shadow-[0_16px_40px_rgb(23_32_51/12%)]">
            <button
              type="button"
              className="w-full rounded-full bg-transparent px-4 py-2 text-left font-bold text-ink"
              onClick={handleLogout}
            >
              Log out
            </button>
          </div>
        )}
      </div>
    </header>
  );
}
