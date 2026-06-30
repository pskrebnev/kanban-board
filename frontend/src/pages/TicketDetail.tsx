import { useEffect, useMemo, useState, type SyntheticEvent, type ReactElement } from "react";
import { useNavigate, useParams } from "react-router-dom";

import { apiErrorMessage } from "../api";
import { AppHeader } from "../components/AppHeader";
import { useEpicsStore } from "../store/epics";
import { useTeamsStore } from "../store/teams";
import {
  STATE_LABELS,
  TICKET_STATES,
  TICKET_TYPES,
  TYPE_LABELS,
  useTicketsStore,
  type Ticket,
  type TicketState,
  type TicketType,
} from "../store/tickets";

const fieldClass = "w-full rounded-lg border border-field px-3 py-2 font-[inherit]";
const primaryBtn =
  "rounded-full bg-brand px-4 py-2 font-bold text-white disabled:cursor-not-allowed disabled:opacity-55";
const secondaryBtn = "rounded-full bg-brand-soft px-4 py-2 font-bold text-brand";
const dangerBtn = "rounded-full bg-danger-soft px-4 py-2 font-bold text-danger disabled:opacity-55";
const labelClass = "mb-1 block text-[0.85rem] font-bold text-muted";

export function TicketDetail(): ReactElement {
  const navigate = useNavigate();
  const { id = "" } = useParams();

  const teams = useTeamsStore((state) => state.teams);
  const fetchTeams = useTeamsStore((state) => state.fetchTeams);
  const epics = useEpicsStore((state) => state.epics);
  const setFilterTeam = useEpicsStore((state) => state.setFilterTeam);

  const getTicket = useTicketsStore((state) => state.getTicket);
  const updateTicket = useTicketsStore((state) => state.updateTicket);
  const changeState = useTicketsStore((state) => state.changeState);
  const deleteTicket = useTicketsStore((state) => state.deleteTicket);

  const [ticket, setTicket] = useState<Ticket | null>(null);
  const [loadError, setLoadError] = useState("");

  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [type, setType] = useState<TicketType>("feature");
  const [teamId, setTeamId] = useState("");
  const [epicId, setEpicId] = useState("");

  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  function syncForm(loaded: Ticket) {
    setTicket(loaded);
    setTitle(loaded.title);
    setBody(loaded.body);
    setType(loaded.type);
    setTeamId(loaded.teamId);
    setEpicId(loaded.epicId ?? "");
  }

  useEffect(() => {
    void fetchTeams();
    void setFilterTeam(null);
  }, [fetchTeams, setFilterTeam]);

  useEffect(() => {
    let active = true;
    setLoadError("");
    getTicket(id)
      .then((loaded) => {
        if (active) syncForm(loaded);
      })
      .catch((err) => {
        if (active) setLoadError(apiErrorMessage(err, "Could not load ticket."));
      });
    return () => {
      active = false;
    };
  }, [id, getTicket]);

  const teamEpics = useMemo(() => epics.filter((epic) => epic.teamId === teamId), [epics, teamId]);

  function handleTeamChange(nextTeamId: string) {
    setTeamId(nextTeamId);
    setEpicId("");
  }

  async function handleSave(event: SyntheticEvent) {
    event.preventDefault();
    setError("");
    setSaving(true);

    try {
      const updated = await updateTicket(id, {
        title,
        body,
        type,
        teamId,
        epicId: epicId || null,
      });
      syncForm(updated);
    } catch (err) {
      setError(apiErrorMessage(err, "Could not save ticket."));
    } finally {
      setSaving(false);
    }
  }

  async function handleStateChange(nextState: TicketState) {
    setError("");
    try {
      const updated = await changeState(id, nextState);
      syncForm(updated);
    } catch (err) {
      setError(apiErrorMessage(err, "Could not change state."));
    }
  }

  async function handleDelete() {
    setError("");
    setSaving(true);
    try {
      await deleteTicket(id);
      navigate("/tickets");
    } catch (err) {
      setError(apiErrorMessage(err, "Could not delete ticket."));
      setConfirmingDelete(false);
      setSaving(false);
    }
  }

  if (loadError) {
    return (
      <div className="app">
        <AppHeader />
        <main className="min-h-screen p-12">
          <div className="mx-auto max-w-[680px]">
            <p className="error">{loadError}</p>
            <button type="button" className={secondaryBtn} onClick={() => navigate("/tickets")}>
              Back to tickets
            </button>
          </div>
        </main>
      </div>
    );
  }

  if (!ticket) {
    return (
      <div className="app">
        <AppHeader />
        <main className="min-h-screen p-12">
          <p className="mx-auto max-w-[680px] text-[0.85rem] text-muted">Loading ticket…</p>
        </main>
      </div>
    );
  }

  return (
    <div className="app">
      <AppHeader />

      <main className="min-h-screen p-12">
        <section className="mx-auto mb-8 max-w-[680px]">
          <p className="mb-3 text-[0.8rem] font-extrabold uppercase tracking-[0.12em] text-brand">
            Ticket details
          </p>
          <h1 className="mb-2 text-3xl font-bold">{ticket.title}</h1>
        </section>

        <div className="mx-auto max-w-[680px] space-y-6">
          <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-line bg-white p-5 shadow-[0_16px_40px_rgb(23_32_51/6%)]">
            <label htmlFor="ticket-state" className="text-[0.85rem] font-bold text-muted">
              State
            </label>
            <select
              id="ticket-state"
              aria-label="State"
              className="rounded-lg border border-field px-3 py-2 font-[inherit]"
              value={ticket.state}
              onChange={(event) => void handleStateChange(event.target.value as TicketState)}
            >
              {TICKET_STATES.map((state) => (
                <option key={state} value={state}>
                  {STATE_LABELS[state]}
                </option>
              ))}
            </select>
            <span className="text-xs text-muted">State changes save immediately.</span>
          </div>

          <form
            className="grid gap-4 rounded-2xl border border-line bg-white p-6 shadow-[0_16px_40px_rgb(23_32_51/6%)]"
            onSubmit={handleSave}
          >
            <div>
              <label htmlFor="edit-team" className={labelClass}>
                Team
              </label>
              <select
                id="edit-team"
                aria-label="Team"
                className={fieldClass}
                value={teamId}
                onChange={(event) => handleTeamChange(event.target.value)}
              >
                {teams.map((team) => (
                  <option key={team.id} value={team.id}>
                    {team.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="edit-type" className={labelClass}>
                Type
              </label>
              <select
                id="edit-type"
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
              <label htmlFor="edit-epic" className={labelClass}>
                Epic (optional)
              </label>
              <select
                id="edit-epic"
                aria-label="Epic"
                className={fieldClass}
                value={epicId}
                onChange={(event) => setEpicId(event.target.value)}
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
              <label htmlFor="edit-title" className={labelClass}>
                Title
              </label>
              <input
                id="edit-title"
                type="text"
                className={fieldClass}
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                maxLength={200}
                required
              />
            </div>

            <div>
              <label htmlFor="edit-body" className={labelClass}>
                Body
              </label>
              <textarea
                id="edit-body"
                className={fieldClass}
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
                disabled={saving || title.trim() === "" || body.trim() === ""}
              >
                {saving ? "Saving…" : "Save changes"}
              </button>
              {confirmingDelete ? (
                <>
                  <span className="self-center text-[0.85rem] text-muted">Delete this ticket?</span>
                  <button type="button" className={dangerBtn} onClick={handleDelete} disabled={saving}>
                    Confirm
                  </button>
                  <button
                    type="button"
                    className={secondaryBtn}
                    onClick={() => setConfirmingDelete(false)}
                    disabled={saving}
                  >
                    Cancel
                  </button>
                </>
              ) : (
                <button type="button" className={dangerBtn} onClick={() => setConfirmingDelete(true)}>
                  Delete
                </button>
              )}
            </div>
          </form>

          <dl className="grid grid-cols-2 gap-2 rounded-2xl border border-line bg-white p-5 text-[0.85rem] shadow-[0_16px_40px_rgb(23_32_51/6%)]">
            <dt className="font-bold text-muted">Created by</dt>
            <dd>{ticket.createdByEmail}</dd>
            <dt className="font-bold text-muted">Created at</dt>
            <dd>{new Date(ticket.createdAt).toLocaleString()}</dd>
            <dt className="font-bold text-muted">Last modified</dt>
            <dd>{new Date(ticket.modifiedAt).toLocaleString()}</dd>
          </dl>
        </div>
      </main>
    </div>
  );
}
