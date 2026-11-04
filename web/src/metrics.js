// Реестр того, что показываем про день: плитки и события «инвентаря».
// Новый источник данных (шаги, еда, экран) подключается здесь — вёрстку трогать не надо.
//
// ctx = { day, sec, now, total, sources }
//   now / total — statsAt(day, sec) и итог за день по GPS (null, если точек нет)
//   sources     — данные из /samples, по типу: sources.steps = { at(sec), total }
//                 (+ потом sources.events = [{ kind: 'food', at, title, sub }] для инвентаря)
// get(ctx, f) → { value, unit?, of? } или null. null = данных пока нет → плитка «скоро».
//
// Как подключить новый тип из Apple Health (например, 'active_kcal'):
//   1) Быстрая команда шлёт его на POST /samples с type: 'active_kcal'
//   2) здесь — плитка { id, label: 'tile.…', get: counter('active_kcal') } и строка в i18n.jsx
import { MIN_TRIP } from './geo.js'

const avg = (s, f) => (s.move >= 60 ? f.speed((s.d / s.move) * 3.6) : '—')
const gps = (get) => (ctx, f) => (ctx.now ? get(ctx, f) : null)

// «счётчик» из интервалов: сколько набежало к моменту ползунка и за весь день
const counter = (type, fmt = (f, x) => f.int(x)) => ({ sources, sec }, f) => {
  const src = sources[type]
  return src ? { value: fmt(f, src.at(sec)), of: fmt(f, src.total) } : null
}

// samples из /samples → источники. Внутри интервала значение считаем набегающим равномерно:
// 600 шагов за 10:00–11:00 → к 10:30 будет 300. Часть, вылезающая за полночь, не считается.
export function buildSources(samplesByType, day) {
  const sources = {}
  const t0 = day.start.getTime()
  for (const [type, list] of Object.entries(samplesByType ?? {})) {
    const items = list.map((x) => ({ a: (new Date(x.start) - t0) / 1000, b: (new Date(x.end) - t0) / 1000, v: x.value }))
    const at = (sec) => {
      const until = Math.min(sec, day.length)
      let sum = 0
      for (const { a, b, v } of items) {
        if (b <= a) {
          if (a >= 0 && a <= until) sum += v
          continue
        }
        const lo = Math.max(a, 0)
        const hi = Math.min(b, until)
        if (hi > lo) sum += (v * (hi - lo)) / (b - a)
      }
      return sum
    }
    sources[type] = { at, total: at(day.length), items }
  }
  return sources
}

// первый ряд — как в дизайне: Moved / Steps / Eaten / Screen
export const PRIMARY_TILES = [
  {
    id: 'moved',
    label: 'tile.moved',
    get: gps(({ now, total }, f) => {
      const [value, unit] = f.kmParts(now.d)
      return { value, unit, of: f.km(total.d) }
    }),
  },
  { id: 'steps', label: 'tile.steps', get: counter('steps') },
  { id: 'eaten', label: 'tile.eaten', get: counter('food_kcal') },
  { id: 'screen', label: 'tile.screen', get: counter('screen_min', (f, m) => f.duration(m * 60)) },
]

// второй ряд — подробности по GPS
export const SECONDARY_TILES = [
  { id: 'motion', label: 'tile.motion', get: gps(({ now, total }, f) => ({ value: f.duration(now.move), of: f.duration(total.move) })) },
  { id: 'places', label: 'tile.places', get: gps(({ now, total }, f) => ({ value: f.duration(now.stop), of: f.duration(total.stop) })) },
  { id: 'avg', label: 'tile.avg', get: gps(({ now, total }, f) => ({ value: avg(now, f), of: avg(total, f) })) },
]

// события дня для «инвентаря»: стоянки, поездки, потом — еда, тренировки…
// kind определяет иконку и цвет (см. Inventory.jsx)
export function buildEvents(day, sources = {}) {
  const events = []
  for (const s of day.stops) events.push({ kind: 'place', at: s.from, title: 'ev.place', dur: s.to - s.from })
  for (const sp of day.spans) {
    if (sp.type === 'move' && sp.d >= MIN_TRIP) events.push({ kind: sp.mode, at: sp.from, title: `ev.${sp.mode}`, km: sp.d })
  }
  for (const e of sources.events ?? []) events.push(e)
  return events.sort((a, b) => a.at - b.at)
}
