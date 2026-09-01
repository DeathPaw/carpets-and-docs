import { useEffect } from 'react'
import { MapContainer, TileLayer, Marker, Tooltip, useMap } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'

/**
 * Ключ MapTiler. Задаётся в frontend/.env как VITE_MAPTILER_KEY.
 *
 * CARTO, чьи тайлы стояли раньше, с 2025 отдаёт basemaps только по платному
 * тарифу и без ключа печатает поверх карты «API KEY REQUIRED». У MapTiler есть
 * постоянный бесплатный тариф и тот же светло-серый стиль, каким была карта.
 *
 * Пусто — работаем на тайлах OpenStreetMap France: они без ключа и без
 * водяных знаков, с русскими названиями, но стиль цветной, не серый.
 */
const MAPTILER_KEY: string | undefined = import.meta.env.VITE_MAPTILER_KEY

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
const createClusterIcon = (count: number, kinds: Set<MarkerKind>, dayColors: string[] = []): L.DivIcon => {
  // V19 (#7): если в кластере точки с РАЗНЫМИ цветами по дням недели — рисуем
  // полосатую заливку (каждому цвету — равная вертикальная полоса). По одной точке
  // на цвет видно, какие дни смешались. Без дней — fallback на старую логику kind.
  const uniqueColors = Array.from(new Set(dayColors.filter(Boolean)))
  let pathFill: string
  let gradientDef = ''
  if (uniqueColors.length >= 2) {
    const stops = uniqueColors.map((c, i) => {
      const start = (i / uniqueColors.length) * 100
      const end = ((i + 1) / uniqueColors.length) * 100
      return `<stop offset="${start}%" stop-color="${c}"/><stop offset="${end}%" stop-color="${c}"/>`
    }).join('')
    gradientDef = `<linearGradient id="dayGrad" x1="0" x2="1" y1="0" y2="0">${stops}</linearGradient>`
    pathFill = 'url(#dayGrad)'
  } else if (uniqueColors.length === 1) {
    pathFill = uniqueColors[0]
  } else {
    const hasPickup = kinds.has('pickup')
    const hasDelivery = kinds.has('delivery')
    if (hasPickup && hasDelivery) {
      gradientDef = `<linearGradient id="splitGrad" x1="0" x2="1" y1="0" y2="0"><stop offset="50%" stop-color="${COLOR_PICKUP}"/><stop offset="50%" stop-color="${COLOR_DELIVERY}"/></linearGradient>`
      pathFill = 'url(#splitGrad)'
    } else if (hasPickup) pathFill = COLOR_PICKUP
    else if (hasDelivery) pathFill = COLOR_DELIVERY
    else pathFill = COLOR_NEUTRAL
  }

  const size = count >= 10 ? 36 : 32
  const fontSize = count >= 10 ? 13 : 14
  const svg = `<svg width="${size}" height="${Math.round(size * 1.4)}" viewBox="0 0 28 40" xmlns="http://www.w3.org/2000/svg">
    <defs>${gradientDef}</defs>
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

/**
 * Иконка найденного поиском заказа: та же капля, но крупнее, в оранжевой
 * обводке и с пульсирующим ореолом. Оператор ищет один заказ среди полусотни
 * точек — без визуального акцента подсветка в списке слева не помогает понять,
 * куда этот заказ попал на карте.
 *
 * viewBox сдвинут в минус, чтобы ореол не обрезался; остриё капли по-прежнему
 * в (14, 40) пользовательских координат, отсюда iconAnchor [20, 46].
 */
const createHighlightIcon = (color: string, count = 0): L.DivIcon => {
  const inner = count > 1
    ? `<circle cx="14" cy="14" r="9" fill="#fff"/>
       <text x="14" y="14" text-anchor="middle" dominant-baseline="central"
             font-family="-apple-system,system-ui,sans-serif"
             font-size="${count >= 10 ? 13 : 14}" font-weight="700" fill="#222">${count}</text>`
    : `<circle cx="14" cy="14" r="5" fill="#fff"/>`
  return L.divIcon({
    className: 'map-marker map-marker-highlight',
    html: `<svg width="40" height="52" viewBox="-6 -6 40 52" xmlns="http://www.w3.org/2000/svg">
      <circle class="map-halo" cx="14" cy="14" r="17" fill="#f39c12"/>
      <path d="M14 0 C6 0 0 6 0 14 C0 24 14 40 14 40 S28 24 28 14 C28 6 22 0 14 0 Z"
            fill="${color}" stroke="#f39c12" stroke-width="3"/>
      ${inner}
    </svg>`,
    iconSize: [40, 52],
    iconAnchor: [20, 46],
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
  /** V19 (#7): структурированные поля для красивого тултипа. Если заданы — рисуем
   *  блок «дата / время / № / адрес / имя» в этом порядке, иначе fallback на title+description. */
  date?: string         // YYYY-MM-DD
  time?: string         // HH:MM-HH:MM
  orderNumber?: string  // «#00012»
  address?: string
  clientName?: string
  /** Заказ найден поиском — рисуем крупной оранжевой меткой поверх остальных. */
  highlighted?: boolean
}

interface Props {
  points: MapPoint[]
  height?: number | string
  fallbackCenter?: [number, number]
  fallbackZoom?: number
}

const SPB_CENTER: [number, number] = [59.9342802, 30.3350986]

/**
 * V19 (#7): красивая раскладка точки в тултипе — дата, время, № заказа, адрес, имя.
 * Falls back to title/description если структурные поля не заданы.
 */
function renderStructuredPoint(p: MapPoint) {
  const hasStructured = p.date || p.time || p.orderNumber || p.address || p.clientName
  if (!hasStructured) {
    return (
      <>
        {p.title && <div style={{ fontWeight: 600 }}>{p.title}</div>}
        {p.description && <div style={{ fontSize: 'var(--font-sm)', color: '#555' }}>{p.description}</div>}
      </>
    )
  }
  const kindLabel = p.kind === 'pickup' ? 'Забор' : p.kind === 'delivery' ? 'Доставка' : null
  return (
    <div style={{ fontSize: 'var(--font-sm)', lineHeight: 1.45 }}>
      {(p.date || p.time) && (
        <div style={{ fontWeight: 600, color: '#2c3e50' }}>
          {p.date ? new Date(p.date).toLocaleDateString('ru', { weekday: 'short', day: 'numeric', month: 'short' }) : ''}
          {p.date && p.time ? ' · ' : ''}
          {p.time || ''}
        </div>
      )}
      {p.orderNumber && (
        <div>
          {kindLabel && <span style={{ color: '#7f8c8d' }}>{kindLabel} · </span>}
          {p.orderNumber}
        </div>
      )}
      {p.address && <div style={{ color: '#34495e' }}>{p.address}</div>}
      {p.clientName && <div style={{ color: '#555' }}>{p.clientName}</div>}
    </div>
  )
}

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
    // Есть найденные поиском точки — показываем их, а не всё облако: искать
    // оранжевую метку глазами по карте всего города оператор не должен.
    const found = points.filter(p => p.highlighted)
    const shown = found.length > 0 ? found : points
    if (shown.length === 1) {
      map.setView([shown[0].lat, shown[0].lon], found.length > 0 ? 15 : 14)
      return
    }
    const bounds = L.latLngBounds(shown.map(p => [p.lat, p.lon] as [number, number]))
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

/** В группе есть найденный заказ — вся метка становится подсвеченной. */
const groupHighlighted = (g: PointGroup) => g.points.some(p => p.highlighted)

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
        {/* Подложка. CARTO с 2025 отдаёт свои basemaps только по API-ключу и
            без него печатает поверх тайлов «API KEY REQUIRED» — раньше ключ был
            не нужен, поэтому его у нас и нет.

            Ключ берём из VITE_CARTO_API_KEY. Есть ключ — рисуем прежний светло-серый
            CARTO. Нет — светло-серая подложка Esri плюс слой дорог с названиями:
            она без ключа и без водяных знаков. Серверы OSM тут не годятся —
            их политика запрещает использование сторонними приложениями. */}
        {MAPTILER_KEY ? (
          <TileLayer
            attribution='&copy; <a href="https://www.maptiler.com/copyright/">MapTiler</a> &copy; <a href="https://www.openstreetmap.org/copyright">OSM</a>'
            url={`https://api.maptiler.com/maps/dataviz-light/{z}/{x}/{y}.png?key=${MAPTILER_KEY}`}
            maxZoom={20}
          />
        ) : (
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a>, tiles by <a href="https://openstreetmap.fr/">OSM France</a>'
            url="https://{s}.tile.openstreetmap.fr/hot/{z}/{x}/{y}.png"
            subdomains={['a', 'b', 'c']}
            maxZoom={20}
          />
        )}
        <MapTuning points={valid} />
        {groups.map((g, i) => {
          const isCluster = g.points.length > 1
          const hl = groupHighlighted(g)
          const icon = hl
            ? createHighlightIcon(
                g.points.find(p => p.highlighted)?.color || COLOR_NEUTRAL,
                isCluster ? g.points.length : 0)
            : isCluster
              ? createClusterIcon(g.points.length, g.kinds, g.points.map(p => p.color || ''))
              : singleIconFor(g.points[0].kind, g.points[0].color)
          // Клик по маркеру намеренно не обрабатывается — поведение одинаковое
          // для одиночек и кластеров. Информация показывается в подсказке.
          return (
            <Marker
              key={`${g.lat}-${g.lon}-${i}`}
              position={[g.lat, g.lon]}
              icon={icon}
              zIndexOffset={hl ? 1000 : 0}
            >
              <Tooltip direction="top" offset={[0, isCluster ? -44 : -36]} opacity={1} className="map-tooltip">
                {isCluster ? (
                  <>
                    <div style={{ fontWeight: 600, marginBottom: 6 }}>
                      {g.points.length} {g.points.length === 1 ? 'заказ' : 'заказов'} в этой точке
                    </div>
                    {g.points.map((p, idx) => (
                      <div key={idx} style={{ fontSize: 'var(--font-sm)', marginTop: idx > 0 ? 6 : 0, paddingTop: idx > 0 ? 6 : 0, borderTop: idx > 0 ? '1px solid #ecf0f1' : undefined }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span style={{
                            display: 'inline-block', width: 10, height: 10, borderRadius: 2,
                            background: p.color || (p.kind === 'pickup' ? COLOR_PICKUP : p.kind === 'delivery' ? COLOR_DELIVERY : COLOR_NEUTRAL),
                          }} />
                          {renderStructuredPoint(p)}
                        </div>
                      </div>
                    ))}
                  </>
                ) : (
                  renderStructuredPoint(g.points[0])
                )}
              </Tooltip>
            </Marker>
          )
        })}
      </MapContainer>
    </div>
  )
}
