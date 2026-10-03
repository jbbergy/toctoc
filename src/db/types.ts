export type EventKind = 'coup' | 'contraction'

export interface TrackedEvent {
  id: string
  kind: EventKind
  /** Horodatage du début (ms epoch). */
  t: number
  /** Durée mesurée en ms (contractions maintenues), 0 sinon. */
  durationMs: number
}

/** Représentation échangée avec le serveur. */
export interface SyncRow {
  id: string
  kind: EventKind
  occurred_at: string
  duration_ms: number | null
  updated_at: string
  deleted_at: string | null
}
