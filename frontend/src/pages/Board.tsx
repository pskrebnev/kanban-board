import { DndContext } from "@dnd-kit/core";
import { useState, type ReactElement } from "react";
import { useNavigate } from "react-router-dom";
import { create } from "zustand";

import { useAuthStore } from "../store/auth";

type Column = {
  id: string;
  title: string;
  tickets: string[];
};

type BoardState = {
  columns: Column[];
};

// Placeholder board state. Real persistence arrives in a later phase; this
// screen exists so authenticated users land somewhere meaningful.
const useBoardStore = create<BoardState>(() => ({
  columns: [
    { id: "new", title: "New", tickets: ["Sample ticket (placeholder)"] },
    { id: "ready_for_implementation", title: "Ready for Implementation", tickets: [] },
    { id: "in_progress", title: "In Progress", tickets: [] },
    { id: "ready_for_acceptance", title: "Ready for Acceptance", tickets: [] },
    { id: "done", title: "Done", tickets: [] },
  ],
}));

export function Board(): ReactElement {
  const navigate = useNavigate();
  const columns = useBoardStore((state) => state.columns);
  const user = useAuthStore((state) => state.user);
  const logout = useAuthStore((state) => state.logout);
  const [menuOpen, setMenuOpen] = useState(false);

  async function handleLogout() {
    await logout();
    navigate("/login", { replace: true });
  }

  return (
    <div className="app">
      <header className="topbar">
        <span className="brand">Kanban Ticketing</span>
        <div className="user-menu">
          <button
            type="button"
            className="user-button"
            onClick={() => setMenuOpen((open) => !open)}
          >
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

      <main className="shell">
        <section className="hero">
          <p className="eyebrow">Team Board</p>
          <h1>Kanban workflow</h1>
        </section>

        <DndContext>
          <section className="board board-five" aria-label="Kanban board">
            {columns.map((column) => (
              <article className="column" key={column.id}>
                <h2>{column.title}</h2>
                {column.tickets.map((ticket) => (
                  <div className="ticket" key={ticket}>
                    {ticket}
                  </div>
                ))}
              </article>
            ))}
          </section>
        </DndContext>
      </main>
    </div>
  );
}
