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
    <header className="topbar">
      <span className="brand">Kanban Ticketing</span>
      <nav className="topbar-nav">
        {NAV_ITEMS.map((item) => (
          <button
            key={item.path}
            type="button"
            className="link-button"
            onClick={() => navigate(item.path)}
          >
            {item.label}
          </button>
        ))}
      </nav>
      <div className="user-menu">
        <button type="button" className="user-button" onClick={() => setMenuOpen((open) => !open)}>
          {user?.email ?? "Account"}
        </button>
        {menuOpen && (
          <div className="user-dropdown">
            <button type="button" onClick={handleLogout}>
              Log out
            </button>
          </div>
        )}
      </div>
    </header>
  );
}
