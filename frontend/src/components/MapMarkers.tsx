import { useEffect } from 'react'
import { MapContainer, TileLayer, Marker, Tooltip, useMap } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'

// Иконки Leaflet через CDN, чтобы не возиться с импортом ассетов из node_modules в Vite.
delete (L.Icon.Default.prototype as unknown as { _getIconUrl?: unknown })._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl:       'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl:     'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
})

const COLOR_PICKUP   = '#2980b9'   // синий
const COLOR_DELIVERY = '#27ae60'   // зелёный
const COLOR_NEUTRAL  = '#e67e22'   // оранжевый

/**
 * Иконка одиночной метки.
 * Если в точке только один заказ — обычная капля одного цвета.
 */
const createSingleIcon = (color: string): L.DivIcon => L.divIcon({
  className: 'map-marker',
  html: `<svg width="28" height="40" viewBox="0 0 28 40" xmlns="http://www.w3.org/2000/svg">
    <path d="M14 0 C6 0 0 6 0 14 C0 24 14 40 14 40 S28 24 28 14 C28 6 22 0 14 0 Z"
          fill="${color}" stroke="#fff" stroke-width="2"/>
    <circle cx="14" cy="14" r="5" fill="#fff"/>
  </svg>`,
  iconSize: [28, 40],
  iconAnchor: [14, 40],
})

/**
 * Иконка кластера: одна капля, в круге внутри — число.
 * Цвет: если в группе только один тип — соответствующий, если оба — половина синего, половина зелёного.
 */
const createClusterIcon = (count: number, kinds: Set<MarkerKind>): L.DivIcon => {
  const hasPickup = kinds.has('pickup')
  const hasDelivery = kinds.has('delivery')
  let pathFill: string
  if (hasPickup && hasDelivery) {
    // Двухцветный градиент: левая половина — синяя (забор), правая — зелёная (доставка)
    pathFill = 'url(#splitGrad)'
  } else if (hasPickup) {
    pathFill = COLOR_PICKUP
  } else if (hasDelivery) {
    pathFill = COLOR_DELIVERY
  } else {
    pathFill = COLOR_NEUTRAL
  }

  // Размер слегка больше у кластеров, чтобы цифра помещалась.
  const size = count >= 10 ? 36 : 32
  const fontSize = count >= 10 ? 13 : 14

  // SVG с inline gradient для двухцветного варианта.
  const svg = `<svg width="${size}" height="${Math.round(size * 1.4)}" viewBox="0 0 28 40" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="splitGrad" x1="0" x2="1" y1="0" y2="0">
        <stop offset="50%" stop-color="${COLOR_PICKUP}"/>
        <stop offset="50%" stop-color="${COLOR_DELIVERY}"/>
      </linearGradient>
    </defs>
    <path d="M14 0 C6 0 0 6 0 14 C0 24 14 40 14 40 S28 24 28 14 C28 6 22 0 14 0 Z"
          fill="${pathFill}" stroke="#fff" stroke-width="2"/>
    <circle cx="14" cy="14" r="9" fill="#fff"/>
    <text x="14" y="14" text-anchor="middle" dominant-baseline="central"
          font-family="-apple-system,system-ui,sans-serif"
          font-size="${fontSize}" font-weight="700" fill="#222">${count}</text>
  </svg>`
  return L.divIcon({
    className: 'map-marker map-marker-cluster',
    html: svg,
    iconSize: [size, Math.round(size * 1.4)],
    iconAnchor: [size / 2, Math.round(size * 1.4)],
  })
}

const SINGLE_ICON_PICKUP   = createSingleIcon(COLOR_PICKUP)
const SINGLE_ICON_DELIVERY = createSingleIcon(COLOR_DELIVERY)
const SINGLE_ICON_NEUTRAL  = createSingleIcon(COLOR_NEUTRAL)

export type MarkerKind = 'pickup' | 'delivery' | 'neutral'

export interface MapPoint {
  lat: number
  lon: number
  kind: MarkerKind
  title?: string
  description?: string
  /** V12: явный цвет маркера (для раскраски по дню недели в логистике).
   *  Если задан — используется вместо цвета по kind. */
  color?: string
}

interface Props {
  points: MapPoint[]
  height?: number | string
  fallbackCenter?: [number, number]
  fallbackZoom?: number
}

const SPB_CENTER: [number, number] = [59.9342802, 30.3350986]

const singleIconFor = (kind: MarkerKind, color?: string): L.DivIcon => {
  if (color) return createSingleIcon(color) // V12: явный цвет (день недели в логистике)
  if (kind === 'pickup') return SINGLE_ICON_PICKUP
  if (kind === 'delivery') return SINGLE_ICON_DELIVERY
  return SINGLE_ICON_NEUTRAL
}

