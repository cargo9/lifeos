import { useEffect, useMemo, useState } from 'react'
import './App.css'
import { buildDay, stateAt, trailAt, statsAt } from './geo.js'
import { PRIMARY_TILES, SECONDARY_TILES, buildEvents, buildSources } from './metrics.js'
import { useLang } from './i18n.jsx'
import { useReplay } from './useReplay.js'
import Header from './components/Header.jsx'
import MapCard from './components/MapCard.jsx'
import Player from './components/Player.jsx'
import Tiles from './components/Tiles.jsx'
import Inventory from './components/Inventory.jsx'
import NavBar from './components/NavBar.jsx'

const ymd = (d) => d.toLocaleDateString('sv-SE') // 2026-10-30
const today = () => ymd(new Date())
const addDays = (date, n) => {
  const d = new Date(`${date}T12:00:00`)
  d.setDate(d.getDate() + n)
  return ymd(d)
}
// дата живёт в адресе (#2026-10-30) — перезагрузка страницы не сбрасывает день
const fromHash = () => (/^#\d{4}-\d{2}-\d{2}$/.test(location.hash) ? location.hash.slice(1) : today())

export default function App() {
  const { t, f } = useLang()
  const [date, setDate] = useState(fromHash)
  const [data, setData] = useState({ date: null, day: null, samples: null, error: null })
  const [days, setDays] = useState(null) // даты, где есть точки
  const [server, setServer] = useState('checking')

  const loading = data.date !== date
  const day = loading ? null : data.day
  const { sec, secRef, seek, playing, toggle, stop, speed, cycleSpeed } = useReplay(day)

  // загрузка дня: GPS + интервалы (шаги…) параллельно;
  // AbortController — чтобы при быстром переключении дат не приехал старый ответ
  useEffect(() => {
    const ctrl = new AbortController()
    const get = (url) =>
      fetch(url, { signal: ctrl.signal }).then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return r.json()
      })
    // шаги не обязательны: если /samples недоступен, карта всё равно покажется
    const samples = get(`/api/samples?date=${date}`).catch((e) => {
      if (e.name === 'AbortError') throw e
      return { samples: {} }
    })
    Promise.all([get(`/api/day?date=${date}`), samples])
      .then(([d, s]) => {
        const built = buildDay(d.points, date)
        setData({ date, day: built, samples: s.samples, error: null })
        // ползунок — на последнюю точку; если GPS нет — на конец дня (23:59, а не 00:00 следующих суток)
        seek(built.route.length ? built.route[built.route.length - 1].s : built.length - 60)
      })
      .catch((e) => {
        if (e.name !== 'AbortError') setData({ date, day: null, samples: null, error: e.message })
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

  // Самсунг на слабом интернете — показываем, на связи ли он (раз в 30 с)
  useEffect(() => {
    const check = () =>
      fetch('/api/health', { signal: AbortSignal.timeout(10000) })
        .then((r) => setServer(r.ok ? 'online' : 'offline'))
        .catch(() => setServer('offline'))
    check()
    const id = setInterval(check, 30000)
    return () => clearInterval(id)
  }, [])

  const goTo = (d) => {
    stop()
    setDate(d)
  }
  // ‹ › прыгают по дням с данными, если сервер отдал список; иначе просто ±1 день
  const step = (dir) => {
    if (days?.length) {
      const target = dir < 0 ? days.findLast((d) => d < date) : days.find((d) => d > date)
      if (target) goTo(target)
    } else goTo(addDays(date, dir))
  }

  // клавиши: пробел — play/pause, ←/→ — минута, с Shift — 10 минут
  useEffect(() => {
    const onKey = (e) => {
      if (e.target.tagName === 'INPUT' && e.target.type !== 'range') return
      if (e.code === 'Space') {
        e.preventDefault()
        toggle()
      } else if (day && (e.code === 'ArrowLeft' || e.code === 'ArrowRight')) {
        e.preventDefault()
        const d = (e.shiftKey ? 600 : 60) * (e.code === 'ArrowLeft' ? -1 : 1)
        seek(Math.min(day.length, Math.max(0, secRef.current + d)))
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [day, toggle, seek, secRef])

  const state = day ? stateAt(day, sec) : { kind: 'empty' }
  const trail = day ? trailAt(day, sec, state) : []
  const sources = useMemo(() => (day ? buildSources(data.samples, day) : {}), [day, data.samples])
  const events = useMemo(() => (day ? buildEvents(day, sources) : []), [day, sources])
  const hasPoints = day?.route.length > 0
  const ctx = day
    ? {
        day,
        sec,
        now: hasPoints ? statsAt(day, sec) : null,
        total: hasPoints ? statsAt(day, day.route[day.route.length - 1].s) : null,
        sources,
      }
    : null
  const nearest = days?.length ? (days.findLast((d) => d < date) ?? days.find((d) => d > date)) : null

  const clock = day?.clock
  let status
  if (loading) status = t('status.loading')
  else if (data.error) status = t('status.error', { e: data.error })
  else if (state.kind === 'empty') status = t('status.empty')
  else if (state.kind === 'before') status = t('now.before', { t: clock(state.at) })
  else if (state.kind === 'after') status = t('now.after', { t: clock(state.at) })
  else if (state.kind === 'stop')
    status = t('now.stop', { from: clock(state.stop.from), to: clock(state.stop.to), dur: f.duration(state.stop.to - state.stop.from) })
  else if (state.kind === 'gap') status = t('now.gap', { from: clock(state.from), to: clock(state.to) })
  else status = t('now.move', { mode: t(`ev.${state.span?.mode ?? 'walk'}`), speed: f.speed(state.speed) })

  return (
    <div className="phone">
      <Header date={date} onDate={goTo} days={days} server={server} onStep={step} />

      <main className="content">
        <MapCard day={day} state={state} trail={trail} playing={playing} kmNow={ctx?.now ? f.km(ctx.now.d) : ''} onSeek={seek} />

        <Player day={day} sec={sec} state={state} status={status} playing={playing}
          onToggle={toggle} onSeek={seek} speed={speed} onSpeed={cycleSpeed} />

        {!loading && !hasPoints && Object.keys(sources).length === 0 && nearest && (
          <button className="nearest" onClick={() => goTo(nearest)}>
            {t('status.nearest', { d: f.date(nearest, { weekday: 'short', day: 'numeric', month: 'long' }) })} →
          </button>
        )}

        <Tiles tiles={PRIMARY_TILES} ctx={ctx} />
        <Tiles tiles={SECONDARY_TILES} ctx={ctx} small />

        {day && <Inventory day={day} events={events} sec={sec} onSeek={seek} />}
      </main>

      <NavBar active="today" />
    </div>
  )
}
