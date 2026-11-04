// Реестр того, что показываем про день: плитки и события «инвентаря».
// Новый источник данных (шаги, еда, экран) подключается здесь — вёрстку трогать не надо.
//
// ctx = { day, sec, now, total, sources }
//   now / total — statsAt(day, sec) и итог за день (GPS)
//   sources     — будущие источники, например:
//                 sources.steps = (sec) => ({ value: '4 210', of: '9 800' })   // шаги к моменту sec
//                 sources.events = [{ kind: 'food', at: 30600, title: 'Завтрак', sub: '430 kcal' }]
// get(ctx, f) → { value, unit?, of? } или null. null = данных пока нет → плитка «скоро».
import { MIN_TRIP } from './geo.js'

const avg = (s, f) => (s.move >= 60 ? f.speed((s.d / s.move) * 3.6) : '—')
const fromSource = (name) => ({ sources, sec }) => sources[name]?.(sec) ?? null

// первый ряд — как в дизайне: Moved / Steps / Eaten / Screen
export const PRIMARY_TILES = [
  {
    id: 'moved',
    label: 'tile.moved',
    get: ({ now, total }, f) => {
      const [value, unit] = f.kmParts(now.d)
      return { value, unit, of: f.km(total.d) }
    },
  },
  { id: 'steps', label: 'tile.steps', get: fromSource('steps') },
  { id: 'eaten', label: 'tile.eaten', get: fromSource('food') },
  { id: 'screen', label: 'tile.screen', get: fromSource('screen') },
]

// второй ряд — подробности по GPS
export const SECONDARY_TILES = [
  { id: 'motion', label: 'tile.motion', get: ({ now, total }, f) => ({ value: f.duration(now.move), of: f.duration(total.move) }) },
  { id: 'places', label: 'tile.places', get: ({ now, total }, f) => ({ value: f.duration(now.stop), of: f.duration(total.stop) }) },
  { id: 'avg', label: 'tile.avg', get: ({ now, total }, f) => ({ value: avg(now, f), of: avg(total, f) }) },
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
