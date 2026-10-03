import { ref, shallowRef } from 'vue'
import type { PGlite } from '@electric-sql/pglite'
import { getDb } from '../db/client'
import { addEvent, deleteEvent, listEvents } from '../db/repository'
import type { EventKind, TrackedEvent } from '../db/types'
import { sync, syncEnabled } from '../lib/sync'

/** Événements non supprimés, du plus récent au plus ancien. */
const events = shallowRef<TrackedEvent[]>([])
const ready = ref(false)
const error = ref<string | null>(null)
let db: PGlite | null = null
let started = false
let syncTimer: ReturnType<typeof setTimeout> | undefined

async function reload() {
  if (db) events.value = await listEvents(db)
}

async function runSync() {
  if (!db) return
  try {
    if ((await sync(db)) > 0) await reload()
  } catch (e) {
    // Hors ligne ou serveur indisponible : les données restent locales.
    console.warn(e)
  }
}

function scheduleSync() {
  if (!syncEnabled) return
  clearTimeout(syncTimer)
  syncTimer = setTimeout(runSync, 1500)
}

async function start() {
  if (started) return
  started = true
  try {
    db = await getDb()
    await reload()
    ready.value = true
    if (syncEnabled) {
      void runSync()
      window.addEventListener('online', () => void runSync())
      setInterval(() => void runSync(), 60_000)
    }
  } catch (e) {
    console.error(e)
    error.value = 'Impossible d’ouvrir la base de données locale.'
  }
}

export function useEvents() {
  void start()

  async function add(kind: EventKind, at?: Date, durationMs?: number) {
    if (!db) throw new Error('Base non prête')
    const e = await addEvent(db, kind, at, durationMs)
    events.value = [e, ...events.value].sort((a, b) => b.t - a.t)
    scheduleSync()
    return e
  }

  async function remove(id: string) {
    if (!db) return
    await deleteEvent(db, id)
    events.value = events.value.filter((e) => e.id !== id)
    scheduleSync()
  }

  return { events, ready, error, add, remove }
}
