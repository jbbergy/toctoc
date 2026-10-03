import { beforeEach, describe, expect, it } from 'vitest'
import { PGlite } from '@electric-sql/pglite'
import {
  addEvent,
  applyRemote,
  deleteEvent,
  listEvents,
  markPushed,
  migrate,
  pendingChanges,
} from '../src/db/repository'

let db: PGlite

beforeEach(async () => {
  db = new PGlite()
  await migrate(db)
})

describe('repository (PGlite)', () => {
  it('ajoute et liste du plus récent au plus ancien', async () => {
    await addEvent(db, 'coup', new Date('2026-10-03T10:00:00Z'))
    await addEvent(db, 'contraction', new Date('2026-10-03T11:00:00Z'), 42_300)
    const list = await listEvents(db)
    expect(list.map((e) => e.kind)).toEqual(['contraction', 'coup'])
    expect(list[0].durationMs).toBe(42_300)
    expect(list[1].durationMs).toBe(0)
  })

  it('refuse un type inconnu', async () => {
    // @ts-expect-error test de la contrainte SQL
    await expect(addEvent(db, 'hoquet')).rejects.toThrow()
  })

  it('suppression douce, propagée à la synchro', async () => {
    const e = await addEvent(db, 'coup')
    await markPushed(db, await pendingChanges(db))
    expect(await pendingChanges(db)).toHaveLength(0)

    await deleteEvent(db, e.id)
    expect(await listEvents(db)).toHaveLength(0)
    const pending = await pendingChanges(db)
    expect(pending).toHaveLength(1)
    expect(pending[0].deleted_at).not.toBeNull()
  })

  it('applique les changements distants en dernière écriture gagnante', async () => {
    const e = await addEvent(db, 'coup', new Date('2026-10-03T10:00:00Z'))
    const [local] = await pendingChanges(db)
    const older = { ...local, deleted_at: local.updated_at, updated_at: '2000-01-01T00:00:00Z' }
    expect(await applyRemote(db, [older])).toBe(0)
    expect(await listEvents(db)).toHaveLength(1)

    const newer = { ...local, deleted_at: '2099-01-01T00:00:00Z', updated_at: '2099-01-01T00:00:00Z' }
    expect(await applyRemote(db, [newer])).toBe(1)
    expect((await listEvents(db)).find((x) => x.id === e.id)).toBeUndefined()

    const remoteNew = { ...local, id: crypto.randomUUID(), deleted_at: null }
    await applyRemote(db, [remoteNew])
    expect(await listEvents(db)).toHaveLength(1)
    // La ligne locale a été remplacée par la version distante : plus rien à pousser.
    expect(await pendingChanges(db)).toHaveLength(0)
  })
})
