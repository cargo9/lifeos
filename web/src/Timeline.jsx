// Ползунок дня: под ним «дорожка» — где двигался, где стоял, где данных нет.
// Ползунок свободный: никакой привязки к событиям.

const HOURS = [0, 3, 6, 9, 12, 15, 18, 21, 24]

export default function Timeline({ day, sec, onChange }) {
  const pct = (s) => `${(s / day.length) * 100}%`
  const first = day.route[0]?.s
  const last = day.route[day.route.length - 1]?.s

  return (
    <div className="timeline">
      <div className="track">
        {first != null && <div className="span tracked" style={{ left: pct(first), width: pct(last - first) }} />}
        {day.spans.map((sp, i) => (
          <div key={i} className={`span ${sp.type}`} style={{ left: pct(sp.from), width: pct(sp.to - sp.from) }} />
        ))}
        <div className="cursor" style={{ left: pct(sec) }} />
        <input
          type="range"
          min="0"
          max={day.length}
          step="1"
          value={sec}
          onChange={(e) => onChange(Number(e.target.value))}
          aria-label="время дня"
        />
      </div>
      <div className="ticks">
        {HOURS.map((h) => (
          <span key={h} style={{ left: pct(Math.min(h * 3600, day.length)) }}>
            {String(h).padStart(2, '0')}:00
          </span>
        ))}
      </div>
    </div>
  )
}
