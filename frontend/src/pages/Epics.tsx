import { useEffect, useState, type SyntheticEvent, type ReactElement } from "react";
import { useNavigate } from "react-router-dom";

import { apiErrorMessage } from "../api";
import { useAuthStore } from "../store/auth";
import { useEpicsStore, type Epic } from "../store/epics";
import { useTeamsStore } from "../store/teams";

const primaryBtn =
  "rounded-full bg-brand px-4 py-2 font-bold text-white disabled:cursor-not-allowed disabled:opacity-55";
const secondaryBtn = "rounded-full bg-brand-soft px-4 py-2 font-bold text-brand disabled:opacity-55";
const dangerBtn = "rounded-full bg-danger-soft px-4 py-2 font-bold text-danger disabled:opacity-55";
const fieldClass = "rounded-lg border border-field px-3 py-2 font-[inherit]";

export function Epics(): ReactElement {
  const navigate = useNavigate();
  const user = useAuthStore((state) => state.user);
  const logout = useAuthStore((state) => state.logout);

  const teams = useTeamsStore((state) => state.teams);
  const fetchTeams = useTeamsStore((state) => state.fetchTeams);

  const epics = useEpicsStore((state) => state.epics);
  const status = useEpicsStore((state) => state.status);
  const filterTeamId = useEpicsStore((state) => state.filterTeamId);
  const setFilterTeam = useEpicsStore((state) => state.setFilterTeam);
  const fetchEpics = useEpicsStore((state) => state.fetchEpics);
  const createEpic = useEpicsStore((state) => state.createEpic);

  const [teamId, setTeamId] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [createError, setCreateError] = useState("");
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    void fetchTeams();
    void fetchEpics();
  }, [fetchTeams, fetchEpics]);

  async function handleLogout() {
    await logout();
    navigate("/login", { replace: true });
  }

  async function handleCreate(event: SyntheticEvent) {
    event.preventDefault();
    setCreateError("");
    setCreating(true);

    try {
      await createEpic(teamId, {
        title,
        description: description.trim().length > 0 ? description.trim() : null,
      });
      setTitle("");
      setDescription("");
    } catch (error) {
      setCreateError(apiErrorMessage(error, "Could not create epic."));
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="app">
      <header className="topbar">
        <span className="brand">Kanban Ticketing</span>
        <nav className="topbar-nav">
          <button type="button" className="link-button" onClick={() => navigate("/")}>
            Board
          </button>
          <button type="button" className="link-button" onClick={() => navigate("/teams")}>
            Teams
          </button>
          <button type="button" className="link-button" onClick={() => navigate("/tickets")}>
            Tickets
          </button>
        </nav>
        <div className="user-menu">
          <span className="user-button" aria-hidden="true">
            {user?.email ?? "Account"}
          </span>
          <button type="button" className="link-button" onClick={handleLogout}>
            Log out
          </button>
        </div>
      </header>

      <main className="min-h-screen p-12">
        <section className="mx-auto mb-8 max-w-[980px]">
          <p className="mb-3 text-[0.8rem] font-extrabold uppercase tracking-[0.12em] text-brand">
            Epic management
          </p>
          <h1 className="mb-2 text-4xl font-bold">Epics</h1>
          <p className="text-[0.85rem] text-muted">
            Epics belong to one team and group the tickets created in later phases.
          </p>
        </section>

        <div className="mx-auto max-w-[980px]">
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
              to add epics.
            </p>
          ) : (
            <form
              className="mb-6 grid gap-3 rounded-2xl border border-line bg-white p-5 shadow-[0_16px_40px_rgb(23_32_51/6%)] sm:grid-cols-[200px_1fr_auto]"
              onSubmit={handleCreate}
            >
              <select
                aria-label="Team"
                className={fieldClass}
                value={teamId}
                onChange={(event) => setTeamId(event.target.value)}
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
              <input
                type="text"
                className={fieldClass}
                placeholder="Epic title"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                maxLength={200}
                required
              />
              <button
                type="submit"
                className={`${primaryBtn} whitespace-nowrap`}
                disabled={creating || teamId === "" || title.trim().length === 0}
              >
                {creating ? "Creating…" : "Create epic"}
              </button>
              <textarea
                className={`${fieldClass} sm:col-span-3`}
                placeholder="Description (optional)"
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                maxLength={2000}
                rows={2}
              />
            </form>
          )}

          {createError && <p className="error mb-4">{createError}</p>}

          <div className="mb-4 flex items-center gap-2">
            <label htmlFor="epic-team-filter" className="text-[0.85rem] font-bold text-muted">
              Filter by team
            </label>
            <select
              id="epic-team-filter"
              aria-label="Filter by team"
              className={fieldClass}
              value={filterTeamId ?? ""}
              onChange={(event) => void setFilterTeam(event.target.value || null)}
            >
              <option value="">All teams</option>
              {teams.map((team) => (
                <option key={team.id} value={team.id}>
                  {team.name}
                </option>
              ))}
            </select>
          </div>

          {status === "loading" && <p className="text-[0.85rem] text-muted">Loading epics…</p>}
          {status === "error" && (
            <p className="error">Could not load epics. Please refresh and try again.</p>
          )}
          {status === "ready" && epics.length === 0 && (
            <p className="text-[0.85rem] text-muted">No epics yet. Create your first epic above.</p>
          )}

          {epics.length > 0 && (
            <ul className="space-y-3">
              {epics.map((epic) => (
                <EpicCard key={epic.id} epic={epic} />
              ))}
            </ul>
          )}
        </div>
      </main>
    </div>
  );
}

