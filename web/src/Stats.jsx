// Статы к моменту ползунка; мелким — итог за весь день
import { duration, km } from './geo.js'

const avg = (s) => (s.move >= 60 ? `${((s.d / s.move) * 3.6).toFixed(1).replace('.', ',')} км/ч` : '—')

export default function Stats({ now, total }) {
  const cards = [
    { label: 'пройдено', value: km(now.d), of: km(total.d) },
    { label: 'в движении', value: duration(now.move), of: duration(total.move) },
    { label: 'средняя скорость', value: avg(now), of: avg(total) },
    { label: 'на месте', value: duration(now.stop), of: duration(total.stop), cls: 'stop' },
  ]
  if (total.gap > 0) cards.push({ label: 'нет данных', value: duration(now.gap), of: duration(total.gap), cls: 'gap' })

  return (
    <div className="stats">
      {cards.map((c) => (
        <div key={c.label} className={`stat ${c.cls ?? ''}`}>
          <span className="label">{c.label}</span>
          <b>{c.value}</b>
          <span className="of">за день {c.of}</span>
        </div>
      ))}
    </div>
  )
}
