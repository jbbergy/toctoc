import type { EventKind } from '../db/types'
import { pad } from './format'

/** Durée maximale acceptée pour une contraction saisie à la main. */
export const MAX_DURATION_MIN = 10

export interface ManualEntryInput {
  kind: EventKind
  /** AAAA-MM-JJ (input type="date") */
  date: string
  /** HH:MM (input type="time") */
  time: string
  /** Champs texte des inputs numériques, vides si non renseignés. */
  minutes: string
  seconds: string
}

export type ManualEntryField = 'date' | 'time' | 'duration'

export type ManualEntryResult =
  | { ok: true; at: Date; durationMs?: number }
  | { ok: false; errors: Partial<Record<ManualEntryField, string>> }

/** Valeurs par défaut du formulaire : maintenant, à la minute près. */
export function defaultEntry(kind: EventKind, now = new Date()): ManualEntryInput {
  return {
    kind,
    date: `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`,
    time: `${pad(now.getHours())}:${pad(now.getMinutes())}`,
    minutes: '',
    seconds: '',
  }
}

export function parseManualEntry(input: ManualEntryInput, now = Date.now()): ManualEntryResult {
  const errors: Partial<Record<ManualEntryField, string>> = {}

  const d = /^(\d{4})-(\d{2})-(\d{2})$/.exec(input.date.trim())
  const t = /^(\d{1,2}):(\d{2})$/.exec(input.time.trim())
  if (!d) errors.date = 'Indiquez une date, par exemple 03/10/2026.'
  if (!t) errors.time = 'Indiquez une heure, par exemple 14:30.'

  let at: Date | null = null
  if (d && t) {
    const [y, mo, da] = [Number(d[1]), Number(d[2]) - 1, Number(d[3])]
    const [h, mi] = [Number(t[1]), Number(t[2])]
    at = new Date(y, mo, da, h, mi)
    if (at.getFullYear() !== y || at.getMonth() !== mo || at.getDate() !== da) {
      errors.date = 'Cette date n’existe pas.'
    } else if (h > 23 || mi > 59) {
      errors.time = 'Cette heure n’existe pas.'
    } else if (at.getTime() > now + 60_000) {
      errors.time = 'L’entrée ne peut pas être dans le futur.'
    }
  }

  let durationMs: number | undefined
  if (input.kind === 'contraction' && (input.minutes.trim() || input.seconds.trim())) {
    const isInt = (s: string) => s.trim() === '' || /^\d+$/.test(s.trim())
    const m = Number(input.minutes.trim() || 0)
    const s = Number(input.seconds.trim() || 0)
    if (!isInt(input.minutes) || !isInt(input.seconds)) {
      errors.duration = 'Utilisez uniquement des nombres entiers.'
    } else if (s > 59) {
      errors.duration = 'Les secondes doivent être comprises entre 0 et 59.'
    } else if (m * 60 + s === 0) {
      errors.duration = 'La durée doit être supérieure à 0, ou laissez les champs vides.'
    } else if (m * 60 + s > MAX_DURATION_MIN * 60) {
      errors.duration = `La durée ne peut pas dépasser ${MAX_DURATION_MIN} minutes.`
    } else {
      durationMs = (m * 60 + s) * 1000
    }
  }

  if (Object.keys(errors).length || !at) return { ok: false, errors }
  return { ok: true, at, durationMs }
}
