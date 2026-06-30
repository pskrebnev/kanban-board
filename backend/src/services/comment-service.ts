import type pg from "pg";

import { NotFoundError } from "../errors.js";
import {
  createComment,
  findCommentById,
  listCommentsByTicket,
  type CommentDetailRow,
} from "../repositories/comment-repository.js";
import { findTicketById } from "../repositories/ticket-repository.js";

export type Comment = {
  id: string;
  ticketId: string;
  authorId: string;
  authorEmail: string;
  body: string;
  createdAt: string;
};

export type CommentServiceDeps = {
  pool: pg.Pool;
};

export type CommentService = {
  list(ticketId: string): Promise<Comment[]>;
  add(ticketId: string, body: string, authorId: string): Promise<Comment>;
};

function toComment(row: CommentDetailRow): Comment {
  return {
    id: row.id,
    ticketId: row.ticket_id,
    authorId: row.author_id,
    authorEmail: row.author_email,
    body: row.body,
    createdAt: row.created_at.toISOString(),
  };
}

export function createCommentService(deps: CommentServiceDeps): CommentService {
  const { pool } = deps;

  // Both list and add require the parent ticket to exist; reuse the Phase 5
  // ticket lookup so the 404 semantics match the tickets resource.
  async function assertTicketExists(ticketId: string): Promise<void> {
    const ticket = await findTicketById(pool, ticketId);
    if (!ticket) {
      throw new NotFoundError("Ticket not found");
    }
  }

  return {
    async list(ticketId) {
      await assertTicketExists(ticketId);
      const rows = await listCommentsByTicket(pool, ticketId);
      return rows.map(toComment);
    },

    async add(ticketId, body, authorId) {
      await assertTicketExists(ticketId);

      // author_id always comes from the caller's session, never the request
      // body. Adding a comment must not touch the ticket's modified_at — the
      // repository inserts only into `comments`.
      const id = await createComment(pool, { ticketId, authorId, body });
      const row = await findCommentById(pool, id);
      if (!row) {
        throw new Error("Failed to load created comment");
      }
      return toComment(row);
    },
  };
}
