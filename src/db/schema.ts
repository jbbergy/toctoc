/**
 * Schéma local (PGlite). Les suppressions sont « douces » (deleted_at) afin de
 * pouvoir être propagées au serveur PostgreSQL lors de la synchronisation.
 */
export const LOCAL_SCHEMA = /* sql */ `
CREATE TABLE IF NOT EXISTS events (
  id          uuid PRIMARY KEY,
  kind        text NOT NULL CHECK (kind IN ('coup', 'contraction')),
  occurred_at timestamptz NOT NULL,
  duration_ms integer CHECK (duration_ms IS NULL OR duration_ms >= 0),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  deleted_at  timestamptz,
  dirty       boolean NOT NULL DEFAULT true
);

CREATE INDEX IF NOT EXISTS events_live_idx
  ON events (occurred_at DESC) WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS events_dirty_idx
  ON events (dirty) WHERE dirty;

CREATE TABLE IF NOT EXISTS meta (
  key   text PRIMARY KEY,
  value text NOT NULL
);
`
