// Вся «математика дня»: чистка GPS, остановки, дыры, позиция на момент времени.
// Время везде — секунды от начала выбранных суток (поле s у точки).

export const STOP_RADIUS = 60 // м: дальше — уже не «стою на месте»
export const STOP_MIN_SEC = 10 * 60 // остановка — от 10 минут
export const GAP_SEC = 5 * 60 // телефон молчал дольше 5 минут вне стоянки = «нет данных»
export const MERGE_SEC = 3 * 60 // соседние стоянки в одном месте с паузой < 3 мин склеиваем
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

  const spans = []
  const push = (type, from, to, extra) => {
    const last = spans[spans.length - 1]
    if (last && last.type === type && type !== 'stop') last.to = to
    else spans.push({ type, from, to, ...extra })
  }
  for (let i = 1; i < route.length; i++) {
    const a = route[i - 1]
    const b = route[i]
    if (a.stop != null && a.stop === b.stop) push('stop', a.s, b.s, { stop: a.stop })
    else if (b.s - a.s > GAP_SEC) push('gap', a.s, b.s)
    else push('move', a.s, b.s)
  }

  // ломаные для карты: сплошные куски движения и пунктир через дыры
  const lines = [[]]
  const gaps = []
  for (let i = 0; i < route.length; i++) {
    const p = route[i]
    const next = route[i + 1]
    lines[lines.length - 1].push([p.lat, p.lon])
    if (next && next.s - p.s > GAP_SEC && !(p.stop != null && p.stop === next.stop)) {
      gaps.push([[p.lat, p.lon], [next.lat, next.lon]])
      lines.push([])
    }
  }

  return { route, stops, spans, lines: lines.filter((l) => l.length > 1), gaps, length, clock: makeClock(start) }
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
  return { kind: 'move', pos, speed: speedAround(route, i), index: i }
}

// средняя скорость (км/ч) по точкам в окне ±SPEED_WINDOW секунд, не выходя за стоянки и дыры
function speedAround(route, i) {
  const t = route[i].s
  let lo = i
  let hi = i + 1
  const ok = (a, b) => b.s - a.s <= GAP_SEC && !(a.stop != null && a.stop === b.stop)
  while (lo > 0 && route[lo - 1].s >= t - SPEED_WINDOW && ok(route[lo - 1], route[lo])) lo--
  while (hi < route.length - 1 && route[hi + 1].s <= t + SPEED_WINDOW && ok(route[hi], route[hi + 1])) hi++
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
    const prev = day.route[i - 1]
    if (prev && p.s - prev.s > GAP_SEC && !(prev.stop != null && prev.stop === p.stop)) out.push([])
    out[out.length - 1].push([p.lat, p.lon])
  }
  if (state.kind === 'move') out[out.length - 1].push([state.pos.lat, state.pos.lon])
  return out.filter((l) => l.length > 1)
}

// форматирование: настоящее время на часах (учитывает перевод часов), а не «секунды / 3600»
export const makeClock = (start) => (sec) =>
  new Date(start.getTime() + sec * 1000).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })

export const duration = (sec) => {
  const m = Math.round(sec / 60)
  return m >= 60 ? `${Math.floor(m / 60)}ч ${m % 60}м` : `${m}м`
}
