// Переводы и форматирование чисел/дат под выбранный язык.
// Новая строка интерфейса = ключ в обоих словарях; чего нет в en — берётся из ru.
import { createContext, useContext, useMemo, useState } from 'react'

const DICT = {
  ru: {
    'app.name': 'Life OS',
    'app.title': 'Day Replay',
    'server.online': 'сервер на связи',
    'server.offline': 'сервер недоступен',
    'server.checking': 'проверяю сервер…',
    'day.pick': 'Выбрать день',
    'day.prev': 'Предыдущий день с данными',
    'day.next': 'Следующий день с данными',
    'day.withData': 'Дни с данными',
    'status.loading': 'загружаю…',
    'status.error': 'ошибка: {e} — сервер на Самсунге доступен?',
    'status.empty': 'за этот день точек нет',
    'status.nearest': 'ближайший день с данными: {d}',
    'now.before': 'Трекинг начнётся в {t}',
    'now.after': 'Последняя точка в {t}',
    'now.stop': 'На месте · {from}–{to} · {dur}',
    'now.gap': 'Нет данных · {from}–{to}',
    'now.move': '{mode} · {speed}',
    'tag.walk': 'Пешком',
    'tag.bike': 'Велик',
    'tag.transport': 'Транспорт',
    'tag.stop': 'На месте',
    'tag.gap': 'Нет данных',
    'tag.none': 'Нет данных',
    'ev.place': 'На месте',
    'ev.walk': 'Прогулка',
    'ev.bike': 'Велопоездка',
    'ev.transport': 'Поездка',
    'tile.moved': 'Пройдено',
    'tile.steps': 'Шаги',
    'tile.eaten': 'Съедено',
    'tile.screen': 'Экран',
    'tile.motion': 'В движении',
    'tile.places': 'На месте',
    'tile.avg': 'Средняя',
    'tile.soon': 'скоро',
    'tile.ofDay': 'за день {v}',
    'inv.title': 'Инвентарь дня',
    'inv.count': '{n} из {m}',
    'inv.empty': 'Событий за день пока нет',
    'inv.notYet': ', ещё не было',
    'nav.today': 'Сегодня',
    'nav.calendar': 'Календарь',
    'nav.food': 'Еда',
    'nav.screen': 'Экран',
    'nav.soon': 'скоро',
    'play.play': 'Проиграть день',
    'play.pause': 'Пауза',
    'play.speed': 'Скорость проигрывания: {s}',
    'play.perSec': '{m} мин/с',
    'slider.label': 'Время дня',
    'map.label': 'Карта дня',
    'lang.label': 'Язык',
    'u.h': 'ч',
    'u.m': 'м',
    'u.km': 'км',
    'u.meter': 'м',
    'u.kmh': 'км/ч',
  },
  en: {
    'server.online': 'server online',
    'server.offline': 'server offline',
    'server.checking': 'checking server…',
    'day.pick': 'Pick a day',
    'day.prev': 'Previous day with data',
    'day.next': 'Next day with data',
    'day.withData': 'Days with data',
    'status.loading': 'loading…',
    'status.error': 'error: {e} — is the Samsung server reachable?',
    'status.empty': 'no points for this day',
    'status.nearest': 'nearest day with data: {d}',
    'now.before': 'Tracking starts at {t}',
    'now.after': 'Last point at {t}',
    'now.stop': 'At a place · {from}–{to} · {dur}',
    'now.gap': 'No data · {from}–{to}',
    'tag.walk': 'Walking',
    'tag.bike': 'Bike',
    'tag.transport': 'Transport',
    'tag.stop': 'Place',
    'tag.gap': 'No data',
    'tag.none': 'No data',
    'ev.place': 'At a place',
    'ev.walk': 'Walk',
    'ev.bike': 'Bike ride',
    'ev.transport': 'Ride',
    'tile.moved': 'Moved',
    'tile.steps': 'Steps',
    'tile.eaten': 'Eaten',
    'tile.screen': 'Screen',
    'tile.motion': 'In motion',
    'tile.places': 'At places',
    'tile.avg': 'Avg speed',
    'tile.soon': 'soon',
    'tile.ofDay': 'day {v}',
    'inv.title': 'Day inventory',
    'inv.count': '{n} of {m} collected',
    'inv.empty': 'No events for this day yet',
    'inv.notYet': ', not yet',
    'nav.today': 'Today',
    'nav.calendar': 'Calendar',
    'nav.food': 'Food',
    'nav.screen': 'Screen',
    'nav.soon': 'soon',
    'play.play': 'Play replay',
    'play.pause': 'Pause replay',
    'play.speed': 'Playback speed: {s}',
    'play.perSec': '{m} min/s',
    'slider.label': 'Time of day',
    'map.label': 'Map of the day',
    'lang.label': 'Language',
    'u.h': 'h',
    'u.m': 'm',
    'u.km': 'km',
    'u.meter': 'm',
    'u.kmh': 'km/h',
  },
}

const LANGS = ['ru', 'en']

// язык — личная настройка, поэтому в localStorage (в приватном окне его может не быть — тогда ru)
function loadLang() {
  try {
    const v = localStorage.getItem('lifeos.lang')
    return LANGS.includes(v) ? v : 'ru'
  } catch {
    return 'ru'
  }
}

const LangContext = createContext(null)

export function LangProvider({ children }) {
  const [lang, setLangState] = useState(loadLang)

  const value = useMemo(() => {
    const locale = lang === 'ru' ? 'ru-RU' : 'en-GB'
    const t = (key, vars) => {
      let s = DICT[lang][key] ?? DICT.ru[key] ?? key
      if (vars) for (const [k, v] of Object.entries(vars)) s = s.replaceAll(`{${k}}`, v)
      return s
    }
    const num = (x, digits) => x.toLocaleString(locale, { minimumFractionDigits: digits, maximumFractionDigits: digits })
    const f = {
      duration: (sec) => {
        const m = Math.round(sec / 60)
        return m >= 60 ? `${Math.floor(m / 60)}${t('u.h')} ${m % 60}${t('u.m')}` : `${m}${t('u.m')}`
      },
      // число и единица отдельно — в плитках единица мельче
      kmParts: (m) => (m < 1000 ? [String(Math.round(m)), t('u.meter')] : [num(m / 1000, m < 10000 ? 2 : 1), t('u.km')]),
      km: (m) => f.kmParts(m).join(' '),
      speed: (kmh) => `${num(kmh, kmh < 10 ? 1 : 0)} ${t('u.kmh')}`,
      date: (date, opts) => new Date(`${date}T12:00:00`).toLocaleDateString(locale, opts),
    }
    const setLang = (l) => {
      try {
        localStorage.setItem('lifeos.lang', l)
      } catch {
        // нет хранилища — просто не запомним выбор
      }
      document.documentElement.lang = l
      setLangState(l)
    }
    return { lang, langs: LANGS, setLang, t, f }
  }, [lang])

  return <LangContext.Provider value={value}>{children}</LangContext.Provider>
}

// eslint-disable-next-line react/only-export-components
export const useLang = () => useContext(LangContext)
