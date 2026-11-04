// Шапка: логотип, статус сервера, язык; ниже — дата, заголовок, выбор дня
import { useRef } from 'react'
import { useLang } from '../i18n.jsx'
import Icon from './Icon.jsx'

export default function Header({ date, onDate, days, server, onStep }) {
  const { t, f, lang, langs, setLang } = useLang()
  const picker = useRef(null)
  const weekday = f.date(date, { weekday: 'long', day: 'numeric', month: 'long' })
  const openPicker = () => {
    const el = picker.current
    if (el?.showPicker) el.showPicker()
    else el?.focus()
  }

  return (
    <header className="header">
      <div className="topbar">
        <div className="brand">
          <span className="logo" aria-hidden="true">L</span>
          <span>{t('app.name')}</span>
        </div>
        <div className="topbar-right">
          <span className={`pill server ${server}`}>
            <span className="dot" aria-hidden="true" />
            {t(`server.${server}`)}
          </span>
          <div className="lang" role="group" aria-label={t('lang.label')}>
            {langs.map((l) => (
              <button key={l} className={l === lang ? 'on' : ''} aria-pressed={l === lang} onClick={() => setLang(l)}>
                {l.toUpperCase()}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="titlebar">
        <div className="titles">
          <span className="weekday">{weekday.charAt(0).toUpperCase() + weekday.slice(1)}</span>
          <h1>{t('app.title')}</h1>
        </div>
        <div className="day-buttons">
          <button className="square" onClick={() => onStep(-1)} aria-label={t('day.prev')}><Icon name="chevronLeft" /></button>
          <button className="square" onClick={() => onStep(1)} aria-label={t('day.next')}><Icon name="chevronRight" /></button>
          <button className="square" onClick={openPicker} aria-label={t('day.pick')}><Icon name="calendar" /></button>
          <input ref={picker} className="visually-hidden" type="date" value={date} tabIndex={-1} aria-hidden="true"
            onChange={(e) => e.target.value && onDate(e.target.value)} />
        </div>
      </div>

      {days?.length > 0 && (
        <nav className="days" aria-label={t('day.withData')}>
          {days.map((d) => (
            <button key={d} className={d === date ? 'on' : ''} aria-current={d === date ? 'date' : undefined} onClick={() => onDate(d)}>
              {f.date(d, { weekday: 'short', day: 'numeric', month: 'short' })}
            </button>
          ))}
        </nav>
      )}
    </header>
  )
}
