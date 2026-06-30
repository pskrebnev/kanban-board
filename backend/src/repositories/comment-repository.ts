import type pg from "pg";

import { query } from "../db/pool.js";

export type CommentRow = {
  id: string;
  ticket_id: string;
  author_id: string;
  body: string;
  created_at: Date;
};

// A comment row enriched with the author's email so the comments list renders
// without an N+1 lookup per comment.
export type CommentDetailRow = CommentRow & {
  author_email: string;
};

const DETAIL_SELECT = `
  select c.id,
         c.ticket_id,
         c.author_id,
         u.email as author_email,
         c.body,
         c.created_at
    from comments c
    join users u on u.id = c.author_id`;

// Oldest-first with a stable tiebreak on id, so concurrent inserts that share a
// created_at still return in a deterministic order (spec §7: chronological).
export async function listCommentsByTicket(
  pool: pg.Pool,
  ticketId: string,
): Promise<CommentDetailRow[]> {
  const result = await query<CommentDetailRow>(
    pool,
    `${DETAIL_SELECT} where c.ticket_id = $1 order by c.created_at asc, c.id asc`,
    [ticketId],
  );
  return result.rows;
}

export type CreateCommentRow = {
  ticketId: string;
  authorId: string;
  body: string;
};

// Inserts only into `comments` — never touches `tickets` — so the parent
// ticket's modified_at is left unchanged (spec §7).
export async function createComment(pool: pg.Pool, input: CreateCommentRow): Promise<string> {
  const result = await query<{ id: string }>(
    pool,
    `insert into comments (ticket_id, author_id, body)
     values ($1, $2, $3)
     returning id`,
    [input.ticketId, input.authorId, input.body],
  );

  const id = result.rows[0]?.id;
  if (!id) {
    throw new Error("Failed to create comment");
  }
  return id;
}

export async function findCommentById(
  pool: pg.Pool,
  id: string,
): Promise<CommentDetailRow | null> {
  const result = await query<CommentDetailRow>(pool, `${DETAIL_SELECT} where c.id = $1`, [id]);
  return result.rows[0] ?? null;
}
