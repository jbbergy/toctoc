import { existsSync } from 'node:fs'
import { join, resolve } from 'node:path'
import Fastify from 'fastify'
import cors from '@fastify/cors'
import rateLimit from '@fastify/rate-limit'
import fastifyStatic from '@fastify/static'

const UUID = '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
const MAX_CHANGES = 1000

const syncSchema = {
  params: {
    type: 'object',
    required: ['space'],
    properties: { space: { type: 'string', pattern: UUID } },
  },
  body: {
    type: 'object',
    required: ['since', 'changes'],
    additionalProperties: false,
    properties: {
      since: { type: 'integer', minimum: 0 },
      changes: {
        type: 'array',
        maxItems: MAX_CHANGES,
        items: {
          type: 'object',
          required: ['id', 'kind', 'occurred_at', 'updated_at'],
          additionalProperties: false,
          properties: {
            id: { type: 'string', pattern: UUID },
            kind: { enum: ['coup', 'contraction'] },
            occurred_at: { type: 'string', format: 'date-time' },
            duration_ms: { type: ['integer', 'null'], minimum: 0, maximum: 3_600_000 },
            updated_at: { type: 'string', format: 'date-time' },
            deleted_at: { type: ['string', 'null'], format: 'date-time' },
          },
        },
      },
    },
  },
}

/** Fichiers à ne jamais mettre en cache : ils pilotent les mises à jour de la PWA. */
const NO_CACHE = /(^|\/)(index\.html|sw\.js|registerSW\.js|manifest\.webmanifest)$/

/**
 * @param {{
 *   pool: import('pg').Pool,
 *   corsOrigin?: string | string[] | boolean,
 *   logger?: boolean,
 *   clientDist?: string,
 *   rateLimitMax?: number,
 * }} opts
 */
export async function buildApp({ pool, corsOrigin = false, logger = false, clientDist, rateLimitMax = 120 }) {
  // Derrière Caddy : l'IP réelle du client vient de X-Forwarded-For.
  const app = Fastify({ logger, bodyLimit: 512 * 1024, trustProxy: '127.0.0.1' })
  await app.register(cors, { origin: corsOrigin })
  await app.register(rateLimit, { global: false })

  app.get('/api/health', async () => {
    await pool.query('SELECT 1')
    return { ok: true }
  })

  /**
   * Synchronisation en un aller-retour : le client pousse ses changements
   * (dernière écriture gagnante sur updated_at) puis reçoit tout ce qui a
   * changé dans son espace depuis son curseur `since`.
   */
  app.post(
    '/api/spaces/:space/sync',
    { schema: syncSchema, config: { rateLimit: { max: rateLimitMax, timeWindow: '1 minute' } } },
    async (req) => {
      const { space } = req.params
      const { since, changes } = req.body
      const client = await pool.connect()
      try {
        await client.query('BEGIN')
        for (const c of changes) {
          await client.query(
            `INSERT INTO events (id, space_id, kind, occurred_at, duration_ms, updated_at, deleted_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7)
           ON CONFLICT (id) DO UPDATE SET
             kind = EXCLUDED.kind,
             occurred_at = EXCLUDED.occurred_at,
             duration_ms = EXCLUDED.duration_ms,
             updated_at = EXCLUDED.updated_at,
             deleted_at = EXCLUDED.deleted_at,
             seq = nextval(pg_get_serial_sequence('events', 'seq'))
           WHERE events.space_id = EXCLUDED.space_id
             AND events.updated_at < EXCLUDED.updated_at`,
            [c.id, space, c.kind, c.occurred_at, c.duration_ms ?? null, c.updated_at, c.deleted_at ?? null],
          )
        }
        const { rows } = await client.query(
          `SELECT id, kind,
                to_json(occurred_at)#>>'{}' AS occurred_at,
                duration_ms,
                to_json(updated_at)#>>'{}' AS updated_at,
                to_json(deleted_at)#>>'{}' AS deleted_at,
                seq::text AS seq
           FROM events
          WHERE space_id = $1 AND seq > $2
          ORDER BY seq`,
          [space, since],
        )
        await client.query('COMMIT')
        const cursor = rows.length ? Number(rows[rows.length - 1].seq) : since
        return { cursor, changes: rows.map(({ seq: _seq, ...r }) => r) }
      } catch (err) {
        await client.query('ROLLBACK')
        throw err
      } finally {
        client.release()
      }
    },
  )

  // PWA compilée (production) : fichiers statiques + repli SPA sur index.html.
  if (clientDist && existsSync(join(clientDist, 'index.html'))) {
    const root = resolve(clientDist)
    await app.register(fastifyStatic, {
      root,
      wildcard: false,
      cacheControl: false,
      /** @param {import('fastify').FastifyReply} reply */
      setHeaders(reply, path) {
        if (path.startsWith(join(root, 'assets'))) {
          reply.header('Cache-Control', 'public, max-age=31536000, immutable')
        } else {
          reply.header('Cache-Control', NO_CACHE.test(path) ? 'no-cache' : 'public, max-age=3600')
        }
      },
    })
    app.setNotFoundHandler((req, reply) => {
      if (req.method !== 'GET' || req.url.startsWith('/api/')) {
        return reply.code(404).send({ error: 'Not Found' })
      }
      reply.header('Cache-Control', 'no-cache')
      return reply.sendFile('index.html')
    })
  }

  return app
}
