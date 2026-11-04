// Плитки метрик из реестра (metrics.js). Нет данных → «—» и «скоро».
import { useLang } from '../i18n.jsx'

export default function Tiles({ tiles, ctx, small }) {
  const { t, f } = useLang()
  return (
    <div className={`tiles ${small ? 'small' : ''}`} style={{ '--cols': tiles.length }}>
      {tiles.map((tile) => {
        const v = ctx ? tile.get(ctx, f) : null
        return (
          <div key={tile.id} className={`tile ${v ? '' : 'soon'}`}>
            <span className="tile-label">{t(tile.label)}</span>
            <span className="tile-value">
              {v ? v.value : '—'}
              {v?.unit && <span className="unit"> {v.unit}</span>}
            </span>
            <span className="tile-of">{v ? (v.of != null ? t('tile.ofDay', { v: v.of }) : '') : t('tile.soon')}</span>
          </div>
        )
      })}
    </div>
  )
}
