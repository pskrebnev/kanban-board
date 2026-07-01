import { useEffect, type ReactElement } from "react";
import { useNavigate } from "react-router-dom";

import { AppHeader } from "../components/AppHeader";
import { useEpicsStore } from "../store/epics";
import { useTeamsStore } from "../store/teams";
import {
  STATE_LABELS,
  STATE_STYLES,
  TICKET_STATES,
  TICKET_TYPES,
  TYPE_LABELS,
  TYPE_STYLES,
  useTicketsStore,
  type TicketState,
  type TicketType,
} from "../store/tickets";

const fieldClass = "rounded-lg border border-field px-3 py-2 font-[inherit]";
const primaryBtn = "rounded-full bg-brand px-4 py-2 font-bold text-white";

export function Tickets(): ReactElement {
  const navigate = useNavigate();

  const teams = useTeamsStore((state) => state.teams);
  const fetchTeams = useTeamsStore((state) => state.fetchTeams);
  const epics = useEpicsStore((state) => state.epics);
  const fetchEpics = useEpicsStore((state) => state.fetchEpics);

  const tickets = useTicketsStore((state) => state.tickets);
  const status = useTicketsStore((state) => state.status);
  const filters = useTicketsStore((state) => state.filters);
  const setFilters = useTicketsStore((state) => state.setFilters);
  const fetchTickets = useTicketsStore((state) => state.fetchTickets);

  useEffect(() => {
    void fetchTeams();
    void fetchEpics();
    void fetchTickets();
  }, [fetchTeams, fetchEpics, fetchTickets]);

  function updateFilter(patch: Partial<typeof filters>) {
    void setFilters({ ...filters, ...patch });
  }

  return (
    <div className="app">
      <AppHeader />

      <main className="min-h-screen p-12">
        <section className="mx-auto mb-8 flex max-w-[980px] items-end justify-between gap-4">
          <div>
            <p className="mb-3 text-[0.8rem] font-extrabold uppercase tracking-[0.12em] text-brand">
              Ticket management
            </p>
            <h1 className="mb-2 text-4xl font-bold">Tickets</h1>
            <p className="text-[0.85rem] text-muted">
              Work items belong to a team and move through the five-state workflow.
            </p>
          </div>
          <button type="button" className={`${primaryBtn} whitespace-nowrap`} onClick={() => navigate("/tickets/new")}>
            New ticket
          </button>
        </section>

        <div className="mx-auto max-w-[980px]">
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <select
              aria-label="Filter by team"
              className={fieldClass}
              value={filters.teamId ?? ""}
              onChange={(event) => updateFilter({ teamId: event.target.value || undefined })}
            >
              <option value="">All teams</option>
              {teams.map((team) => (
                <option key={team.id} value={team.id}>
                  {team.name}
                </option>
              ))}
            </select>
            <select
              aria-label="Filter by type"
              className={fieldClass}
              value={filters.type ?? ""}
              onChange={(event) =>
                updateFilter({ type: (event.target.value || undefined) as TicketType | undefined })
              }
            >
              <option value="">All types</option>
              {TICKET_TYPES.map((type) => (
                <option key={type} value={type}>
                  {TYPE_LABELS[type]}
                </option>
              ))}
            </select>
            <select
              aria-label="Filter by state"
              className={fieldClass}
              value={filters.state ?? ""}
              onChange={(event) =>
                updateFilter({ state: (event.target.value || undefined) as TicketState | undefined })
              }
            >
              <option value="">All states</option>
              {TICKET_STATES.map((state) => (
                <option key={state} value={state}>
                  {STATE_LABELS[state]}
                </option>
              ))}
            </select>
            <select
              aria-label="Filter by epic"
              className={fieldClass}
              value={filters.epicId ?? ""}
              onChange={(event) => updateFilter({ epicId: event.target.value || undefined })}
            >
              <option value="">All epics</option>
              {epics.map((epic) => (
                <option key={epic.id} value={epic.id}>
                  {epic.title}
                </option>
              ))}
            </select>
          </div>

          {status === "loading" && <p className="text-[0.85rem] text-muted">Loading tickets…</p>}
          {status === "error" && (
            <p className="error">Could not load tickets. Please refresh and try again.</p>
          )}
          {status === "ready" && tickets.length === 0 && (
            <p className="text-[0.85rem] text-muted">No tickets match. Create one with “New ticket”.</p>
          )}

          {tickets.length > 0 && (
            <ul className="space-y-3">
              {tickets.map((ticket) => (
                <li
                  key={ticket.id}
                  className="cursor-pointer rounded-2xl border border-line bg-white p-5 shadow-[0_16px_40px_rgb(23_32_51/6%)] transition hover:-translate-y-0.5 hover:border-brand hover:shadow-[0_20px_48px_rgb(23_32_51/10%)]"
                  onClick={() => navigate(`/tickets/${ticket.id}`)}
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${TYPE_STYLES[ticket.type]}`}>
                      {TYPE_LABELS[ticket.type]}
                    </span>
                    <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${STATE_STYLES[ticket.state]}`}>
                      {STATE_LABELS[ticket.state]}
                    </span>
                    <span className="text-xs text-muted">{ticket.teamName}</span>
                    {ticket.epicTitle && (
                      <span className="text-xs text-muted">· {ticket.epicTitle}</span>
                    )}
                  </div>
                  <p className="mt-2 font-bold">{ticket.title}</p>
                </li>
              ))}
            </ul>
          )}
        </div>
      </main>
    </div>
  );
}
