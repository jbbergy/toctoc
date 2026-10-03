import { describe, expect, it } from 'vitest'
import { defaultEntry, parseManualEntry, type ManualEntryInput } from '../src/lib/manualEntry'

const now = new Date(2026, 9, 3, 15, 0)
const base = (over: Partial<ManualEntryInput> = {}): ManualEntryInput => ({
  ...defaultEntry('coup', now),
  ...over,
})

describe('saisie manuelle', () => {
  it('pré-remplit avec la date et l’heure courantes', () => {
    expect(defaultEntry('coup', now)).toMatchObject({ date: '2026-10-03', time: '15:00' })
  })

  it('accepte une entrée passée', () => {
    const r = parseManualEntry(base({ date: '2026-10-02', time: '22:14' }), now.getTime())
    expect(r).toEqual({ ok: true, at: new Date(2026, 9, 2, 22, 14), durationMs: undefined })
  })

  it('refuse le futur et les champs vides', () => {
    expect(parseManualEntry(base({ time: '15:30' }), now.getTime())).toMatchObject({
      ok: false,
      errors: { time: expect.stringContaining('futur') },
    })
    const r = parseManualEntry(base({ date: '', time: '' }), now.getTime())
    expect(r.ok === false && Object.keys(r.errors).sort()).toEqual(['date', 'time'])
  })

  it('refuse une date inexistante', () => {
    const r = parseManualEntry(base({ date: '2026-02-30' }), now.getTime())
    expect(r).toMatchObject({ ok: false, errors: { date: expect.any(String) } })
  })

  it('gère la durée des contractions', () => {
    const c = (minutes: string, seconds: string) =>
      parseManualEntry(base({ kind: 'contraction', minutes, seconds }), now.getTime())
    expect(c('', '')).toMatchObject({ ok: true, durationMs: undefined })
    expect(c('1', '05')).toMatchObject({ ok: true, durationMs: 65_000 })
    expect(c('', '45')).toMatchObject({ ok: true, durationMs: 45_000 })
    expect(c('0', '75')).toMatchObject({ ok: false })
    expect(c('0', '0')).toMatchObject({ ok: false })
    expect(c('11', '')).toMatchObject({ ok: false })
    expect(c('1.5', '')).toMatchObject({ ok: false })
  })

  it('ignore la durée pour un coup', () => {
    const r = parseManualEntry(base({ minutes: '3' }), now.getTime())
    expect(r).toMatchObject({ ok: true, durationMs: undefined })
  })
})
