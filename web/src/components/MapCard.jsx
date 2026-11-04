// Карта дня: весь маршрут тусклым, пройденное — фиолетовым, стоянки — жёлтыми кругами
import { useEffect } from 'react'
import { MapContainer, TileLayer, Polyline, CircleMarker, Tooltip, useMap } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'
import { useLang } from '../i18n.jsx'

const C = { accent: '#a48bff', route: '#4a4a56', gap: '#6b6b78', stop: '#e8b04a', bg: '#0e0e0f' }

// подгоняем карту под маршрут — один раз на каждый загруженный день
function FitBounds({ day }) {
  const map = useMap()
  useEffect(() => {
    const coords = day?.route.map((p) => [p.lat, p.lon]) ?? []
    map.invalidateSize({ animate: false })
    if (coords.length > 1) map.fitBounds(coords, { padding: [30, 30], maxZoom: 17, animate: false })
    else if (coords.length === 1) map.setView(coords[0], 16, { animate: false })
  }, [day, map])
  return null
}

// Leaflet помнит размер с момента создания — следим, иначе fitBounds обрезает маршрут
function AutoResize() {
  const map = useMap()
  useEffect(() => {
    const ro = new ResizeObserver(() => map.invalidateSize({ animate: false }))
    ro.observe(map.getContainer())
    return () => ro.disconnect()
  }, [map])
  return null
}

// во время проигрывания не даём точке уехать за край
function Follow({ pos, active }) {
  const map = useMap()
  useEffect(() => {
    if (!active || !pos) return
    if (!map.getBounds().pad(-0.15).contains([pos.lat, pos.lon])) map.panTo([pos.lat, pos.lon])
  }, [pos, active, map])
  return null
}

export default function MapCard({ day, state, trail, playing, kmNow, onSeek }) {
  const { t, f } = useLang()
  return (
    <section className="card map-card" aria-label={t('map.label')}>
      <MapContainer center={[51.16, 10.45]} zoom={6} zoomControl={false} attributionControl={false} style={{ height: '100%' }}>
        <TileLayer url="https://tile.openstreetmap.org/{z}/{x}/{y}.png" />
        {day && (
          <>
            {day.lines.map((l, i) => (
              <Polyline key={`l${i}`} positions={l} pathOptions={{ color: C.route, weight: 4 }} />
            ))}
            {day.gaps.map((g, i) => (
              <Polyline key={`g${i}`} positions={g} pathOptions={{ color: C.gap, weight: 2, dashArray: '2 6' }} />
            ))}
            {trail.map((l, i) => (
              <Polyline key={`t${i}`} positions={l} pathOptions={{ color: C.accent, weight: 5, lineCap: 'round', lineJoin: 'round' }} />
            ))}
            {day.stops.map((s, i) => {
              const active = state.kind === 'stop' && state.stop === s
              return (
                <CircleMarker key={i} center={[s.lat, s.lon]} radius={active ? 9 : 6}
                  eventHandlers={{ click: () => onSeek(s.from) }}
                  pathOptions={{ color: C.stop, fillColor: '#2a2a2d', fillOpacity: 1, weight: 2 }}>
                  <Tooltip>{day.clock(s.from)}–{day.clock(s.to)} · {f.duration(s.to - s.from)}</Tooltip>
                </CircleMarker>
              )
            })}
            {state.pos && (
              <>
                <CircleMarker center={[state.pos.lat, state.pos.lon]} radius={16} interactive={false}
                  pathOptions={{ stroke: false, fillColor: C.accent, fillOpacity: 0.18 }} />
                <CircleMarker center={[state.pos.lat, state.pos.lon]} radius={8} interactive={false}
                  pathOptions={{ color: C.bg, weight: 3, fillColor: state.kind === 'gap' ? C.gap : C.accent, fillOpacity: 1 }} />
              </>
            )}
          </>
        )}
        <AutoResize />
        <FitBounds day={day} />
        <Follow pos={state.pos} active={playing} />
      </MapContainer>
      {kmNow && <div className="map-badge">{kmNow}</div>}
      <a className="map-attrib" href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">© OpenStreetMap</a>
    </section>
  )
}
