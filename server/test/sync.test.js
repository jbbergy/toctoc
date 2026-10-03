import { after, before, test } from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { PGlite } from '@electric-sql/pglite'
import { PGLiteSocketServer } from '@electric-sql/pglite-socket'
import { buildApp } from '../src/app.js'
import { createPool, migrate } from '../src/db.js'

// PostgreSQL « réel » côté protocole : PGlite exposé via le protocole wire.
const PORT = 55432
let pglite, socket, pool, app

before(async () => {
  pglite = await PGlite.create()
  socket = new PGLiteSocketServer({ db: pglite, port: PORT, host: '127.0.0.1' })
  await socket.start()
  pool = createPool(`postgres://postgres@127.0.0.1:${PORT}/postgres`)
  pool.options.max = 1 // PGlite est mono-connexion
  await migrate(pool)
  app = await buildApp({ pool })
})

after(async () => {
  await app.close()
  await pool.end()
  await socket.stop()
  await pglite.close()
})

const row = (over = {}) => ({
  id: randomUUID(),
  kind: 'coup',
  occurred_at: '2026-10-03T10:00:00.000Z',
  duration_ms: null,
  updated_at: '2026-10-03T10:00:00.000Z',
  deleted_at: null,
  ...over,
})

const sync = (space, body) =>
  app.inject({ method: 'POST', url: `/api/spaces/${space}/sync`, payload: body })

test('pousse puis récupère les changements', async () => {
  const space = randomUUID()
  const a = row()
  const b = row({ kind: 'contraction', duration_ms: 45000 })
  const r1 = await sync(space, { since: 0, changes: [a, b] })
  assert.equal(r1.statusCode, 200)
  const body = r1.json()
  assert.equal(body.changes.length, 2)
  assert.ok(body.cursor > 0)

  const r2 = await sync(space, { since: body.cursor, changes: [] })
  assert.deepEqual(r2.json().changes, [])
})

test('dernière écriture gagnante et suppression propagée', async () => {
  const space = randomUUID()
  const a = row()
  const { cursor } = (await sync(space, { since: 0, changes: [a] })).json()

  // Version plus ancienne ignorée
  const stale = { ...a, deleted_at: '2026-10-03T09:00:00.000Z', updated_at: '2026-10-03T09:00:00.000Z' }
  assert.deepEqual((await sync(space, { since: cursor, changes: [stale] })).json().changes, [])

  // Suppression plus récente appliquée et renvoyée aux autres appareils
  const del = { ...a, deleted_at: '2026-10-03T11:00:00.000Z', updated_at: '2026-10-03T11:00:00.000Z' }
  const res = (await sync(space, { since: cursor, changes: [del] })).json()
  assert.equal(res.changes.length, 1)
  assert.equal(new Date(res.changes[0].deleted_at).toISOString(), del.deleted_at)
})

test('les espaces sont isolés', async () => {
  const s1 = randomUUID()
  const s2 = randomUUID()
  const a = row()
  await sync(s1, { since: 0, changes: [a] })
  // Un autre espace ne peut ni lire ni écraser la ligne
  const hijack = { ...a, kind: 'contraction', updated_at: '2030-01-01T00:00:00.000Z' }
  const res = (await sync(s2, { since: 0, changes: [hijack] })).json()
  assert.deepEqual(res.changes, [])
  const own = (await sync(s1, { since: 0, changes: [] })).json()
  assert.equal(own.changes[0].kind, 'coup')
})

test('valide les entrées', async () => {
  const space = randomUUID()
  assert.equal((await sync('pas-un-uuid', { since: 0, changes: [] })).statusCode, 400)
  assert.equal((await sync(space, { since: 0, changes: [row({ kind: 'hoquet' })] })).statusCode, 400)
  assert.equal((await sync(space, { since: -1, changes: [] })).statusCode, 400)
})
