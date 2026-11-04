// «Инвентарь дня»: события собираются по мере того, как ползунок доходит до их времени
import { useLang } from '../i18n.jsx'
import Icon from './Icon.jsx'

// kind события → иконка и цвет (новый вид события — одна строка здесь)
const KINDS = {
  place: { icon: 'pin', color: 'amber' },
  walk: { icon: 'walk', color: 'violet' },
  bike: { icon: 'bike', color: 'violet' },
  transport: { icon: 'transport', color: 'blue' },
  food: { icon: 'food', color: 'amber' },
  gym: { icon: 'gym', color: 'green' },
}

export default function Inventory({ day, events, sec, onSeek }) {
  const { t, f } = useLang()
  const got = events.filter((e) => e.at <= sec).length

  return (
    <section className="inventory">
      <div className="section-head">
        <h2>{t('inv.title')}</h2>
        {events.length > 0 && <span>{t('inv.count', { n: got, m: events.length })}</span>}
      </div>
      {events.length === 0 ? (
        <p className="empty">{t('inv.empty')}</p>
      ) : (
        <div className="inv-grid">
          {events.map((e, i) => {
            const k = KINDS[e.kind] ?? KINDS.place
            const done = e.at <= sec
            const title = e.title.startsWith('ev.') ? t(e.title) : e.title
            const sub = e.sub ?? (e.km != null ? f.km(e.km) : e.dur != null ? f.duration(e.dur) : '')
            return (
              <button key={i} className={`inv ${done ? 'got' : ''}`} onClick={() => onSeek(e.at)}
                aria-label={`${title}, ${sub}, ${day.clock(e.at)}${done ? '' : t('inv.notYet')}`}>
                <span className={`inv-icon ${k.color}`}><Icon name={k.icon} /></span>
                <span className="inv-title">{title}</span>
                <span className="inv-sub">{sub}</span>
                <span className="inv-time">{day.clock(e.at)}</span>
              </button>
            )
          })}
        </div>
      )}
    </section>
  )
}
