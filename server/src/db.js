import { readdir, readFile } from 'node:fs/promises'
import pg from 'pg'

const MIGRATIONS = new URL('../migrations/', import.meta.url)

export function createPool(connectionString = process.env.DATABASE_URL) {
  return new pg.Pool({ connectionString, max: Number(process.env.PG_POOL_MAX ?? 10) })
}

export async function migrate(pool) {
  const files = (await readdir(MIGRATIONS)).filter((f) => f.endsWith('.sql')).sort()
  for (const f of files) {
    await pool.query(await readFile(new URL(f, MIGRATIONS), 'utf8'))
  }
}
