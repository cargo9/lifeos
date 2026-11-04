import { useCallback, useEffect, useRef, useState } from 'react'
import { MapContainer, TileLayer, Polyline, CircleMarker, Tooltip, useMap } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'
import './App.css'
import { buildDay, stateAt, trailAt, statsAt, duration } from './geo.js'
import Stats from './Stats.jsx'
import Timeline from './Timeline.jsx'

const SPEEDS = [
  { x: 60, label: '1 мин/с' },
  { x: 300, label: '5 мин/с' },
  { x: 1200, label: '20 мин/с' },
]
const STOP_FAST = 10 // стоянки при проигрывании пролетаем в 10 раз быстрее

const ymd = (d) => d.toLocaleDateString('sv-SE') // 2026-10-30
const today = () => ymd(new Date())
// дата живёт в адресе (#2026-10-30) — перезагрузка страницы не сбрасывает день
const fromHash = () => (/^#\d{4}-\d{2}-\d{2}$/.test(location.hash) ? location.hash.slice(1) : today())
const addDays = (date, n) => {
  const d = new Date(`${date}T12:00:00`)
  d.setDate(d.getDate() + n)
  return ymd(d)
}
const human = (date) =>
  new Date(`${date}T12:00:00`).toLocaleDateString('ru-RU', { weekday: 'short', day: 'numeric', month: 'short' })

// подгоняем карту под маршрут — один раз на каждый загруженный день
function FitBounds({ day }) {
  const map = useMap()
  useEffect(() => {
    const coords = day?.route.map((p) => [p.lat, p.lon]) ?? []
    map.invalidateSize({ animate: false })
    if (coords.length > 1) map.fitBounds(coords, { padding: [40, 40], maxZoom: 17, animate: false })
    else if (coords.length === 1) map.setView(coords[0], 16, { animate: false })
  }, [day, map])
  return null
}

// Leaflet помнит размер карты с момента создания; панель снизу меняет высоту —
// без этого fitBounds считает по старому размеру и обрезает маршрут
function AutoResize() {
  const map = useMap()
  useEffect(() => {
    const ro = new ResizeObserver(() => map.invalidateSize({ animate: false }))
    ro.observe(map.getContainer())
    return () => ro.disconnect()
  }, [map])
  return null
}

// во время проигрывания не даём точке уехать за край карты
function Follow({ pos, active }) {
  const map = useMap()
  useEffect(() => {
    if (!active || !pos) return
    if (!map.getBounds().pad(-0.15).contains([pos.lat, pos.lon])) map.panTo([pos.lat, pos.lon])
  }, [pos, active, map])
  return null
}

export default function App() {
  const [date, setDate] = useState(fromHash)
  const [data, setData] = useState({ date: null, day: null, error: null })
  const [days, setDays] = useState(null) // даты, где есть точки (null — сервер не умеет /days)
  const [sec, setSec] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [speed, setSpeed] = useState(300)
  const secRef = useRef(0)

  const seek = useCallback((v) => {
    secRef.current = v
    setSec(v)
  }, [])

  // загрузка дня; AbortController — чтобы при быстром переключении дат не приехал старый ответ
  useEffect(() => {
    const ctrl = new AbortController()
    fetch(`/api/day?date=${date}`, { signal: ctrl.signal })
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return r.json()
      })
      .then((d) => {
        const day = buildDay(d.points, date)
        setData({ date, day, error: null })
        seek(day.route.length ? day.route[day.route.length - 1].s : day.length)
      })
      .catch((e) => {
        if (e.name !== 'AbortError') setData({ date, day: null, error: e.message })
      })
    return () => ctrl.abort()
  }, [date, seek])

  useEffect(() => {
    history.replaceState(null, '', `#${date}`)
  }, [date])

  useEffect(() => {
    fetch('/api/days')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setDays(d ? d.days.map((x) => x.date) : null))
      .catch(() => setDays(null))
  }, [])

  const loading = data.date !== date
  const day = loading ? null : data.day
  const first = day?.route[0]?.s
  const last = day?.route[day.route.length - 1]?.s

  const goTo = (d) => {
    setPlaying(false)
    setDate(d)
  }
  // ‹ › прыгают по дням с данными, если сервер отдал список; иначе просто ±1 день
  const step = (dir) => {
    if (days?.length) {
      const target = dir < 0 ? days.findLast((d) => d < date) : days.find((d) => d > date)
      if (target) goTo(target)
    } else goTo(addDays(date, dir))
  }

  const togglePlay = useCallback(() => {
    if (!day || first == null) return
    if (!playing && secRef.current >= last) seek(first) // доиграли — начинаем сначала
    setPlaying(!playing)
  }, [day, first, last, playing, seek])

  // проигрывание: каждый кадр двигаем время на dt × скорость
  useEffect(() => {
    if (!playing || !day) return
    let raf
    let prev = performance.now()
    const tick = (now) => {
      const dt = (now - prev) / 1000
      prev = now
      const s = secRef.current
      const st = stateAt(day, s)
      let next
      if (st.kind === 'before') next = st.at // до первой точки смотреть нечего
      else if (st.kind === 'gap') next = st.to // дыру в данных перепрыгиваем
      else next = s + dt * speed * (st.kind === 'stop' ? STOP_FAST : 1)
      if (next >= last) {
        seek(last)
        setPlaying(false)
        return
      }
      seek(next)
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [playing, day, speed, last, seek])

  // клавиши: пробел — play/pause, ←/→ — минута, с Shift — 10 минут
  useEffect(() => {
    const onKey = (e) => {
      if (e.target.tagName === 'INPUT' && e.target.type !== 'range') return
      if (e.code === 'Space') {
        e.preventDefault()
        togglePlay()
      } else if (day && (e.code === 'ArrowLeft' || e.code === 'ArrowRight')) {
        e.preventDefault()
        const d = (e.shiftKey ? 600 : 60) * (e.code === 'ArrowLeft' ? -1 : 1)
        seek(Math.min(day.length, Math.max(0, secRef.current + d)))
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [day, togglePlay, seek])

  const state = day ? stateAt(day, sec) : { kind: 'empty' }
  const trail = day ? trailAt(day, sec, state) : []
  const clock = day?.clock ?? (() => '--:--')
  const nearest = days?.length ? (days.findLast((d) => d < date) ?? days.find((d) => d > date)) : null

  let status
  if (loading) status = 'загружаю…'
  else if (data.error) status = `ошибка: ${data.error} — сервер на Самсунге доступен?`
  else if (state.kind === 'empty') status = 'за этот день точек нет'
  else if (state.kind === 'before') status = `трекинг начнётся в ${clock(state.at)}`
  else if (state.kind === 'after') status = `последняя точка в ${clock(state.at)}`
  else if (state.kind === 'stop') status = `на месте · ${clock(state.stop.from)}–${clock(state.stop.to)} · ${duration(state.stop.to - state.stop.from)}`
  else if (state.kind === 'gap') status = `нет данных · ${clock(state.from)}–${clock(state.to)}`
  else status = `в пути · ${Math.round(state.speed)} км/ч`

  return (
    <div className="app">
      <header>
        <h1>Day Replay</h1>
        <div className="datebar">
          <button className="icon" onClick={() => step(-1)} aria-label="предыдущий день">‹</button>
          <input type="date" value={date} onChange={(e) => e.target.value && goTo(e.target.value)} />
          <button className="icon" onClick={() => step(1)} aria-label="следующий день">›</button>
        </div>
      </header>

      {days?.length > 0 && (
        <nav className="days">
          {days.map((d) => (
            <button key={d} className={d === date ? 'on' : ''} onClick={() => goTo(d)}>{human(d)}</button>
          ))}
        </nav>
      )}

      <div className="map">
        <MapContainer center={[51.16, 10.45]} zoom={6} style={{ height: '100%' }}>
          <TileLayer url="https://tile.openstreetmap.org/{z}/{x}/{y}.png" attribution="&copy; OpenStreetMap" />
          {day && (
            <>
              {day.lines.map((l, i) => (
                <Polyline key={`l${i}`} positions={l} pathOptions={{ color: '#4a4a56', weight: 4 }} />
              ))}
              {day.gaps.map((g, i) => (
                <Polyline key={`g${i}`} positions={g} pathOptions={{ color: '#6b6b78', weight: 2, dashArray: '4 8' }} />
              ))}
              {trail.map((l, i) => (
                <Polyline key={`t${i}`} positions={l} pathOptions={{ color: '#a48bff', weight: 5 }} />
              ))}
              {day.stops.map((s, i) => {
                const active = state.kind === 'stop' && state.stop === s
                return (
                  <CircleMarker key={i} center={[s.lat, s.lon]} radius={active ? 11 : 7}
                    eventHandlers={{ click: () => seek(s.from) }}
                    pathOptions={{ color: '#e8b04a', fillColor: '#e8b04a', fillOpacity: active ? 0.6 : 0.3, weight: 2 }}>
                    <Tooltip>{clock(s.from)}–{clock(s.to)} · {duration(s.to - s.from)}</Tooltip>
                  </CircleMarker>
                )
              })}
              {state.pos && (
                <CircleMarker center={[state.pos.lat, state.pos.lon]} radius={8}
                  pathOptions={{ color: '#0e0e0f', fillColor: state.kind === 'gap' ? '#6b6b78' : '#a48bff', fillOpacity: 1, weight: 3 }} />
              )}
            </>
          )}
          <AutoResize />
          <FitBounds day={day} />
          <Follow pos={state.pos} active={playing} />
        </MapContainer>
      </div>

      <div className="player">
        <div className="row">
          <button className="play" onClick={togglePlay} disabled={!day || first == null} aria-label={playing ? 'пауза' : 'играть'}>
            {playing ? '❚❚' : '▶'}
          </button>
          <div className="clock">{day ? clock(sec) : '--:--'}</div>
          <div className="meta">
            {status}
            {!loading && state.kind === 'empty' && nearest && (
              <> · <button className="link" onClick={() => goTo(nearest)}>ближайший день с данными: {human(nearest)}</button></>
            )}
          </div>
          <div className="speeds">
            {SPEEDS.map((s) => (
              <button key={s.x} className={speed === s.x ? 'on' : ''} onClick={() => setSpeed(s.x)}>{s.label}</button>
            ))}
          </div>
        </div>

        {day && <Timeline day={day} sec={sec} onChange={seek} />}

        <div className="legend">
          <span><i className="move" /> движение</span>
          <span><i className="stop" /> стоянка</span>
          <span><i className="gap" /> нет данных</span>
          <span className="keys">пробел — play · ←/→ — минута · Shift — 10 минут</span>
        </div>

        {day && first != null && <Stats now={statsAt(day, sec)} total={statsAt(day, last)} />}

        {day?.stops.length > 0 && (
          <div className="stops">
            {day.stops.map((s, i) => (
              <button key={i} className={state.kind === 'stop' && state.stop === s ? 'on' : ''} onClick={() => seek(s.from)}>
                <b>{clock(s.from)}–{clock(s.to)}</b>
                <span>{duration(s.to - s.from)}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
