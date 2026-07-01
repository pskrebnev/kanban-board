import { useEffect, useState, type SyntheticEvent, type ReactElement } from "react";

import { apiErrorMessage } from "../api";
import { AppHeader } from "../components/AppHeader";
import { useTeamsStore, type Team } from "../store/teams";

export function Teams(): ReactElement {
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

  async function handleCreate(event: SyntheticEvent) {
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
      <AppHeader />

      <main className="min-h-screen p-8">
        <section className="mx-auto mb-8 max-w-[980px]">
          <p className="eyebrow">Team management</p>
          <h1 className="mb-6 text-[clamp(2rem,5vw,4rem)] leading-none">Teams</h1>
          <p className="text-[0.85rem] text-muted">
            Teams group the epics and tickets created in later phases.
          </p>
        </section>

        <form className="mx-auto mb-6 flex max-w-[980px] gap-2" onSubmit={handleCreate}>
          <input
            type="text"
            placeholder="New team name"
            className="flex-1 rounded-lg border border-field px-3.5 py-2.5 font-[inherit]"
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
          <ul className="mx-auto mt-4 max-w-[980px] list-none p-0">
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

  async function handleRename(event: SyntheticEvent) {
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
    <li className="mb-3 flex flex-wrap items-center justify-between gap-x-4 rounded-[0.85rem] border border-line bg-white px-5 py-4 shadow-[0_16px_40px_rgb(23_32_51/6%)] hover:border-field hover:shadow-[0_18px_44px_rgb(23_32_51/10%)]">
      {editing ? (
        <form className="flex flex-1 items-center gap-2" onSubmit={handleRename}>
          <input
            type="text"
            aria-label="Team name"
            className="flex-1 rounded-lg border border-field px-3 py-2.5 font-[inherit]"
            value={draftName}
            onChange={(event) => setDraftName(event.target.value)}
            maxLength={100}
            autoFocus
            required
          />
          <div className="flex items-center gap-2">
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
          <span className="font-bold">{team.name}</span>
          <div className="flex items-center gap-2">
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
        <span className="muted basis-full">Has epics or tickets — cannot be deleted</span>
      )}
      {error && <span className="error">{error}</span>}
    </li>
  );
}
