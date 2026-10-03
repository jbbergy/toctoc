import { after, before, test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { buildApp } from '../src/app.js'

let dir, app

before(async () => {
  dir = await mkdtemp(join(tmpdir(), 'toctoc-dist-'))
  await mkdir(join(dir, 'assets'))
  await writeFile(join(dir, 'index.html'), '<!doctype html><title>TocToc</title>')
  await writeFile(join(dir, 'sw.js'), '// sw')
  await writeFile(join(dir, 'assets', 'app-abc123.js'), '// app')
  // Pas de base nécessaire pour ces routes.
  app = await buildApp({ pool: /** @type {any} */ ({}), clientDist: dir })
})

after(async () => {
  await app.close()
  await rm(dir, { recursive: true, force: true })
})

test('sert les assets avec un cache long', async () => {
  const res = await app.inject('/assets/app-abc123.js')
  assert.equal(res.statusCode, 200)
  assert.match(res.headers['cache-control'], /immutable/)
})

test('ne met pas en cache le service worker', async () => {
  const res = await app.inject('/sw.js')
  assert.equal(res.headers['cache-control'], 'no-cache')
})

test('repli SPA sur index.html pour les routes du client', async () => {
  const res = await app.inject('/historique')
  assert.equal(res.statusCode, 200)
  assert.match(res.body, /TocToc/)
  assert.equal(res.headers['cache-control'], 'no-cache')
})

test('les routes /api inconnues restent en 404 JSON', async () => {
  const res = await app.inject('/api/inconnu')
  assert.equal(res.statusCode, 404)
  assert.deepEqual(res.json(), { error: 'Not Found' })
})
