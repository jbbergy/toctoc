import { describe, expect, it } from 'vitest'
import { ago, dayLabel, fmtDur, groupHistory } from '../src/lib/format'
import type { TrackedEvent } from '../src/db/types'

const M = 60_000
const now = new Date(2026, 9, 3, 15, 0).getTime()

describe('format', () => {
  it('formate les durées', () => {
    expect(fmtDur(400)).toBe('1 s')
    expect(fmtDur(45_000)).toBe('45 s')
    expect(fmtDur(65_000)).toBe('1 min 05 s')
  })

  it('formate le temps écoulé', () => {
    expect(ago(now - 10_000, now)).toBe('à l’instant')
    expect(ago(now - 12 * M, now)).toBe('il y a 12 min')
    expect(ago(now - 125 * M, now)).toBe('il y a 2 h 05')
    expect(ago(now - 60 * M, now)).toBe('il y a 1 h')
  })

  it('libelle les jours', () => {
    expect(dayLabel(now - 5 * M, now)).toBe('Aujourd’hui')
    expect(dayLabel(new Date(2026, 9, 2, 22).getTime(), now)).toBe('Hier')
    expect(dayLabel(new Date(2026, 9, 1, 9).getTime(), now)).toBe('Jeudi 1er octobre')
    expect(dayLabel(new Date(2025, 11, 24).getTime(), now)).toBe('Mercredi 24 décembre 2025')
  })
})

describe('groupHistory', () => {
  const events: TrackedEvent[] = [
    { id: 'c3', kind: 'contraction', t: now - 10 * M, durationMs: 50_000 },
    { id: 'k1', kind: 'coup', t: now - 12 * M, durationMs: 0 },
    { id: 'c2', kind: 'contraction', t: now - 18 * M, durationMs: 0 },
    { id: 'c1', kind: 'contraction', t: now - 5 * 60 * M, durationMs: 40_000 },
    { id: 'k0', kind: 'coup', t: new Date(2026, 9, 2, 20).getTime(), durationMs: 0 },
  ]

  it('groupe par jour avec résumé', () => {
    const g = groupHistory(events, 'tout', now)
    expect(g.map((x) => x.day)).toEqual(['Aujourd’hui', 'Hier'])
    expect(g[0].summary).toBe('1 coup · 3 contractions')
    expect(g[1].summary).toBe('1 coup')
  })

  it('calcule durée et écart des contractions', () => {
    const items = groupHistory(events, 'contractions', now)[0].items
    expect(items.map((i) => i.sub)).toEqual([
      'Durée 50 s · écart 8 min',
      // > 2 h avant la précédente : pas d'écart affiché
      '',
      'Durée 40 s',
    ])
  })

  it('filtre par type', () => {
    const g = groupHistory(events, 'coups', now)
    expect(g.flatMap((x) => x.items).every((i) => i.kind === 'coup')).toBe(true)
  })
})