/** Управляющий компонент — подгоняет вьюпорт под все точки и убирает «прапор». */
function MapTuning({ points }: { points: MapPoint[] }) {
  const map = useMap()
  useEffect(() => {
    // Убираем "Leaflet" prefix с украинским флагом — оставляем только наши © OSM © CARTO.
    map.attributionControl.setPrefix(false)
  }, [map])
  useEffect(() => {
    if (points.length === 0) return
    if (points.length === 1) {
      map.setView([points[0].lat, points[0].lon], 14)
      return
    }
    const bounds = L.latLngBounds(points.map(p => [p.lat, p.lon] as [number, number]))
    map.fitBounds(bounds, { padding: [40, 40], maxZoom: 15 })
  }, [points, map])
  return null
}

/**
 * Группировка точек с одинаковыми координатами (с округлением до 5 знаков ≈ 1 м).
 * Возвращает массив групп, каждая — список точек в этой координате.
 */
interface PointGroup {
  lat: number
  lon: number
  points: MapPoint[]
  kinds: Set<MarkerKind>
}

const groupByLocation = (points: MapPoint[]): PointGroup[] => {
  const map = new Map<string, PointGroup>()
  for (const p of points) {
    // Округляем до 5 знаков — дома ближе 1 м объединяются.
    const key = `${p.lat.toFixed(5)}|${p.lon.toFixed(5)}`
    const existing = map.get(key)
    if (existing) {
      existing.points.push(p)
      existing.kinds.add(p.kind)
    } else {
      map.set(key, {
        lat: p.lat, lon: p.lon,
        points: [p], kinds: new Set([p.kind]),
      })
    }
  }
  return Array.from(map.values())
}

/**
 * Минималистичная карта с цветными маркерами.
 * Плитки — CartoDB Positron (бесплатно, без ключей).
 * Несколько заказов в одной точке группируются в один маркер с цифрой.
 * Если в группе разные типы (забор + доставка) — маркер двухцветный.
 */
export default function MapMarkers({
  points, height = 320,
  fallbackCenter = SPB_CENTER, fallbackZoom = 11,
}: Props) {
  const valid = points.filter(p => Number.isFinite(p.lat) && Number.isFinite(p.lon))
  const groups = groupByLocation(valid)
  const center: [number, number] = valid.length > 0
    ? [valid[0].lat, valid[0].lon]
    : fallbackCenter

  return (
    <div style={{ borderRadius: 8, overflow: 'hidden', border: '1px solid #e0e0e0' }}>
      <MapContainer
        center={center}
        zoom={fallbackZoom}
        style={{ height: typeof height === 'number' ? `${height}px` : height, width: '100%' }}
        scrollWheelZoom
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; <a href="https://carto.com/attributions">CARTO</a>'
          url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
          subdomains={['a', 'b', 'c', 'd']}
          maxZoom={20}
        />
        <MapTuning points={valid} />
        {groups.map((g, i) => {
          const isCluster = g.points.length > 1
          const icon = isCluster
            ? createClusterIcon(g.points.length, g.kinds)
            : singleIconFor(g.points[0].kind, g.points[0].color)
          // Клик по маркеру намеренно не обрабатывается — поведение одинаковое
          // для одиночек и кластеров. Информация показывается в подсказке.
          return (
            <Marker
              key={`${g.lat}-${g.lon}-${i}`}
              position={[g.lat, g.lon]}
              icon={icon}
            >
              <Tooltip direction="top" offset={[0, isCluster ? -44 : -36]} opacity={1} className="map-tooltip">
                {isCluster ? (
                  <>
                    <div style={{ fontWeight: 600, marginBottom: 4 }}>
                      {g.points.length} {g.points.length === 1 ? 'заказ' : 'заказов'} в этой точке
                    </div>
                    {g.points.map((p, idx) => (
                      <div key={idx} style={{ fontSize: '0.85em', marginTop: idx > 0 ? 2 : 0 }}>
                        <span style={{
                          display: 'inline-block', width: 8, height: 8, borderRadius: 4,
                          marginRight: 6,
                          background: p.kind === 'pickup' ? COLOR_PICKUP
                                     : p.kind === 'delivery' ? COLOR_DELIVERY
                                     : COLOR_NEUTRAL,
                        }} />
                        {p.title}{p.description ? ` · ${p.description}` : ''}
                      </div>
                    ))}
                  </>
                ) : (
                  (g.points[0].title || g.points[0].description) && (
                    <>
                      {g.points[0].title && <div style={{ fontWeight: 600, marginBottom: g.points[0].description ? 2 : 0 }}>{g.points[0].title}</div>}
                      {g.points[0].description && <div style={{ fontSize: '0.85em', color: '#555' }}>{g.points[0].description}</div>}
                    </>
                  )
                )}
              </Tooltip>
            </Marker>
          )
        })}
      </MapContainer>
    </div>
  )
}
