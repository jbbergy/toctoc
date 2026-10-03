import { buildApp } from './app.js'
import { createPool, migrate } from './db.js'

const pool = createPool()
await migrate(pool)

const app = await buildApp({
  pool,
  logger: true,
  corsOrigin: process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.split(',') : false,
  clientDist: process.env.CLIENT_DIST,
})

await app.listen({ port: Number(process.env.PORT ?? 3000), host: process.env.HOST ?? '0.0.0.0' })

for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, async () => {
    await app.close()
    await pool.end()
    process.exit(0)
  })
}
