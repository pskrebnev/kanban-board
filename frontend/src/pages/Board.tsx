<<<<<<< HEAD
import {
  DndContext,
  MouseSensor,
  TouchSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { useEffect, useMemo, useRef, type PointerEvent, type ReactElement } from "react";
import { useNavigate } from "react-router-dom";

import { AppHeader } from "../components/AppHeader";
import { useBoardStore } from "../store/board";
import { useEpicsStore } from "../store/epics";
import { useTeamsStore } from "../store/teams";
import {
  STATE_LABELS,
  TICKET_STATES,
  TICKET_TYPES,
  TYPE_LABELS,
  type Ticket,
  type TicketState,
  type TicketType,
} from "../store/tickets";

const fieldClass = "rounded-lg border border-field px-3 py-2 font-[inherit]";
const primaryBtn = "rounded-full bg-brand px-4 py-2 font-bold text-white";

// A small relative-time hint for cards (matches Wireframe 1's "2h ago" style).
function relativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const minutes = Math.round(diffMs / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return `${days}d ago`;
}

type BoardCardProps = {
  ticket: Ticket;
  onOpen: (id: string) => void;
};

function BoardCard({ ticket, onOpen }: BoardCardProps): ReactElement {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: ticket.id,
  });
  // Distinguish a click (open details) from a drag: if the pointer moved more
  // than a few pixels between down and click, treat it as a drag, not a click.
  const downAt = useRef<{ x: number; y: number } | null>(null);

  function handlePointerDownCapture(event: PointerEvent<HTMLDivElement>) {
    downAt.current = { x: event.clientX, y: event.clientY };
  }

  function handleClick(event: { clientX: number; clientY: number }) {
    const start = downAt.current;
    if (start && (Math.abs(event.clientX - start.x) > 5 || Math.abs(event.clientY - start.y) > 5)) {
      return; // it was a drag
    }
    onOpen(ticket.id);
  }

  const style = transform
    ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`, zIndex: 50 }
    : undefined;

  return (
    <div
      ref={setNodeRef}
      style={style}
      data-ticket-id={ticket.id}
      className={`cursor-grab rounded-xl border border-line bg-white p-3 shadow-[0_8px_24px_rgb(23_32_51/6%)] ${
        isDragging ? "opacity-60" : "hover:border-brand"
      }`}
      {...attributes}
      {...listeners}
      onPointerDownCapture={handlePointerDownCapture}
      onClick={handleClick}
    >
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <span className="rounded-full bg-brand-soft px-2 py-0.5 text-[0.7rem] font-bold uppercase tracking-wide text-brand">
          {TYPE_LABELS[ticket.type]}
        </span>
        {ticket.epicTitle && (
          <span className="text-[0.7rem] text-muted">Epic: {ticket.epicTitle}</span>
        )}
      </div>
      <p className="font-bold leading-snug">{ticket.title}</p>
      <p className="mt-2 text-right text-[0.7rem] text-muted">{relativeTime(ticket.modifiedAt)}</p>
    </div>
  );
}

type BoardColumnProps = {
  state: TicketState;
  tickets: Ticket[];
  onOpen: (id: string) => void;
};

function BoardColumn({ state, tickets, onOpen }: BoardColumnProps): ReactElement {
  const { setNodeRef, isOver } = useDroppable({ id: state });
  const label = STATE_LABELS[state];

  return (
    <article
      ref={setNodeRef}
      data-column={state}
      aria-label={`${label} column`}
      className={`flex min-h-[60vh] w-72 shrink-0 flex-col rounded-2xl border bg-canvas p-3 ${
        isOver ? "border-brand bg-brand-soft" : "border-line"
      }`}
    >
      <header className="mb-3 flex items-center justify-between px-1">
        <h2 className="text-[0.8rem] font-extrabold uppercase tracking-[0.1em] text-muted">
          {label}
        </h2>
        <span
          data-column-count={state}
          className="rounded-full bg-white px-2 py-0.5 text-xs font-bold text-muted"
        >
          {tickets.length}
        </span>
      </header>
      <div className="flex flex-1 flex-col gap-3">
        {tickets.map((ticket) => (
          <BoardCard key={ticket.id} ticket={ticket} onOpen={onOpen} />
        ))}
      </div>
    </article>
  );
}

export function Board(): ReactElement {
  const navigate = useNavigate();

  const teams = useTeamsStore((state) => state.teams);
  const fetchTeams = useTeamsStore((state) => state.fetchTeams);
  const epics = useEpicsStore((state) => state.epics);
  const fetchEpics = useEpicsStore((state) => state.fetchEpics);

  const selectedTeamId = useBoardStore((state) => state.selectedTeamId);
  const tickets = useBoardStore((state) => state.tickets);
  const status = useBoardStore((state) => state.status);
  const filters = useBoardStore((state) => state.filters);
  const moveError = useBoardStore((state) => state.moveError);
  const selectTeam = useBoardStore((state) => state.selectTeam);
  const setFilter = useBoardStore((state) => state.setFilter);
  const clearFilters = useBoardStore((state) => state.clearFilters);
  const moveTicket = useBoardStore((state) => state.moveTicket);
  const dismissMoveError = useBoardStore((state) => state.dismissMoveError);

  // A small movement threshold means a plain click opens the card instead of
  // starting a drag; touch needs a short press to avoid hijacking scrolls.
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 8 } }),
  );

  useEffect(() => {
    void fetchTeams();
    // Load all epics; the epic filter is scoped to the selected team client-side.
    void fetchEpics();
  }, [fetchTeams, fetchEpics]);

  // Land the user on a populated board: auto-select the first team once teams
  // load and nothing is selected yet.
  useEffect(() => {
    if (!selectedTeamId && teams.length > 0) {
      void selectTeam(teams[0]!.id);
    }
  }, [teams, selectedTeamId, selectTeam]);

  const teamEpics = useMemo(
    () => epics.filter((epic) => epic.teamId === selectedTeamId),
    [epics, selectedTeamId],
  );

  const hasActiveFilters = filters.type !== "" || filters.epicId !== "" || filters.search !== "";

  // Filter (AND logic) then group into the five fixed columns, ordered
  // most-recently-modified first within each.
  const columns = useMemo(() => {
    const search = filters.search.trim().toLowerCase();
    const filtered = tickets.filter(
      (ticket) =>
        (filters.type === "" || ticket.type === filters.type) &&
        (filters.epicId === "" || ticket.epicId === filters.epicId) &&
        (search === "" || ticket.title.toLowerCase().includes(search)),
    );

    return TICKET_STATES.map((state) => ({
      state,
      tickets: filtered
        .filter((ticket) => ticket.state === state)
        .sort((a, b) => new Date(b.modifiedAt).getTime() - new Date(a.modifiedAt).getTime()),
    }));
  }, [tickets, filters]);

  const totalVisible = columns.reduce((sum, column) => sum + column.tickets.length, 0);

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over) return;
    void moveTicket(String(active.id), over.id as TicketState);
  }

  function openTicket(id: string) {
    navigate(`/tickets/${id}`);
=======
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
>>>>>>> 38c086d85be695e4709f7537890cbca79299944a
  }

  return (
    <div className="app">
<<<<<<< HEAD
      <AppHeader />

      <main className="min-h-screen p-8">
        <section className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="mb-2 text-[0.8rem] font-extrabold uppercase tracking-[0.12em] text-brand">
              Team board
            </p>
            <h1 className="text-3xl font-bold">Kanban board</h1>
          </div>
          <button
            type="button"
            className={`${primaryBtn} whitespace-nowrap disabled:cursor-not-allowed disabled:opacity-55`}
            disabled={!selectedTeamId}
            onClick={() => navigate(`/tickets/new?teamId=${selectedTeamId ?? ""}`)}
          >
            + New ticket
          </button>
        </section>

        {teams.length === 0 ? (
          <p className="text-[0.85rem] text-muted">
            No teams yet.{" "}
            <button
              type="button"
              className="bg-transparent p-0 font-bold text-brand underline"
              onClick={() => navigate("/teams")}
            >
              Create a team
            </button>{" "}
            to start a board.
          </p>
        ) : (
          <>
            <div className="mb-4 flex flex-wrap items-center gap-2">
              <select
                aria-label="Board team"
                className={fieldClass}
                value={selectedTeamId ?? ""}
                onChange={(event) => void selectTeam(event.target.value || null)}
              >
                {teams.map((team) => (
                  <option key={team.id} value={team.id}>
                    {team.name}
                  </option>
                ))}
              </select>

              <input
                type="search"
                aria-label="Search by title"
                placeholder="Search title…"
                className={fieldClass}
                value={filters.search}
                onChange={(event) => setFilter({ search: event.target.value })}
              />

              <select
                aria-label="Filter by type"
                className={fieldClass}
                value={filters.type}
                onChange={(event) => setFilter({ type: event.target.value as TicketType | "" })}
              >
                <option value="">All types</option>
                {TICKET_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {TYPE_LABELS[type]}
                  </option>
                ))}
              </select>

              <select
                aria-label="Filter by epic"
                className={fieldClass}
                value={filters.epicId}
                onChange={(event) => setFilter({ epicId: event.target.value })}
              >
                <option value="">All epics</option>
                {teamEpics.map((epic) => (
                  <option key={epic.id} value={epic.id}>
                    {epic.title}
                  </option>
                ))}
              </select>

              <button
                type="button"
                className="rounded-full bg-brand-soft px-4 py-2 font-bold text-brand disabled:opacity-55"
                onClick={() => clearFilters()}
                disabled={!hasActiveFilters}
              >
                Clear
              </button>

              <span className="ml-auto text-[0.85rem] text-muted">
                {totalVisible} {totalVisible === 1 ? "ticket" : "tickets"}
              </span>
            </div>

            {moveError && (
              <div
                role="alert"
                className="mb-4 flex items-center justify-between gap-3 rounded-lg border border-danger bg-danger-soft px-4 py-2 text-[0.85rem] text-danger"
              >
                <span>{moveError}</span>
                <button
                  type="button"
                  className="font-bold underline"
                  onClick={() => dismissMoveError()}
                >
                  Dismiss
                </button>
              </div>
            )}

            {status === "loading" && (
              <p className="text-[0.85rem] text-muted">Loading board…</p>
            )}
            {status === "error" && (
              <p className="error">Could not load the board. Please refresh and try again.</p>
            )}

            {status === "ready" && tickets.length === 0 && (
              <p className="text-[0.85rem] text-muted">
                This team has no tickets yet. Create one with “New ticket”.
              </p>
            )}

            {status === "ready" && tickets.length > 0 && totalVisible === 0 && (
              <p className="text-[0.85rem] text-muted">No tickets match the active filters.</p>
            )}

            {status === "ready" && tickets.length > 0 && (
              <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
                <section className="flex gap-4 overflow-x-auto pb-4" aria-label="Kanban board">
                  {columns.map((column) => (
                    <BoardColumn
                      key={column.state}
                      state={column.state}
                      tickets={column.tickets}
                      onOpen={openTicket}
                    />
                  ))}
                </section>
              </DndContext>
            )}
          </>
        )}
=======
      <header className="topbar">
        <span className="brand">Kanban Ticketing</span>
        <nav className="topbar-nav">
          <button type="button" className="link-button" onClick={() => navigate("/teams")}>
            Teams
          </button>
          <button type="button" className="link-button" onClick={() => navigate("/epics")}>
            Epics
          </button>
          <button type="button" className="link-button" onClick={() => navigate("/tickets")}>
            Tickets
          </button>
        </nav>
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
>>>>>>> 38c086d85be695e4709f7537890cbca79299944a
      </main>
    </div>
  );
}
