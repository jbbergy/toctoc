// PostgreSQL de développement sans Docker : PGlite exposé sur le protocole wire.
// Usage : npm run db:dev  puis  DATABASE_URL=postgres://postgres@127.0.0.1:5432/postgres npm run dev
import { PGlite } from '@electric-sql/pglite'
import { PGLiteSocketServer } from '@electric-sql/pglite-socket'

const port = Number(process.env.PGPORT ?? 5432)
const db = await PGlite.create(process.env.PGDATA ?? './.dev-pgdata')
const server = new PGLiteSocketServer({ db, port, host: '127.0.0.1' })
await server.start()
console.log(`PostgreSQL (PGlite) prêt sur postgres://postgres@127.0.0.1:${port}/postgres`)
