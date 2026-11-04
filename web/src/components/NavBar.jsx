// Нижнее меню. Готов только «Сегодня», остальные экраны — по роадмапу.
import { useLang } from '../i18n.jsx'
import Icon from './Icon.jsx'

const TABS = [
  { id: 'today', icon: 'clock', ready: true },
  { id: 'calendar', icon: 'calendar' },
  { id: 'food', icon: 'food' },
  { id: 'screen', icon: 'phone' },
]

export default function NavBar({ active = 'today' }) {
  const { t } = useLang()
  return (
    <nav className="navbar" aria-label="Main">
      {TABS.map((tab) => (
        <button key={tab.id} className={tab.id === active ? 'on' : ''} disabled={!tab.ready}
          aria-current={tab.id === active ? 'page' : undefined}
          title={tab.ready ? undefined : t('nav.soon')}>
          <Icon name={tab.icon} size={22} />
          <span>{t(`nav.${tab.id}`)}</span>
          {!tab.ready && <small>{t('nav.soon')}</small>}
        </button>
      ))}
    </nav>
  )
}
