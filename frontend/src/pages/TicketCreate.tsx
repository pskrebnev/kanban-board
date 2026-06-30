import { useEffect, useMemo, useState, type SyntheticEvent, type ReactElement } from "react";
import { useNavigate } from "react-router-dom";

import { apiErrorMessage } from "../api";
import { AppHeader } from "../components/AppHeader";
import { useEpicsStore } from "../store/epics";
import { useTeamsStore } from "../store/teams";
import { TICKET_TYPES, TYPE_LABELS, useTicketsStore, type TicketType } from "../store/tickets";

const fieldClass = "w-full rounded-lg border border-field px-3 py-2 font-[inherit]";
const primaryBtn =
  "rounded-full bg-brand px-4 py-2 font-bold text-white disabled:cursor-not-allowed disabled:opacity-55";
const secondaryBtn = "rounded-full bg-brand-soft px-4 py-2 font-bold text-brand";
const labelClass = "mb-1 block text-[0.85rem] font-bold text-muted";

export function TicketCreate(): ReactElement {
  const navigate = useNavigate();

  const teams = useTeamsStore((state) => state.teams);
  const fetchTeams = useTeamsStore((state) => state.fetchTeams);
  const epics = useEpicsStore((state) => state.epics);
  const setFilterTeam = useEpicsStore((state) => state.setFilterTeam);
  const createTicket = useTicketsStore((state) => state.createTicket);

  const [teamId, setTeamId] = useState("");
  const [type, setType] = useState<TicketType>("feature");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [epicId, setEpicId] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void fetchTeams();
    // Load all epics so they can be filtered client-side by the chosen team.
    void setFilterTeam(null);
  }, [fetchTeams, setFilterTeam]);

  const teamEpics = useMemo(
    () => epics.filter((epic) => epic.teamId === teamId),
    [epics, teamId],
  );

  function handleTeamChange(nextTeamId: string) {
    setTeamId(nextTeamId);
    // The previously chosen epic may not belong to the new team.
    setEpicId("");
  }

  async function handleSubmit(event: SyntheticEvent) {
    event.preventDefault();
    setError("");
    setSaving(true);

    try {
      const ticket = await createTicket({
        teamId,
        type,
        title,
        body,
        epicId: epicId || null,
      });
      navigate(`/tickets/${ticket.id}`);
    } catch (err) {
      setError(apiErrorMessage(err, "Could not create ticket."));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="app">
      <AppHeader />

      <main className="min-h-screen p-12">
        <section className="mx-auto mb-8 max-w-[680px]">
          <p className="mb-3 text-[0.8rem] font-extrabold uppercase tracking-[0.12em] text-brand">
            Ticket management
          </p>
          <h1 className="mb-2 text-4xl font-bold">New ticket</h1>
        </section>

        <div className="mx-auto max-w-[680px]">
          {teams.length === 0 ? (
            <p className="text-[0.85rem] text-muted">
              You need a team first.{" "}
              <button
                type="button"
                className="bg-transparent p-0 font-bold text-brand underline"
                onClick={() => navigate("/teams")}
              >
                Create a team
              </button>{" "}
              to add tickets.
            </p>
          ) : (
            <form
              className="grid gap-4 rounded-2xl border border-line bg-white p-6 shadow-[0_16px_40px_rgb(23_32_51/6%)]"
              onSubmit={handleSubmit}
            >
              <div>
                <label htmlFor="ticket-team" className={labelClass}>
                  Team
                </label>
                <select
                  id="ticket-team"
                  aria-label="Team"
                  className={fieldClass}
                  value={teamId}
                  onChange={(event) => handleTeamChange(event.target.value)}
                  required
                >
                  <option value="" disabled>
                    Select a team…
                  </option>
                  {teams.map((team) => (
                    <option key={team.id} value={team.id}>
                      {team.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor="ticket-type" className={labelClass}>
                  Type
                </label>
                <select
                  id="ticket-type"
                  aria-label="Type"
                  className={fieldClass}
                  value={type}
                  onChange={(event) => setType(event.target.value as TicketType)}
                >
                  {TICKET_TYPES.map((value) => (
                    <option key={value} value={value}>
                      {TYPE_LABELS[value]}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor="ticket-epic" className={labelClass}>
                  Epic (optional)
                </label>
                <select
                  id="ticket-epic"
                  aria-label="Epic"
                  className={fieldClass}
                  value={epicId}
                  onChange={(event) => setEpicId(event.target.value)}
                  disabled={teamId === ""}
                >
                  <option value="">No epic</option>
                  {teamEpics.map((epic) => (
                    <option key={epic.id} value={epic.id}>
                      {epic.title}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor="ticket-title" className={labelClass}>
                  Title
                </label>
                <input
                  id="ticket-title"
                  type="text"
                  className={fieldClass}
                  placeholder="Ticket title"
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  maxLength={200}
                  required
                />
              </div>

              <div>
                <label htmlFor="ticket-body" className={labelClass}>
                  Body
                </label>
                <textarea
                  id="ticket-body"
                  className={fieldClass}
                  placeholder="Describe the work"
                  value={body}
                  onChange={(event) => setBody(event.target.value)}
                  maxLength={20000}
                  rows={6}
                  required
                />
              </div>

              {error && <p className="error">{error}</p>}

              <div className="flex gap-2">
                <button
                  type="submit"
                  className={primaryBtn}
                  disabled={saving || teamId === "" || title.trim() === "" || body.trim() === ""}
                >
                  {saving ? "Creating…" : "Create ticket"}
                </button>
                <button type="button" className={secondaryBtn} onClick={() => navigate("/tickets")}>
                  Cancel
                </button>
              </div>
            </form>
          )}
        </div>
      </main>
    </div>
  );
}
