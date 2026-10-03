import type { PGlite, Transaction } from '@electric-sql/pglite'
import { LOCAL_SCHEMA } from './schema'
import type { EventKind, SyncRow, TrackedEvent } from './types'

type Queryable = Pick<PGlite | Transaction, 'query'>

interface EventRow {
  id: string
  kind: EventKind
  occurred_at: Date
  duration_ms: number | null
}

const toEvent = (r: EventRow): TrackedEvent => ({
  id: r.id,
  kind: r.kind,
  t: r.occurred_at.getTime(),
  durationMs: r.duration_ms ?? 0,
})

export async function migrate(db: PGlite): Promise<void> {
  await db.exec(LOCAL_SCHEMA)
}

export async function listEvents(db: Queryable): Promise<TrackedEvent[]> {
  const res = await db.query<EventRow>(
    `SELECT id, kind, occurred_at, duration_ms
       FROM events
      WHERE deleted_at IS NULL
      ORDER BY occurred_at DESC`,
  )
  return res.rows.map(toEvent)
}

export async function addEvent(
  db: Queryable,
  kind: EventKind,
  at: Date = new Date(),
  durationMs?: number,
): Promise<TrackedEvent> {
  const id = crypto.randomUUID()
  const res = await db.query<EventRow>(
    `INSERT INTO events (id, kind, occurred_at, duration_ms)
     VALUES ($1, $2, $3, $4)
     RETURNING id, kind, occurred_at, duration_ms`,
    [id, kind, at.toISOString(), durationMs ? Math.round(durationMs) : null],
  )
  return toEvent(res.rows[0])
}

/** Suppression douce : la ligne reste pour propager la suppression. */
export async function deleteEvent(db: Queryable, id: string): Promise<void> {
  await db.query(
    `UPDATE events
        SET deleted_at = now(), updated_at = now(), dirty = true
      WHERE id = $1 AND deleted_at IS NULL`,
    [id],
  )
}

export async function getMeta(db: Queryable, key: string): Promise<string | null> {
  const res = await db.query<{ value: string }>('SELECT value FROM meta WHERE key = $1', [key])
  return res.rows[0]?.value ?? null
}

export async function setMeta(db: Queryable, key: string, value: string): Promise<void> {
  await db.query(
    `INSERT INTO meta (key, value) VALUES ($1, $2)
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
    [key, value],
  )
}

/* ---------- Synchronisation ---------- */

export async function pendingChanges(db: Queryable): Promise<SyncRow[]> {
  const res = await db.query<SyncRow>(
    `SELECT id, kind,
            to_json(occurred_at)#>>'{}' AS occurred_at,
            duration_ms,
            to_json(updated_at)#>>'{}' AS updated_at,
            to_json(deleted_at)#>>'{}' AS deleted_at
       FROM events
      WHERE dirty`,
  )
  return res.rows
}

/** Marque comme synchronisées les lignes poussées, sauf si modifiées entre-temps. */
export async function markPushed(db: Queryable, rows: SyncRow[]): Promise<void> {
  for (const r of rows) {
    await db.query(`UPDATE events SET dirty = false WHERE id = $1 AND updated_at = $2`, [
      r.id,
      r.updated_at,
    ])
  }
}

/** Applique les changements distants (dernière écriture gagnante). */
export async function applyRemote(db: Queryable, rows: SyncRow[]): Promise<number> {
  let applied = 0
  for (const r of rows) {
    const res = await db.query(
      `INSERT INTO events (id, kind, occurred_at, duration_ms, updated_at, deleted_at, dirty)
       VALUES ($1, $2, $3, $4, $5, $6, false)
       ON CONFLICT (id) DO UPDATE SET
         kind = EXCLUDED.kind,
         occurred_at = EXCLUDED.occurred_at,
         duration_ms = EXCLUDED.duration_ms,
         updated_at = EXCLUDED.updated_at,
         deleted_at = EXCLUDED.deleted_at,
         dirty = false
       WHERE events.updated_at < EXCLUDED.updated_at`,
      [r.id, r.kind, r.occurred_at, r.duration_ms, r.updated_at, r.deleted_at],
    )
    applied += res.affectedRows ?? 0
  }
  return applied
}
