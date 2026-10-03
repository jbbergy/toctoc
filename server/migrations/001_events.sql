-- Événements synchronisés depuis les appareils (PGlite) vers PostgreSQL.
CREATE TABLE IF NOT EXISTS events (
  id          uuid PRIMARY KEY,
  space_id    uuid NOT NULL,
  kind        text NOT NULL CHECK (kind IN ('coup', 'contraction')),
  occurred_at timestamptz NOT NULL,
  duration_ms integer CHECK (duration_ms IS NULL OR duration_ms >= 0),
  updated_at  timestamptz NOT NULL,
  deleted_at  timestamptz,
  -- Curseur monotone pour la récupération incrémentale.
  seq         bigserial NOT NULL
);

CREATE INDEX IF NOT EXISTS events_space_seq_idx ON events (space_id, seq);
