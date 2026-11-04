import { useEffect, useMemo, useState } from 'react'
import { MapContainer, TileLayer, Polyline, CircleMarker, Tooltip, useMap } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'
import './App.css'

const today = () => new Date().toLocaleDateString('sv-SE')
const minutesOf = (d) => d.getHours() * 60 + d.getMinutes()
const fmt = (m) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
const hm = (d) => fmt(minutesOf(d))
const dur = (a, b) => {
  const m = Math.round((b - a) / 60000)
  return m >= 60 ? `${Math.floor(m / 60)}ч ${m % 60}м` : `${m}м`
}

// расстояние между точками в метрах
const dist = (a, b) => {
  const rad = (x) => (x * Math.PI) / 180
  const dLat = rad(b.lat - a.lat), dLon = rad(b.lon - a.lon)
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2
  return 2 * 6371000 * Math.asin(Math.sqrt(h))
}

// 1. чистим шум: плохая точность и «телепорты»
function cleanPoints(pts, maxAcc = 30) {
  const out = []
  for (const p of pts) {
    if (p.accuracy != null && p.accuracy > maxAcc) continue
    const prev = out[out.length - 1]
    if (prev) {
      const dt = (p.t - prev.t) / 1000
      if (dt > 0 && dist(prev, p) / dt > 50) continue
    }
    out.push(p)
  }
  return out
}

// 2. ищем остановки: 10+ минут в радиусе 60 м
function detectStops(pts, radius = 60, minMinutes = 10) {
  const stops = []
  let i = 0
  while (i < pts.length) {
    let j = i + 1
    while (j < pts.length && dist(pts[i], pts[j]) <= radius) j++
    const minutes = (pts[j - 1].t - pts[i].t) / 60000
    if (minutes >= minMinutes) {
      const g = pts.slice(i, j)
      stops.push({
        lat: g.reduce((s, p) => s + p.lat, 0) / g.length,
        lon: g.reduce((s, p) => s + p.lon, 0) / g.length,
        from: pts[i].t, to: pts[j - 1].t, start: i, end: j - 1,
      })
      i = j
    } else i++
  }
  return stops
}

// 3. маршрут: кучу точек остановки заменяем одной точкой в центре
function buildRoute(pts, stops) {
  const route = []
  let s = 0
  for (let i = 0; i < pts.length; i++) {
    const stop = stops[s]
    if (stop && i === stop.start) {
      route.push({ lat: stop.lat, lon: stop.lon, t: stop.from })
      route.push({ lat: stop.lat, lon: stop.lon, t: stop.to })
      i = stop.end
      s++
    } else route.push(pts[i])
  }
  return route
}

function FitBounds({ coords }) {
  const map = useMap()
  useEffect(() => {
    if (coords.length > 1) map.fitBounds(coords, { padding: [30, 30] })
    else if (coords.length === 1) map.setView(coords[0], 16)
  }, [coords, map])
  return null
}

export default function App() {
  const [date, setDate] = useState(today())
  const [points, setPoints] = useState([])
  const [minute, setMinute] = useState(1439)
  const [status, setStatus] = useState('')

  useEffect(() => {
    setStatus('загружаю…')
    fetch(`/api/day?date=${date}`)
      .then((r) => { if (!r.ok) throw new Error(r.status); return r.json() })
      .then((d) => {
        const pts = cleanPoints(d.points.map((p) => ({ ...p, t: new Date(p.ts) })))
        setPoints(pts)
        setMinute(pts.length ? minutesOf(pts[pts.length - 1].t) : 1439)
        setStatus(pts.length ? '' : 'за этот день точек нет')
      })
      .catch((e) => setStatus('ошибка: ' + e.message))
  }, [date])

  const stops = useMemo(() => detectStops(points), [points])
  const route = useMemo(() => buildRoute(points, stops), [points, stops])
  const all = useMemo(() => route.map((p) => [p.lat, p.lon]), [route])
  const passed = route.filter((p) => minutesOf(p.t) <= minute)
  const trail = passed.map((p) => [p.lat, p.lon])
  const now = passed[passed.length - 1]
  const current = stops.find((s) => minute >= minutesOf(s.from) && minute <= minutesOf(s.to))

  return (
    <div className="app">
      <header>
        <h1>Day Replay</h1>
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
      </header>

      <div className="map">
        <MapContainer center={[51.16, 10.45]} zoom={6} style={{ height: '100%' }}>
          <TileLayer url="https://tile.openstreetmap.org/{z}/{x}/{y}.png" attribution="&copy; OpenStreetMap" />
          <Polyline positions={all} pathOptions={{ color: '#3a3a44', weight: 3, dashArray: '2 6' }} />
          <Polyline positions={trail} pathOptions={{ color: '#a48bff', weight: 4 }} />
          {stops.map((s, i) => (
            <CircleMarker key={i} center={[s.lat, s.lon]} radius={7}
              pathOptions={{ color: '#e8b04a', fillColor: '#e8b04a', fillOpacity: 0.35, weight: 2 }}>
              <Tooltip>{hm(s.from)}–{hm(s.to)} · {dur(s.from, s.to)}</Tooltip>
            </CircleMarker>
          ))}
          {now && (
            <CircleMarker center={[now.lat, now.lon]} radius={8}
              pathOptions={{ color: '#0e0e0f', fillColor: '#a48bff', fillOpacity: 1, weight: 3 }} />
          )}
          <FitBounds coords={all} />
        </MapContainer>
      </div>

      <div className="player">
        <div className="clock">{fmt(minute)}</div>
        <div className="meta">
          {status || (current ? `на месте · ${hm(current.from)}–${hm(current.to)}` : 'в пути')}
        </div>
        <input type="range" min="0" max="1439" value={minute} onChange={(e) => setMinute(Number(e.target.value))} />
        <div className="ticks"><span>00:00</span><span>06:00</span><span>12:00</span><span>18:00</span><span>24:00</span></div>

        {stops.length > 0 && (
          <div className="stops">
            {stops.map((s, i) => (
              <button key={i} onClick={() => setMinute(minutesOf(s.from))}>
                <b>{hm(s.from)}–{hm(s.to)}</b>
                <span>{dur(s.from, s.to)}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}