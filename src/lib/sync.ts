import type { PGlite } from '@electric-sql/pglite'
import { applyRemote, getMeta, markPushed, pendingChanges, setMeta } from '../db/repository'
import type { SyncRow } from '../db/types'

const API = (import.meta.env.VITE_SYNC_URL as string | undefined)?.replace(/\/$/, '')

export const syncEnabled = Boolean(API)

async function spaceId(db: PGlite): Promise<string> {
  let id = await getMeta(db, 'space_id')
  if (!id) {
    id = crypto.randomUUID()
    await setMeta(db, 'space_id', id)
  }
  return id
}

let running: Promise<number> | null = null

/**
 * Pousse les changements locaux vers PostgreSQL puis récupère les changements
 * distants. Renvoie le nombre de lignes distantes appliquées localement.
 */
export function sync(db: PGlite): Promise<number> {
  if (!API || !navigator.onLine) return Promise.resolve(0)
  running ??= (async () => {
    try {
      const space = await spaceId(db)
      const since = Number((await getMeta(db, 'sync_cursor')) ?? 0)
      const changes = await pendingChanges(db)
      const res = await fetch(`${API}/spaces/${space}/sync`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ since, changes }),
      })
      if (!res.ok) throw new Error(`Synchronisation refusée (${res.status})`)
      const body = (await res.json()) as { cursor: number; changes: SyncRow[] }
      let applied = 0
      await db.transaction(async (tx) => {
        await markPushed(tx, changes)
        applied = await applyRemote(tx, body.changes)
        await setMeta(tx, 'sync_cursor', String(body.cursor))
      })
      return applied
    } finally {
      running = null
    }
  })()
  return running
}
