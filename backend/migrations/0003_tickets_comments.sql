-- Up Migration

CREATE TYPE ticket_type AS ENUM ('bug', 'feature', 'fix');

CREATE TYPE ticket_state AS ENUM (
  'new',
  'ready_for_implementation',
  'in_progress',
  'ready_for_acceptance',
  'done'
);

CREATE TABLE tickets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id uuid NOT NULL REFERENCES teams (id) ON DELETE RESTRICT,
  epic_id uuid REFERENCES epics (id) ON DELETE RESTRICT,
  type ticket_type NOT NULL,
  state ticket_state NOT NULL DEFAULT 'new',
  title text NOT NULL,
  body text NOT NULL,
  created_by uuid NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  modified_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_tickets_team_id ON tickets (team_id);
CREATE INDEX idx_tickets_epic_id ON tickets (epic_id);
CREATE INDEX idx_tickets_state ON tickets (state);
CREATE INDEX idx_tickets_modified_at ON tickets (modified_at DESC);

CREATE TABLE comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id uuid NOT NULL REFERENCES tickets (id) ON DELETE CASCADE,
  author_id uuid NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_comments_ticket_id ON comments (ticket_id);

-- Down Migration

DROP TABLE comments;
DROP TABLE tickets;
DROP TYPE ticket_state;
DROP TYPE ticket_type;
