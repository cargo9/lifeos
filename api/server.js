import os from 'node:os'
import Fastify from 'fastify'
import pg from 'pg'
import fs from 'node:fs'

const TOKEN = fs.readFileSync(new URL('./.token', import.meta.url), 'utf8').trim()
const db = new pg.Pool({ host: '127.0.0.1', database: 'lifeos', user: os.userInfo().username })
const app = Fastify({ logger: true, bodyLimit: 10 * 1024 * 1024 })

const clean = (v) => (typeof v === 'number' && v >= 0 ? v : null)

// токен: «Authorization: Bearer <токен>», просто «<токен>» или ?token=.
// Берём последнее слово заголовка — так не важно, как набрано «Bearer» (на айфоне легко
// попадает кириллица или лишний пробел); сам токен должен совпасть точно.
// В лог пишем ПРИЧИНУ отказа, но никогда сам токен.
app.addHook('onRequest', async (req, reply) => {
  if (req.url === '/health') return
  const header = String(req.headers.authorization ?? '').trim()
  const given = header ? header.split(/\s+/).pop() : String(req.query?.token ?? '').trim()
  if (given === TOKEN) return
  const why = !given ? 'нет заголовка Authorization' : `токен не совпал (длина ${given.length}, нужно ${TOKEN.length})`
  req.log.warn(`401: ${why}`)
  return reply.code(401).send({ error: 'unauthorized', why })
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
    `SELECT ts, lat, lon, speed, accuracy FROM locations
     WHERE ts >= $1::date::timestamp AT TIME ZONE 'Europe/Berlin'
       AND ts <  ($1::date + 1)::timestamp AT TIME ZONE 'Europe/Berlin'
     ORDER BY ts`,
    [date]
  )
  return { date, points: rows }
})

// ── Apple Health и прочие «интервальные» данные ──
// Быстрая команда шлёт строки «start;end;value» (так проще собрать в Shortcuts),
// можно и JSON-массив: { type, samples: [{ start, end, value }] }
const TYPE_RE = /^[a-z][a-z0-9_]{0,31}$/

function parseSamples(body) {
  if (Array.isArray(body?.samples)) return body.samples
  // lines: один текст со строками или список строк (если в Быстрой команде вставить список)
  const lines = Array.isArray(body?.lines) ? body.lines.join('\n') : body?.lines
  if (typeof lines === 'string') {
    return lines
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean)
      .map((l) => {
        const [start, end, value] = l.split(';').map((x) => x.trim())
        return { start, end, value }
      })
  }
  return null
}

// число в местном формате айфона: «1 234,5» / «1,234.5» / «1.234,5» / «1234 шагов» → 1234.5
function num(v) {
  if (typeof v === 'number') return v
  let x = String(v ?? '').replace(/[^\d.,-]/g, '')
  if (x.includes('.') && x.includes(',')) {
    // разделитель тысяч — тот, что встречается раньше
    x = x.indexOf(',') < x.indexOf('.') ? x.replaceAll(',', '') : x.replaceAll('.', '').replace(',', '.')
  } else if (/^-?\d{1,3}(,\d{3})+$/.test(x)) x = x.replaceAll(',', '') // «1,234» = тысяча
  else x = x.replace(',', '.')
  return x === '' ? NaN : Number(x)
}

app.post('/samples', async (req, reply) => {
  const type = req.body?.type
  if (!TYPE_RE.test(type ?? '')) return reply.code(400).send({ error: 'нужен type, например "steps"' })
  const list = parseSamples(req.body)
  if (!list) {
    req.log.warn(`samples: непонятное тело, поля: ${Object.keys(req.body ?? {}).join(', ')}`)
    return reply.code(400).send({ error: 'нужны samples[] или lines' })
  }

  // один и тот же интервал дважды в пачке уронил бы INSERT … ON CONFLICT — оставляем последний
  const uniq = new Map()
  let skipped = 0
  let firstBad = null
  for (const x of list) {
    const a = new Date(x.start)
    const b = new Date(x.end ?? x.start)
    const v = num(x.value)
    if (isNaN(a) || isNaN(b) || b < a || !Number.isFinite(v)) {
      skipped++
      firstBad ??= x
      continue
    }
    uniq.set(`${a.toISOString()}|${b.toISOString()}`, v)
  }
  // если что-то отбраковали — показываем в логе пример (тут только даты и числа, не секреты)
  if (skipped > 0) {
    req.log.warn(`samples ${type}: пришло ${list.length}, отбраковано ${skipped}; пример: ${JSON.stringify(firstBad).slice(0, 300)}`)
  }
  if (list.length === 0) req.log.warn(`samples ${type}: пришло 0 строк, поля тела: ${Object.keys(req.body).join(', ')}`)
  if (uniq.size === 0) return { saved: 0, skipped }
  const st = [], en = [], val = []
  for (const [k, v] of uniq) {
    const [a, b] = k.split('|')
    st.push(a); en.push(b); val.push(v)
  }
  const r = await db.query(
    `INSERT INTO samples (type, start_ts, end_ts, value)
     SELECT $1, * FROM unnest($2::timestamptz[], $3::timestamptz[], $4::float8[])
     ON CONFLICT (type, start_ts, end_ts) DO UPDATE SET value = EXCLUDED.value, received = now()`,
    [type, st, en, val]
  )
  req.log.info(`samples ${type}: saved ${r.rowCount}, skipped ${skipped}`)
  return { saved: r.rowCount, skipped }
})

// интервалы, задевающие выбранные сутки (Europe/Berlin), сгруппированные по type
app.get('/samples', async (req, reply) => {
  const date = req.query.date
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date ?? '')) {
    return reply.code(400).send({ error: 'нужен date=YYYY-MM-DD' })
  }
  const { rows } = await db.query(
    `SELECT type, start_ts AS start, end_ts AS "end", value FROM samples
     WHERE end_ts   >  $1::date::timestamp AT TIME ZONE 'Europe/Berlin'
       AND start_ts <  ($1::date + 1)::timestamp AT TIME ZONE 'Europe/Berlin'
     ORDER BY type, start_ts`,
    [date]
  )
  const byType = {}
  for (const { type, ...s } of rows) (byType[type] ??= []).push(s)
  return { date, samples: byType }
})

// дни, где есть хоть что-то: GPS-точки или интервалы (сутки по Europe/Berlin) — для навигации по датам
app.get('/days', async () => {
  const { rows } = await db.query(
    `SELECT date, sum(points)::int AS points, sum(samples)::int AS samples FROM (
       SELECT to_char(ts AT TIME ZONE 'Europe/Berlin', 'YYYY-MM-DD') AS date, 1 AS points, 0 AS samples FROM locations
       UNION ALL
       SELECT to_char(start_ts AT TIME ZONE 'Europe/Berlin', 'YYYY-MM-DD'), 0, 1 FROM samples
     ) x GROUP BY date ORDER BY date`
  )
  return { days: rows }
})

await app.listen({ host: '0.0.0.0', port: 3000 })
