// Вся «математика дня»: чистка GPS, остановки, дыры, позиция на момент времени.
// Время везде — секунды от начала выбранных суток (поле s у точки).

export const STOP_RADIUS = 60 // м: дальше — уже не «стою на месте»
export const STOP_MIN_SEC = 10 * 60 // остановка — от 10 минут
export const GAP_SEC = 5 * 60 // телефон молчал дольше 5 минут вне стоянки = «нет данных»
export const MERGE_SEC = 3 * 60 // соседние стоянки в одном месте с паузой < 3 мин склеиваем
export const MIN_TRIP = 150 // м: движение короче — не «поездка», в инвентарь не попадает

// как двигался — по средней скорости куска (км/ч)
export const modeOf = (kmh) => (kmh < 8 ? 'walk' : kmh < 25 ? 'bike' : 'transport')

const MIN_STEP = 10 // м: расстояние копим, только когда ушли от прошлой засчитанной точки на 10+ м (иначе дрожание GPS = лишние км)
const SPEED_WINDOW = 30 // скорость считаем по окну ±30 с — GPS «дрожит» и между соседними точками врёт

// расстояние между точками в метрах (формула гаверсинусов)
export function dist(a, b) {
  const rad = (x) => (x * Math.PI) / 180
  const dLat = rad(b.lat - a.lat)
  const dLon = rad(b.lon - a.lon)
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2
  return 2 * 6371000 * Math.asin(Math.sqrt(h))
}

// начало суток и их длина в секундах (в день перевода часов сутки = 23 или 25 ч)
export function dayBounds(date) {
  const start = new Date(`${date}T00:00:00`)
  const end = new Date(start)
  end.setDate(end.getDate() + 1)
  return { start, length: (end - start) / 1000 }
}

// 1. чистим шум: плохая точность и «телепорты» быстрее 180 км/ч
export function cleanPoints(pts, maxAcc = 30) {
  const out = []
  for (const p of pts) {
    if (p.accuracy != null && p.accuracy > maxAcc) continue
    const prev = out[out.length - 1]
    if (prev) {
      const dt = p.s - prev.s
      if (dt <= 0) continue
      if (dist(prev, p) / dt > 50) continue
    }
    out.push(p)
  }
  return out
}

// 2. остановки: 10+ минут в радиусе 60 м от первой точки
export function detectStops(pts) {
  const stops = []
  let i = 0
  while (i < pts.length) {
    let j = i + 1
    while (j < pts.length && dist(pts[i], pts[j]) <= STOP_RADIUS) j++
    if (pts[j - 1].s - pts[i].s >= STOP_MIN_SEC) {
      const g = pts.slice(i, j)
      stops.push({
        lat: g.reduce((sum, p) => sum + p.lat, 0) / g.length,
        lon: g.reduce((sum, p) => sum + p.lon, 0) / g.length,
        from: pts[i].s,
        to: pts[j - 1].s,
        start: i,
        end: j - 1,
      })
      i = j
    } else i++
  }
  return mergeStops(pts, stops)
}

// GPS гуляет, и одна долгая стоянка распадается на несколько подряд — склеиваем обратно
function mergeStops(pts, stops) {
  const out = []
  for (const st of stops) {
    const prev = out[out.length - 1]
    if (prev && st.from - prev.to < MERGE_SEC && dist(prev, st) < STOP_RADIUS) {
      const a = prev.end - prev.start + 1
      const b = st.end - st.start + 1
      prev.lat = (prev.lat * a + st.lat * b) / (a + b)
      prev.lon = (prev.lon * a + st.lon * b) / (a + b)
      prev.to = st.to
      prev.end = st.end
    } else out.push({ ...st })
  }
  return out
}

// 3. маршрут: точки остановки сворачиваем в две (приехал / уехал) в её центре
function buildRoute(pts, stops) {
  const route = []
  let k = 0
  for (let i = 0; i < pts.length; i++) {
    const stop = stops[k]
    if (stop && i === stop.start) {
      route.push({ lat: stop.lat, lon: stop.lon, s: stop.from, stop: k })
      route.push({ lat: stop.lat, lon: stop.lon, s: stop.to, stop: k })
      i = stop.end
      k++
    } else route.push(pts[i])
  }
  return route
}

