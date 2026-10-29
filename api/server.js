import os from 'node:os'
import Fastify from 'fastify'
import pg from 'pg'
import fs from 'node:fs'

const TOKEN = fs.readFileSync(new URL('./.token', import.meta.url), 'utf8').trim()
const db = new pg.Pool({ host: '127.0.0.1', database: 'lifeos', user: os.userInfo().username })
const app = Fastify({ logger: true, bodyLimit: 10 * 1024 * 1024 })

const clean = (v) => (typeof v === 'number' && v >= 0 ? v : null)

app.addHook('onRequest', async (req, reply) => {
  if (req.url === '/health') return
  const auth = req.headers.authorization ?? ''
  const ok = auth === `Bearer ${TOKEN}` || req.query?.token === TOKEN
  if (!ok) return reply.code(401).send({ error: 'unauthorized' })
})

app.get('/health', async () => {
  const { rows } = await db.query('SELECT now()')
  return { ok: true, time: rows[0].now }
})

app.post('/overland', async (req) => {
  const locs = req.body?.locations ?? []
  if (locs.length === 0) return { result: 'ok' }
  const ts = [], lat = [], lon = [], acc = [], spd = []
  for (const f of locs) {
    const [x, y] = f.geometry.coordinates
    ts.push(f.properties.timestamp); lon.push(x); lat.push(y)
    acc.push(clean(f.properties.horizontal_accuracy))
    spd.push(clean(f.properties.speed))
  }
  const r = await db.query(
    `INSERT INTO locations (ts, lat, lon, accuracy, speed)
     SELECT * FROM unnest($1::timestamptz[], $2::float8[], $3::float8[], $4::real[], $5::real[])
     ON CONFLICT (ts) DO NOTHING`,
    [ts, lat, lon, acc, spd]
  )
  req.log.info(`saved ${r.rowCount} of ${locs.length} points`)
  return { result: 'ok' }
})

app.get('/day', async (req, reply) => {
  const date = req.query.date
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date ?? '')) {
    return reply.code(400).send({ error: 'нужен date=YYYY-MM-DD' })
  }
  const { rows } = await db.query(
    `SELECT ts, lat, lon, speed FROM locations
     WHERE ts >= $1::date::timestamp AT TIME ZONE 'Europe/Berlin'
       AND ts <  ($1::date + 1)::timestamp AT TIME ZONE 'Europe/Berlin'
     ORDER BY ts`,
    [date]
  )
  return { date, points: rows }
})

await app.listen({ host: '0.0.0.0', port: 3000 })
