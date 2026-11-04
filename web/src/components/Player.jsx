// Плеер: Play, часы, «что сейчас», полоса активностей и свободный ползунок
import { useLang } from '../i18n.jsx'

const BAND = { move: '#a48bff', stop: '#e8b04a', gap: '#2a2a2d', none: '#202023' }
const TICKS = [0, 6, 12, 18, 24]

// куски дня для полосы: до первой точки, движения/стоянки/дыры, после последней
function bandsOf(day) {
  const out = []
  const first = day.route[0]?.s
  const last = day.route[day.route.length - 1]?.s
  if (first == null) return [{ type: 'none', from: 0, to: day.length }]
  if (first > 0) out.push({ type: 'none', from: 0, to: first })
  out.push(...day.spans)
  if (last < day.length) out.push({ type: 'none', from: last, to: day.length })
  return out
}

function Bands({ day, sec }) {
  const pct = (s) => `${(s / day.length) * 100}%`
  const bands = bandsOf(day)
  const layer = (cls, style) => (
    <div className={cls} style={style}>
      {bands.map((b, i) => (
        <span key={i} style={{ left: pct(b.from), width: pct(b.to - b.from), background: BAND[b.type] }} />
      ))}
    </div>
  )
  // снизу — весь день приглушённо, сверху — пройденная часть ярко (обрезана справа по ползунку)
  const rest = 100 - (sec / day.length) * 100
  return (
    <div className="bands" aria-hidden="true">
      {layer('bands-layer dim')}
      {layer('bands-layer', { clipPath: `inset(0 ${rest}% 0 0)` })}
    </div>
  )
}

export default function Player({ day, sec, state, status, playing, onToggle, onSeek, speed, onSpeed }) {
  const { t } = useLang()
  const tagKind = state.kind === 'move' ? state.span?.mode ?? 'walk' : state.kind === 'stop' ? 'stop' : state.kind === 'gap' ? 'gap' : 'none'
  const showTag = day && state.kind !== 'empty'

  return (
    <section className="card player">
      <div className="player-row">
        <button className="play" onClick={onToggle} disabled={!day || !day.route.length} aria-label={t(playing ? 'play.pause' : 'play.play')}>
          {playing ? (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="6" y="5" width="4" height="14" rx="1" /><rect x="14" y="5" width="4" height="14" rx="1" /></svg>
          ) : (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5.5v13a1 1 0 0 0 1.5.9l10.5-6.5a1 1 0 0 0 0-1.7L9.5 4.6A1 1 0 0 0 8 5.5z" /></svg>
          )}
        </button>
        <div className="now">
          <span className="clock">{day ? day.clock(sec) : '--:--'}</span>
          <span className="now-label">{status}</span>
        </div>
        {showTag && <span className={`tag ${tagKind}`}>{t(`tag.${tagKind}`)}</span>}
      </div>

      {day && (
        <div className="scrubber">
          <Bands day={day} sec={sec} />
          <input type="range" min="0" max={day.length} step="1" value={sec} aria-label={t('slider.label')}
            aria-valuetext={day.clock(sec)} onChange={(e) => onSeek(Number(e.target.value))} />
          <div className="ticks">
            {TICKS.map((h) => <span key={h}>{String(h).padStart(2, '0')}:00</span>)}
          </div>
        </div>
      )}

      <div className="player-foot">
        <button className="speed" onClick={onSpeed} aria-label={t('play.speed', { s: t('play.perSec', { m: speed / 60 }) })}>
          ×{t('play.perSec', { m: speed / 60 })}
        </button>
        <span className="keys">␣ play · ← → 1 {t('u.m')} · ⇧ 10 {t('u.m')}</span>
      </div>
    </section>
  )
}
