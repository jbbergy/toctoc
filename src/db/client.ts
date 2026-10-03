import { PGlite } from '@electric-sql/pglite'
import { migrate } from './repository'

let instance: Promise<PGlite> | null = null

/** Base PostgreSQL embarquée (WASM), persistée dans IndexedDB. */
export function getDb(): Promise<PGlite> {
  instance ??= (async () => {
    const db = await PGlite.create('idb://toctoc')
    await migrate(db)
    // Demande au navigateur de ne pas évincer les données (historique médical).
    try {
      await navigator.storage?.persist?.()
    } catch {
      /* non bloquant */
    }
    return db
  })()
  return instance
}
