import type { EventKind, TrackedEvent } from '../db/types'

const H = 3_600_000
/** Au-delà de cet écart, deux contractions ne sont plus considérées comme liées. */
export const MAX_GAP_MS = 2 * H

const JOURS = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi']
const MOIS = [
  'janvier', 'février', 'mars', 'avril', 'mai', 'juin',
  'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre',
]

export const pad = (n: number) => String(n).padStart(2, '0')

export const clock = (t: number) => {
  const d = new Date(t)
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export const dayKey = (t: number) => {
  const d = new Date(t)
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`
}

export function dayLabel(t: number, now: number): string {
  const k = dayKey(t)
  if (k === dayKey(now)) return 'Aujourd’hui'
  const y = new Date(now)
  y.setDate(y.getDate() - 1)
  if (k === dayKey(y.getTime())) return 'Hier'
  const d = new Date(t)
  const label = `${JOURS[d.getDay()]} ${d.getDate() === 1 ? '1er' : d.getDate()} ${MOIS[d.getMonth()]}`
  return d.getFullYear() === y.getFullYear() ? label : `${label} ${d.getFullYear()}`
}

export function ago(t: number, now: number): string {
  const mins = Math.floor((now - t) / 60000)
  if (mins < 1) return 'à l’instant'
  if (mins < 60) return `il y a ${mins} min`
  const h = Math.floor(mins / 60)
  if (h < 24) return `il y a ${h} h${mins % 60 ? ' ' + pad(mins % 60) : ''}`
  return `il y a ${Math.floor(h / 24)} j`
}

export const plural = (n: number, one: string, many: string) => `${n} ${n > 1 ? many : one}`

export function fmtDur(ms: number): string {
  const sec = Math.max(1, Math.round(ms / 1000))
  return sec < 60 ? `${sec} s` : `${Math.floor(sec / 60)} min ${pad(sec % 60)} s`
}

/** Écart en minutes entre deux contractions, ou null s'il est trop grand. */
export function gapMinutes(newer: TrackedEvent, older: TrackedEvent | undefined): number | null {
  if (!older) return null
  const gap = newer.t - older.t
  return gap < MAX_GAP_MS ? Math.max(1, Math.round(gap / 60000)) : null
}

export type Filter = 'tout' | 'coups' | 'contractions'

export interface HistoryItem {
  id: string
  kind: EventKind
  t: number
  time: string
  iso: string
  sub: string
}

export interface HistoryGroup {
  key: string
  day: string
  summary: string
  items: HistoryItem[]
}

/** `events` doit être trié du plus récent au plus ancien. */
export function groupHistory(events: TrackedEvent[], filter: Filter, now: number): HistoryGroup[] {
  const sub: Record<string, string> = {}
  const contr = events.filter((e) => e.kind === 'contraction')
  contr.forEach((e, i) => {
    const gap = gapMinutes(e, contr[i + 1])
    if (e.durationMs && gap) sub[e.id] = `Durée ${fmtDur(e.durationMs)} · écart ${gap} min`
    else if (e.durationMs) sub[e.id] = `Durée ${fmtDur(e.durationMs)}`
    else if (gap) sub[e.id] = `${gap} min après la précédente`
  })

  const shown = events.filter(
    (e) => filter === 'tout' || (filter === 'coups' ? e.kind === 'coup' : e.kind === 'contraction'),
  )

  const groups: (HistoryGroup & { nCoup: number; nContr: number })[] = []
  for (const e of shown) {
    const key = dayKey(e.t)
    let g = groups[groups.length - 1]
    if (!g || g.key !== key) {
      g = { key, day: dayLabel(e.t, now), summary: '', items: [], nCoup: 0, nContr: 0 }
      groups.push(g)
    }
    if (e.kind === 'coup') g.nCoup++
    else g.nContr++
    g.items.push({
      id: e.id,
      kind: e.kind,
      t: e.t,
      time: clock(e.t),
      iso: new Date(e.t).toISOString(),
      sub: sub[e.id] ?? '',
    })
  }

  return groups.map(({ nCoup, nContr, ...g }) => {
    const parts: string[] = []
    if (nCoup) parts.push(plural(nCoup, 'coup', 'coups'))
    if (nContr) parts.push(plural(nContr, 'contraction', 'contractions'))
    return { ...g, summary: parts.join(' · ') }
  })
}

export interface DayCount {
  key: string
  /** Minuit (heure locale) du jour. */
  t: number
  count: number
}

/** Nombre de coups par jour sur les `days` derniers jours, du plus ancien à aujourd'hui. */
export function dailyCoups(events: TrackedEvent[], days: number, now: number): DayCount[] {
  const out: DayCount[] = []
  const index = new Map<string, DayCount>()
  const d = new Date(now)
  d.setHours(0, 0, 0, 0)
  d.setDate(d.getDate() - (days - 1))
  for (let i = 0; i < days; i++) {
    const c = { key: dayKey(d.getTime()), t: d.getTime(), count: 0 }
    out.push(c)
    index.set(c.key, c)
    d.setDate(d.getDate() + 1)
  }
  for (const e of events) {
    if (e.kind !== 'coup') continue
    const c = index.get(dayKey(e.t))
    if (c) c.count++
  }
  return out
}
