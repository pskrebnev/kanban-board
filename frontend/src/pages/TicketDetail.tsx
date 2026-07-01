import { useEffect, useMemo, useState, type SyntheticEvent, type ReactElement } from "react";
import { useNavigate, useParams } from "react-router-dom";

import { apiErrorMessage } from "../api";
import { AppHeader } from "../components/AppHeader";
import { useCommentsStore } from "../store/comments";
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
  const deleteTicket = useTicketsStore((state) => state.deleteTicket);

  const comments = useCommentsStore((state) => state.comments);
  const commentsStatus = useCommentsStore((state) => state.status);
  const fetchComments = useCommentsStore((state) => state.fetchComments);
  const postComment = useCommentsStore((state) => state.postComment);
  const resetComments = useCommentsStore((state) => state.reset);

  const [ticket, setTicket] = useState<Ticket | null>(null);
  const [loadError, setLoadError] = useState("");

  const [commentBody, setCommentBody] = useState("");
  const [commentError, setCommentError] = useState("");
  const [postingComment, setPostingComment] = useState(false);

  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [type, setType] = useState<TicketType>("feature");
  const [stateValue, setStateValue] = useState<TicketState>("new");
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
    setStateValue(loaded.state);
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

  useEffect(() => {
    resetComments();
    void fetchComments(id);
  }, [id, fetchComments, resetComments]);

  const teamEpics = useMemo(() => epics.filter((epic) => epic.teamId === teamId), [epics, teamId]);

  async function handleAddComment(event: SyntheticEvent) {
    event.preventDefault();
    setCommentError("");
    setPostingComment(true);
    try {
      await postComment(id, commentBody);
      // Clear the input before refetching, so the re-rendered list can't race
      // with (and clobber) a value the user starts typing next.
      setCommentBody("");
      await fetchComments(id);
    } catch (err) {
      setCommentError(apiErrorMessage(err, "Could not add comment."));
    } finally {
      setPostingComment(false);
    }
  }

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
        state: stateValue,
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
          <div className="flex flex-wrap items-center gap-2">
            <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${TYPE_STYLES[ticket.type]}`}>
              {TYPE_LABELS[ticket.type]}
            </span>
            <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${STATE_STYLES[ticket.state]}`}>
              {STATE_LABELS[ticket.state]}
            </span>
          </div>
        </section>

        <div className="mx-auto max-w-[680px] space-y-6">
          <form
            className="grid gap-4 rounded-2xl border border-line bg-white p-6 shadow-[0_16px_40px_rgb(23_32_51/6%)]"
            onSubmit={handleSave}
          >
            <div>
              <label htmlFor="edit-state" className={labelClass}>
                State
              </label>
              <select
                id="edit-state"
                aria-label="State"
                className={fieldClass}
                value={stateValue}
                onChange={(event) => setStateValue(event.target.value as TicketState)}
              >
                {TICKET_STATES.map((state) => (
                  <option key={state} value={state}>
                    {STATE_LABELS[state]}
                  </option>
                ))}
              </select>
            </div>

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

          <section
            aria-label="Comments"
            className="rounded-2xl border border-line bg-white p-6 shadow-[0_16px_40px_rgb(23_32_51/6%)]"
          >
            <div className="mb-4 flex items-baseline justify-between">
              <h2 className="text-lg font-bold">Comments</h2>
              {commentsStatus === "ready" && comments.length > 0 && (
                <span className="text-[0.85rem] text-muted">{comments.length}</span>
              )}
            </div>

            {commentsStatus === "loading" && (
              <p className="text-[0.85rem] text-muted">Loading comments…</p>
            )}

            {commentsStatus === "error" && (
              <p className="error">Could not load comments.</p>
            )}

            {commentsStatus === "ready" && comments.length === 0 && (
              <p className="text-[0.85rem] text-muted">No comments yet.</p>
            )}

            {commentsStatus === "ready" && comments.length > 0 && (
              <ul className="mb-5 space-y-3">
                {comments.map((comment) => (
                  <li
                    key={comment.id}
                    className="rounded-lg border border-line bg-ticket p-4"
                  >
                    <div className="mb-1 flex items-baseline justify-between gap-3">
                      <span className="text-[0.85rem] font-bold">{comment.authorEmail}</span>
                      <span className="text-xs text-muted">
                        {new Date(comment.createdAt).toLocaleString()}
                      </span>
                    </div>
                    <p className="whitespace-pre-wrap break-words text-[0.9rem]">{comment.body}</p>
                  </li>
                ))}
              </ul>
            )}

            <form className="grid gap-3" onSubmit={handleAddComment}>
              <label htmlFor="new-comment" className={labelClass}>
                Add comment
              </label>
              <textarea
                id="new-comment"
                aria-label="Add comment"
                className={fieldClass}
                placeholder="Write a comment…"
                value={commentBody}
                onChange={(event) => setCommentBody(event.target.value)}
                maxLength={20000}
                rows={3}
                required
              />
              {commentError && <p className="error">{commentError}</p>}
              <div className="flex justify-end">
                <button
                  type="submit"
                  className={primaryBtn}
                  disabled={postingComment || commentBody.trim() === ""}
                >
                  {postingComment ? "Posting…" : "Post comment"}
                </button>
              </div>
            </form>
          </section>
        </div>
      </main>
    </div>
  );
}