// 4. таймлайн дня — подряд идущие куски: move / stop / gap
//    gap = «телефон молчал и мы куда-то делись», рисуем пунктиром и не интерполируем
export function buildDay(rawPoints, date) {
  const { start, length } = dayBounds(date)
  const pts = cleanPoints(rawPoints.map((p) => ({ ...p, s: (new Date(p.ts) - start) / 1000 })))
  const stops = detectStops(pts)
  const route = buildRoute(pts, stops)

  // тип каждого отрезка route[i-1] → route[i]: stop / gap / move (seg[0] не используется)
  const seg = route.map((b, i) => {
    const a = route[i - 1]
    if (!a) return null
    if (a.stop != null && a.stop === b.stop) return 'stop'
    return b.s - a.s > GAP_SEC ? 'gap' : 'move'
  })

  // накопительные итоги к каждой точке: метры и секунды в движении / на месте / без данных
  const segDist = route.map(() => 0)
  const cum = [{ d: 0, move: 0, stop: 0, gap: 0 }]
  let anchor = route[0]
  for (let i = 1; i < route.length; i++) {
    if (seg[i] === 'move') {
      const x = dist(anchor, route[i])
      if (x >= MIN_STEP) {
        segDist[i] = x
        anchor = route[i]
      }
    } else anchor = route[i]
    const c = { ...cum[i - 1] }
    c.d += segDist[i]
    c[seg[i]] += route[i].s - route[i - 1].s
    cum.push(c)
  }

  const spans = []
  const push = (type, from, to, extra) => {
    const last = spans[spans.length - 1]
    if (last && last.type === type && type !== 'stop') last.to = to
    else spans.push({ type, from, to, ...extra })
  }
  for (let i = 1; i < route.length; i++) push(seg[i], route[i - 1].s, route[i].s, seg[i] === 'stop' ? { stop: route[i].stop } : {})

  // ломаные для карты: сплошные куски движения и пунктир через дыры
  const lines = [[]]
  const gaps = []
  for (let i = 0; i < route.length; i++) {
    const p = route[i]
    const next = route[i + 1]
    lines[lines.length - 1].push([p.lat, p.lon])
    if (seg[i + 1] === 'gap') {
      gaps.push([[p.lat, p.lon], [next.lat, next.lon]])
      lines.push([])
    }
  }

  const day = { route, seg, segDist, cum, stops, spans, lines: lines.filter((l) => l.length > 1), gaps, length, clock: makeClock(start) }
  // у кусков движения — расстояние и способ (пешком / велик / транспорт)
  for (const sp of spans) {
    if (sp.type !== 'move') continue
    sp.d = statsAt(day, sp.to).d - statsAt(day, sp.from).d
    sp.mode = modeOf(sp.to > sp.from ? (sp.d / (sp.to - sp.from)) * 3.6 : 0)
  }
  return day
}

// итоги к моменту sec: внутри отрезка добавляем его долю (ползунок свободный — числа текут плавно)
export function statsAt(day, sec) {
  const { route, seg, segDist, cum } = day
  const zero = { d: 0, move: 0, stop: 0, gap: 0 }
  if (route.length === 0 || sec < route[0].s) return zero
  const i = indexAt(route, sec)
  const out = { ...cum[i] }
  const b = route[i + 1]
  if (b) {
    const dt = sec - route[i].s
    const k = dt / (b.s - route[i].s)
    out[seg[i + 1]] += dt
    out.d += segDist[i + 1] * k
  }
  return out
}

// индекс последней точки маршрута с s <= sec (бинарный поиск), -1 если раньше всех
function indexAt(route, sec) {
  let lo = 0
  let hi = route.length - 1
  let ans = -1
  while (lo <= hi) {
    const mid = (lo + hi) >> 1
    if (route[mid].s <= sec) {
      ans = mid
      lo = mid + 1
    } else hi = mid - 1
  }
  return ans
}

// где я был в момент sec + что делал
export function stateAt(day, sec) {
  const { route, spans, stops } = day
  if (route.length === 0) return { kind: 'empty' }
  if (sec < route[0].s) return { kind: 'before', at: route[0].s }
  const i = indexAt(route, sec)
  const a = route[i]
  const b = route[i + 1]
  if (!b) return { kind: 'after', pos: a, at: a.s, index: i }

  const span = spans.find((sp) => sec >= sp.from && sec <= sp.to)
  if (span?.type === 'stop') return { kind: 'stop', pos: a, stop: stops[span.stop], index: i }
  if (span?.type === 'gap') return { kind: 'gap', pos: a, from: span.from, to: span.to, index: i }

  // движение: плавно ведём точку между двумя соседними замерами
  const k = b.s > a.s ? (sec - a.s) / (b.s - a.s) : 0
  const pos = { lat: a.lat + (b.lat - a.lat) * k, lon: a.lon + (b.lon - a.lon) * k }
  return { kind: 'move', pos, speed: speedAround(route, day.seg, i), index: i, span }
}

// средняя скорость (км/ч) по точкам в окне ±SPEED_WINDOW секунд, не выходя за стоянки и дыры
function speedAround(route, seg, i) {
  const t = route[i].s
  let lo = i
  let hi = i + 1
  while (lo > 0 && route[lo - 1].s >= t - SPEED_WINDOW && seg[lo] === 'move') lo--
  while (hi < route.length - 1 && route[hi + 1].s <= t + SPEED_WINDOW && seg[hi + 1] === 'move') hi++
  let meters = 0
  for (let k = lo + 1; k <= hi; k++) meters += dist(route[k - 1], route[k])
  const sec = route[hi].s - route[lo].s
  return sec > 0 ? (meters / sec) * 3.6 : 0
}

// пройденный хвост к моменту sec (с дыр не рисуем — они отдельным пунктиром)
export function trailAt(day, sec, state) {
  if (state.index == null) return []
  const out = [[]]
  for (let i = 0; i <= state.index; i++) {
    const p = day.route[i]
    if (day.seg[i] === 'gap') out.push([])
    out[out.length - 1].push([p.lat, p.lon])
  }
  if (state.kind === 'move') out[out.length - 1].push([state.pos.lat, state.pos.lon])
  return out.filter((l) => l.length > 1)
}

// форматирование: настоящее время на часах (учитывает перевод часов), а не «секунды / 3600»
export const makeClock = (start) => (sec) =>
  new Date(start.getTime() + sec * 1000).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