function EpicCard({ epic }: { epic: Epic }): ReactElement {
  const updateEpic = useEpicsStore((state) => state.updateEpic);
  const deleteEpic = useEpicsStore((state) => state.deleteEpic);

  const [editing, setEditing] = useState(false);
  const [draftTitle, setDraftTitle] = useState(epic.title);
  const [draftDescription, setDraftDescription] = useState(epic.description ?? "");
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  function startEditing() {
    setDraftTitle(epic.title);
    setDraftDescription(epic.description ?? "");
    setError("");
    setEditing(true);
  }

  async function handleSave(event: SyntheticEvent) {
    event.preventDefault();
    setError("");
    setBusy(true);

    try {
      await updateEpic(epic.id, {
        title: draftTitle,
        description: draftDescription.trim().length > 0 ? draftDescription.trim() : null,
      });
      setEditing(false);
    } catch (err) {
      setError(apiErrorMessage(err, "Could not update epic."));
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete() {
    setError("");
    setBusy(true);

    try {
      await deleteEpic(epic.id);
    } catch (err) {
      setError(apiErrorMessage(err, "Could not delete epic."));
      setConfirmingDelete(false);
    } finally {
      setBusy(false);
    }
  }

  return (
    <li className="rounded-2xl border border-line bg-white p-5 shadow-[0_16px_40px_rgb(23_32_51/6%)]">
      {editing ? (
        <form className="grid gap-3" onSubmit={handleSave}>
          <input
            type="text"
            className={fieldClass}
            value={draftTitle}
            onChange={(event) => setDraftTitle(event.target.value)}
            maxLength={200}
            autoFocus
            required
          />
          <textarea
            className={fieldClass}
            value={draftDescription}
            onChange={(event) => setDraftDescription(event.target.value)}
            maxLength={2000}
            rows={2}
            placeholder="Description (optional)"
          />
          <div className="flex gap-2">
            <button type="submit" className={primaryBtn} disabled={busy || draftTitle.trim().length === 0}>
              Save
            </button>
            <button
              type="button"
              className={secondaryBtn}
              onClick={() => setEditing(false)}
              disabled={busy}
            >
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <span className="mb-2 inline-block rounded-full bg-brand-soft px-2 py-0.5 text-xs font-bold text-brand">
                {epic.teamName}
              </span>
              <p className="font-bold">{epic.title}</p>
              {epic.description && <p className="mt-1 text-[0.9rem] text-muted">{epic.description}</p>}
            </div>
            <div className="flex items-center gap-2">
              <button type="button" className={secondaryBtn} onClick={startEditing} disabled={busy}>
                Edit
              </button>
              {confirmingDelete ? (
                <>
                  <span className="text-[0.85rem] text-muted">Delete?</span>
                  <button type="button" className={dangerBtn} onClick={handleDelete} disabled={busy}>
                    Confirm
                  </button>
                  <button
                    type="button"
                    className={secondaryBtn}
                    onClick={() => setConfirmingDelete(false)}
                    disabled={busy}
                  >
                    Cancel
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  className={dangerBtn}
                  onClick={() => setConfirmingDelete(true)}
                  disabled={busy || epic.referenced}
                  title={
                    epic.referenced ? "This epic has tickets and cannot be deleted" : undefined
                  }
                >
                  Delete
                </button>
              )}
            </div>
          </div>
          {epic.referenced && (
            <p className="mt-2 text-[0.85rem] text-muted">Has tickets — cannot be deleted</p>
          )}
          {error && <p className="error mt-2">{error}</p>}
        </>
      )}
    </li>
  );
}
