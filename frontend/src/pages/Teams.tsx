import { useEffect, useState, type FormEvent, type ReactElement } from "react";
import { useNavigate } from "react-router-dom";

import { apiErrorMessage } from "../api";
import { useAuthStore } from "../store/auth";
import { useTeamsStore, type Team } from "../store/teams";

export function Teams(): ReactElement {
  const navigate = useNavigate();
  const user = useAuthStore((state) => state.user);
  const logout = useAuthStore((state) => state.logout);

  const teams = useTeamsStore((state) => state.teams);
  const status = useTeamsStore((state) => state.status);
  const fetchTeams = useTeamsStore((state) => state.fetchTeams);
  const createTeam = useTeamsStore((state) => state.createTeam);

  const [newName, setNewName] = useState("");
  const [createError, setCreateError] = useState("");
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    void fetchTeams();
  }, [fetchTeams]);

  async function handleLogout() {
    await logout();
    navigate("/login", { replace: true });
  }

  async function handleCreate(event: FormEvent) {
    event.preventDefault();
    setCreateError("");
    setCreating(true);

    try {
      await createTeam(newName);
      setNewName("");
    } catch (error) {
      setCreateError(apiErrorMessage(error, "Could not create team."));
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

      <main className="shell">
        <section className="hero">
          <p className="eyebrow">Team management</p>
          <h1>Teams</h1>
          <p className="text-[0.85rem] text-[#5a6680]">
            Teams group the epics and tickets created in later phases.
          </p>
        </section>

        <form className="team-create" onSubmit={handleCreate}>
          <input
            type="text"
            placeholder="New team name"
            value={newName}
            onChange={(event) => setNewName(event.target.value)}
            maxLength={100}
            required
          />
          <button type="submit" disabled={creating || newName.trim().length === 0}>
            {creating ? "Creating…" : "Create team"}
          </button>
        </form>
        {createError && <p className="error">{createError}</p>}

        {status === "loading" && <p className="muted">Loading teams…</p>}
        {status === "error" && (
          <p className="error">Could not load teams. Please refresh and try again.</p>
        )}
        {status === "ready" && teams.length === 0 && (
          <p className="muted">No teams yet. Create your first team above.</p>
        )}

        {teams.length > 0 && (
          <ul className="team-list">
            {teams.map((team) => (
              <TeamRow key={team.id} team={team} />
            ))}
          </ul>
        )}
      </main>
    </div>
  );
}

function TeamRow({ team }: { team: Team }): ReactElement {
  const renameTeam = useTeamsStore((state) => state.renameTeam);
  const deleteTeam = useTeamsStore((state) => state.deleteTeam);

  const [editing, setEditing] = useState(false);
  const [draftName, setDraftName] = useState(team.name);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  function startEditing() {
    setDraftName(team.name);
    setError("");
    setEditing(true);
  }

  async function handleRename(event: FormEvent) {
    event.preventDefault();
    setError("");
    setBusy(true);

    try {
      await renameTeam(team.id, draftName);
      setEditing(false);
    } catch (err) {
      setError(apiErrorMessage(err, "Could not rename team."));
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete() {
    setError("");
    setBusy(true);

    try {
      await deleteTeam(team.id);
    } catch (err) {
      setError(apiErrorMessage(err, "Could not delete team."));
      setConfirmingDelete(false);
    } finally {
      setBusy(false);
    }
  }

  return (
    <li className="team-row">
      {editing ? (
        <form className="team-edit" onSubmit={handleRename}>
          <input
            type="text"
            value={draftName}
            onChange={(event) => setDraftName(event.target.value)}
            maxLength={100}
            autoFocus
            required
          />
          <div className="team-actions">
            <button type="submit" disabled={busy || draftName.trim().length === 0}>
              Save
            </button>
            <button
              type="button"
              className="secondary"
              onClick={() => setEditing(false)}
              disabled={busy}
            >
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <>
          <span className="team-name">{team.name}</span>
          <div className="team-actions">
            <button type="button" className="secondary" onClick={startEditing} disabled={busy}>
              Rename
            </button>
            {confirmingDelete ? (
              <>
                <span className="muted">Delete?</span>
                <button type="button" className="danger" onClick={handleDelete} disabled={busy}>
                  Confirm
                </button>
                <button
                  type="button"
                  className="secondary"
                  onClick={() => setConfirmingDelete(false)}
                  disabled={busy}
                >
                  Cancel
                </button>
              </>
            ) : (
              <button
                type="button"
                className="danger"
                onClick={() => setConfirmingDelete(true)}
                disabled={busy || team.referenced}
                title={
                  team.referenced
                    ? "This team has epics or tickets and cannot be deleted"
                    : undefined
                }
              >
                Delete
              </button>
            )}
          </div>
        </>
      )}

      {team.referenced && !editing && (
        <span className="team-hint muted">Has epics or tickets — cannot be deleted</span>
      )}
      {error && <span className="error">{error}</span>}
    </li>
  );
}
