import { useEffect, useState, useMemo } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { getOrders, updateActualDates, setOrderDriver } from '../api/orders'
import { getDrivers } from '../api/references'
import MapMarkers, { type MapPoint } from '../components/MapMarkers'
import MultiSelectFilter from '../components/MultiSelectFilter'
import { hashColor } from '../components/Tiles'
import { formatOrderNumber } from '../utils/format'
import { useAuth } from '../auth/AuthContext'
import type { Order, Employee } from '../types'

type CardType = 'pickup' | 'delivery'
type Horizon = 4 | 8 | 12
type NoDateFilter = 'all' | 'leads' | 'ready' | 'old'

interface OrderCard {
  order: Order
  type: CardType
  date: string | null  // actual date
  timeSlot: string | null
  district: string | null
  address: string | null
  lat: number | null
  lon: number | null
}

const DAY_NAMES = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб']
const MONTH_NAMES_SHORT = ['янв', 'фев', 'мар', 'апр', 'май', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек']

interface SlotDef {
  value: string
  label: string
  short: string  // короткая для drop-зон
  color: string  // цветовая полоска слева на карточке
}
const SLOT_DEFS: SlotDef[] = [
  { value: '08:00-12:00', label: '8:00–12:00', short: 'Утро 8–12',  color: '#74b9ff' },
  { value: '12:00-18:00', label: '12:00–18:00', short: 'День 12–18', color: '#fdcb6e' },
  { value: '18:00-22:00', label: '18:00–22:00', short: 'Вечер 18–22', color: '#a29bfe' },
]

const slotColor = (slot: string | null): string => {
  const def = SLOT_DEFS.find(s => s.value === slot)
  return def ? def.color : '#bdc3c7'
}

function getMonday(dateStr: string): string {
  const d = new Date(dateStr)
  const day = d.getDay()
  const diff = d.getDate() - day + (day === 0 ? -6 : 1)
  d.setDate(diff)
  return d.toISOString().slice(0, 10)
}

function getWeekDays(mondayStr: string): string[] {
  const days: string[] = []
  const d = new Date(mondayStr)
  for (let i = 0; i < 7; i++) {
    days.push(d.toISOString().slice(0, 10))
    d.setDate(d.getDate() + 1)
  }
  return days
}

function formatDayHeader(dateStr: string): string {
  const d = new Date(dateStr)
  return `${DAY_NAMES[d.getDay()]} ${String(d.getDate()).padStart(2,'0')}.${String(d.getMonth()+1).padStart(2,'0')}`
}

// V12: цвета по дням недели — для подсветки маркеров на карте и полоски над колонкой дня.
// Индексы: 0=Вс, 1=Пн, 2=Вт, 3=Ср, 4=Чт, 5=Пт, 6=Сб.
const DAY_COLORS = ['#34495e', '#e74c3c', '#e67e22', '#f1c40f', '#27ae60', '#3498db', '#9b59b6']
function dayColor(dateStr: string): string {
  const d = new Date(dateStr)
  return DAY_COLORS[d.getDay()]
}

function formatShortDate(dateStr: string): string {
  const d = new Date(dateStr)
  return `${d.getDate()} ${MONTH_NAMES_SHORT[d.getMonth()]}`
}

// formatOrderNumber — общая, см. utils/format.ts

/** Сколько дней назад создан заказ. Для подсветки старых лидов в «Без даты». */
function daysSince(createdAt: string): number {
  const created = new Date(createdAt).getTime()
  const now = new Date().getTime()
  return Math.floor((now - created) / (1000 * 60 * 60 * 24))
}

export default function LogisticsPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { isReadonly } = useAuth()
  const [weekStart, setWeekStart] = useState(() => getMonday(new Date().toISOString().slice(0,10)))
  // Мультивыборы: пустой массив = «все».
  const [typeFilters, setTypeFilters] = useState<CardType[]>([])
  // Фильтр районов — массив (Спринт D, фидбэк 11 мая: «выбрать Центральный и
  // Красносельский, потом Красносельский отменить»). Клик по району — toggle:
  // если уже в списке → убрать; иначе → добавить. Остальные районы при этом
  // НЕ скрываем (раньше скрывалось при single-select).
  const [districtFilters, setDistrictFilters] = useState<string[]>(() => {
    const url = searchParams.get('district')
    return url ? [url] : []
  })
  // Слоты: спецзначение 'none' для «без слота».
  const [timeSlotFilters, setTimeSlotFilters] = useState<string[]>([])
  const [noDateFilter, setNoDateFilter] = useState<NoDateFilter>('all')
  // По умолчанию список «Без даты» свёрнут до 5 карточек — иначе он занимает весь экран
  // и список дней по горизонтали уходит вниз. Кнопка «Показать все» раскрывает.
  const [noDateExpanded, setNoDateExpanded] = useState(false)
  const NO_DATE_PREVIEW = 5
  const [horizon, setHorizon] = useState<Horizon>(4)
  // Карта в sidebar — по умолчанию свёрнута, разворачивается по клику.
  const [mapExpanded, setMapExpanded] = useState(false)

  useEffect(() => {
    const fromUrl = searchParams.get('district')
    if (fromUrl !== null) setDistrictFilters(fromUrl ? [fromUrl] : [])
  }, [searchParams])

  /** Toggle района в фильтре: добавляет если нет, убирает если есть. */
  const toggleDistrict = (d: string) => {
    setDistrictFilters(prev =>
      prev.includes(d) ? prev.filter(x => x !== d) : [...prev, d]
    )
  }

  const [allOrders, setAllOrders] = useState<Order[]>([])
  const [loading, setLoading] = useState(false)
  const [dragData, setDragData] = useState<{orderId: number, type: CardType} | null>(null)
  const [dragOverDay, setDragOverDay] = useState<string | null>(null)
  const isDragging = dragData !== null

  // Список водителей для модалки назначения. Фильтр на бэке (/api/employees/drivers):
  // V10 — водитель = сотрудник с ролью, привязанной к item_type, на который ссылается
  // хотя бы один auto-add SKU (на практике — «Логист» с «Доставка»/«Приём»). Универсалы
  // (без роли) НЕ показываются — фидбэк: «должны быть только водители».
  // На фронте остаётся только убрать неактивных.
  const [employees, setEmployees] = useState<Employee[]>([])
  useEffect(() => {
    void getDrivers().then(list => setEmployees(list.filter(e => e.active)))
  }, [])
  // Открытый popup выбора водителя для заказа. null — закрыт.
  const [driverPickerFor, setDriverPickerFor] = useState<{ orderId: number; current: number | null } | null>(null)
  // Сайдбар «Районы» — компактный по умолчанию (узкая колонка с цифрами и баром нагрузки),
  // развёрнутый — широкая таблица с заборами/доставками/суммой. Состояние помним.
  const [asideExpanded, setAsideExpanded] = useState<boolean>(
    () => localStorage.getItem('logistics_aside_expanded') === '1'
  )
  useEffect(() => {
    localStorage.setItem('logistics_aside_expanded', asideExpanded ? '1' : '0')
  }, [asideExpanded])

  const weekDays = useMemo(() => getWeekDays(weekStart), [weekStart])

  useEffect(() => {
    const load = async () => {
      setLoading(true)
      try {
        const results = await Promise.all([
          getOrders('LEAD', 0, 200),
          getOrders('CREATED', 0, 200),
          getOrders('FOR_PICKUP', 0, 200),
          getOrders('IN_PROGRESS', 0, 200),
          getOrders('PARTIALLY_DONE', 0, 200),
          getOrders('DONE', 0, 200),
        ])
        const allFetched = results.flatMap(r => Array.isArray(r) ? r as unknown as Order[] : r.content)
        setAllOrders(allFetched)
      } catch { /* ignore */ }
      finally { setLoading(false) }
    }
    void load()
  }, [])

  // Build cards from orders
  const allCards = useMemo((): OrderCard[] => {
    const cards: OrderCard[] = []
    const pickupStatuses = new Set(['LEAD', 'CREATED', 'FOR_PICKUP'])
    const deliveryStatuses = new Set(['DONE'])

    const showPickup = typeFilters.length === 0 || typeFilters.includes('pickup')
    const showDelivery = typeFilters.length === 0 || typeFilters.includes('delivery')
    allOrders.forEach(o => {
      if (pickupStatuses.has(o.status) || ((o.actual_pickup_date || o.pickup_date) && !deliveryStatuses.has(o.status))) {
        if (showPickup) {
          cards.push({
            order: o,
            type: 'pickup',
            date: o.actual_pickup_date,
            timeSlot: o.actual_pickup_time_slot,
            district: o.pickup_district,
            address: o.pickup_address || o.client_address,
            lat: o.pickup_lat != null ? Number(o.pickup_lat) : null,
            lon: o.pickup_lon != null ? Number(o.pickup_lon) : null,
          })
        }
      }
      if (deliveryStatuses.has(o.status)) {
        if (showDelivery) {
          cards.push({
            order: o,
            type: 'delivery',
            date: o.actual_delivery_date,
            timeSlot: o.actual_delivery_time_slot,
            district: o.delivery_district,
            address: o.delivery_address || o.client_address,
            lat: o.delivery_lat != null ? Number(o.delivery_lat) : null,
            lon: o.delivery_lon != null ? Number(o.delivery_lon) : null,
          })
        }
      }
    })
    return cards
  }, [allOrders, typeFilters])

  // Apply filters (для дневных секций и карты).
  // timeSlotFilters: пустой = все, может содержать 'none' для «без слота» или конкретные значения.
  const filteredCards = useMemo(() => {
    return allCards.filter(c => {
      if (districtFilters.length > 0 && (!c.district || !districtFilters.includes(c.district))) return false
      if (timeSlotFilters.length > 0) {
        const noneSelected = timeSlotFilters.includes('none')
        if (!c.timeSlot) {
          if (!noneSelected) return false
        } else {
          if (!timeSlotFilters.includes(c.timeSlot)) return false
        }
      }
      return true
    })
  }, [allCards, districtFilters, timeSlotFilters])

  // Сортировка карточек по началу временного слота (без слота — в конец).
  const slotStartMinutes = (slot: string | null): number => {
    if (!slot) return 24 * 60 + 1
    const m = slot.match(/(\d{1,2}):(\d{2})/)
    if (!m) return 24 * 60 + 1
    return Number(m[1]) * 60 + Number(m[2])
  }
  const sortCards = (a: OrderCard, b: OrderCard): number => {
    const ds = slotStartMinutes(a.timeSlot) - slotStartMinutes(b.timeSlot)
    if (ds !== 0) return ds
    if (a.type !== b.type) return a.type === 'pickup' ? -1 : 1
    return a.order.id - b.order.id
  }

  // Group by day (отсортировано). Для no-date — отдельная фильтрация по noDateFilter ниже.
  const cardsByDay = useMemo(() => {
    const map = new Map<string, OrderCard[]>()
    map.set('no-date', [])
    weekDays.forEach(d => map.set(d, []))

    filteredCards.forEach(c => {
      if (!c.date) {
        map.get('no-date')!.push(c)
      } else if (map.has(c.date)) {
        map.get(c.date)!.push(c)
      }
    })
    map.forEach(cards => cards.sort(sortCards))
    return map
  }, [filteredCards, weekDays])

  // Применяем noDateFilter поверх карточек без даты.
  const noDateCards = useMemo(() => {
    const cards = cardsByDay.get('no-date') || []
    return cards.filter(c => {
      if (noDateFilter === 'leads') return c.type === 'pickup' && (c.order.status === 'LEAD' || c.order.status === 'CREATED')
      if (noDateFilter === 'ready') return c.type === 'delivery'
      if (noDateFilter === 'old')  return daysSince(c.order.created_at) >= 7
      return true
    })
  }, [cardsByDay, noDateFilter])

  // Список районов для фильтра больше не нужен сверху — фильтр применяется кликом по строке в боковой сводке.

  // District stats — статистика по районам в боковой таблице.
  //
  // Считаем из allCards БЕЗ применения районного фильтра, но С остальными
  // (тип, слот). Иначе при клике на «Центральный» в таблице остаётся ТОЛЬКО
  // Центральный — оператор не видит, что есть в других районах и не может
  // включить второй (фидбэк 11 мая: «не должен скрывать остальные варианты»).
  //
  // Остальные фильтры (тип/слот) применяем — оператор фильтрует «только заборы»
  // и видит соответствующую статистику.
  const districtStats = useMemo(() => {
    const visibleCards = allCards.filter(c => {
      // Считаем только карточки выбранной недели с датой.
      if (!c.date || !weekDays.includes(c.date)) return false
      if (typeFilters.length > 0 && !typeFilters.includes(c.type)) return false
      if (timeSlotFilters.length > 0) {
        const noneSelected = timeSlotFilters.includes('none')
        if (!c.timeSlot) {
          if (!noneSelected) return false
        } else if (!timeSlotFilters.includes(c.timeSlot)) {
          return false
        }
      }
      return true
    })
    const map = new Map<string, {district: string, pickups: number, deliveries: number, sum: number}>()
    visibleCards.forEach(c => {
      const d = c.district || '(без района)'
      if (!map.has(d)) map.set(d, {district: d, pickups: 0, deliveries: 0, sum: 0})
      const s = map.get(d)!
      if (c.type === 'pickup') s.pickups++; else s.deliveries++
      s.sum += Number(c.order.total_amount)
    })
    return Array.from(map.values()).sort((a,b) => (b.pickups+b.deliveries) - (a.pickups+a.deliveries))
  }, [allCards, weekDays, typeFilters, timeSlotFilters])

  // Сводка по неделе: цифры заборов/доставок и самый загруженный день.
  const weekSummary = useMemo(() => {
    let pickups = 0, deliveries = 0
    const perDay = new Map<string, number>()
    weekDays.forEach(d => perDay.set(d, 0))
    weekDays.forEach(d => {
      const cards = cardsByDay.get(d) || []
      cards.forEach(c => {
        if (c.type === 'pickup') pickups++; else deliveries++
        perDay.set(d, (perDay.get(d) || 0) + 1)
      })
    })
    let busiest: { day: string, count: number } | null = null
    perDay.forEach((count, day) => {
      if (count > 0 && (!busiest || count > busiest.count)) busiest = { day, count }
    })
    return { pickups, deliveries, busiest }
  }, [cardsByDay, weekDays])

  // Полоса-обзор недель: формируем массив недель.
  // Текущая (от today) +1 будущая, остальные — прошлые.
  const overviewWeeks = useMemo(() => {
    const todayStr = new Date().toISOString().slice(0, 10)
    const currentMonday = getMonday(todayStr)
    const result: { mondayStr: string, pickups: number, deliveries: number, sum: number }[] = []
    // 1 будущая + (horizon - 1) прошлых, считая текущую
    for (let i = -(horizon - 2); i <= 1; i++) {
      const d = new Date(currentMonday)
      d.setDate(d.getDate() + i * 7)
      const monday = d.toISOString().slice(0, 10)
      result.push({ mondayStr: monday, pickups: 0, deliveries: 0, sum: 0 })
    }
    // агрегируем allCards (без фильтров — в обзоре нужна общая картина)
    const aggMap = new Map<string, { pickups: number, deliveries: number, sum: number }>()
    allCards.forEach(c => {
      if (!c.date) return
      const monday = getMonday(c.date)
      if (!aggMap.has(monday)) aggMap.set(monday, { pickups: 0, deliveries: 0, sum: 0 })
      const w = aggMap.get(monday)!
      if (c.type === 'pickup') w.pickups++; else w.deliveries++
      w.sum += Number(c.order.total_amount || 0)
    })
    return result.map(w => ({ ...w, ...(aggMap.get(w.mondayStr) || {}) }))
  }, [allCards, horizon])

  // Изменение слота на карточке вручную больше не нужно — слот меняется drag-n-drop'ом
  // в нужную секцию слота внутри дня.

  // Drag handlers
  const handleDragStart = (orderId: number, type: CardType) => {
    setDragData({orderId, type})
  }
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
  }

  /**
   * Drop в день. Если slot задан — также обновляем временной слот (drag-n-drop по слоту).
   * Если slot === undefined — оставляем существующий слот, меняем только дату.
   */
  /**
   * Перенос карточки в новый слот.
   * Особый случай: {@code targetDate === 'no-date'} — снимаем дату и слот
   * (заказ возвращается в зону «нераспределённые»).
   */
  const handleDrop = async (targetDate: string, slot?: string) => {
    if (!dragData) return
    const {orderId, type} = dragData
    setDragData(null)
    setDragOverDay(null)
    const isUnassign = targetDate === 'no-date'
    // При снятии — отправляем null и в дату, и в слот; при назначении — конкретные значения.
    const dateValue: string | null = isUnassign ? null : targetDate
    const slotValue: string | null = isUnassign ? null : (slot ?? null)
    try {
      if (type === 'pickup') {
        const payload: Record<string, string | null> = { actual_pickup_date: dateValue }
        if (slot !== undefined || isUnassign) payload.actual_pickup_time_slot = slotValue
        await updateActualDates(orderId, payload)
      } else {
        const payload: Record<string, string | null> = { actual_delivery_date: dateValue }
        if (slot !== undefined || isUnassign) payload.actual_delivery_time_slot = slotValue
        await updateActualDates(orderId, payload)
      }
      setAllOrders(prev => prev.map(o => {
        if (o.id !== orderId) return o
        if (type === 'pickup') {
          return {
            ...o,
            actual_pickup_date: dateValue,
            ...((slot !== undefined || isUnassign) ? { actual_pickup_time_slot: slotValue } : {}),
          }
        }
        return {
          ...o,
          actual_delivery_date: dateValue,
          ...((slot !== undefined || isUnassign) ? { actual_delivery_time_slot: slotValue } : {}),
        }
      }))
    } catch { /* ignore */ }
  }

  const today = new Date().toISOString().slice(0,10)
  const todayMonday = getMonday(today)

  const renderCard = (card: OrderCard) => {
    const isPickup = card.type === 'pickup'
    const ageDays = !card.date && card.order.status !== 'DONE' ? daysSince(card.order.created_at) : 0
    // Цвет полоски слева:
    // - двойной: тип (pickup/delivery) сверху, слот снизу. Делаем градиент.
    const typeColor = isPickup ? '#3498db' : '#27ae60'
    const sColor = slotColor(card.timeSlot)
    const viewer = isReadonly
    return (
      <div
        key={`${card.order.id}-${card.type}`}
        // В режиме просмотра drag не нужен — карточки только показываем.
        draggable={!viewer}
        onDragStart={() => !viewer && handleDragStart(card.order.id, card.type)}
        onDragEnd={() => setDragData(null)}
        onClick={() => navigate(`/orders/${card.order.id}`)}
        title={`${isPickup ? 'Забор' : 'Доставка'} · ${formatOrderNumber(card.order.id, card.order.created_at)} · ${card.order.client_name}${card.address ? ' · ' + card.address : ''}`}
        style={{
          padding: '6px 8px',
          marginBottom: 4,
          borderRadius: 5,
          // полоска слева — тип (забор/доставка); полоска слота — внешний боксшэдоу.
          borderLeft: `3px solid ${typeColor}`,
          boxShadow: 'inset 3px 0 0 0 ' + sColor,
          paddingLeft: 12,
          background: '#fff',
          cursor: 'grab',
          fontSize: '0.78em',
          minWidth: 0,
          // тонкая обычная тень
          filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.06))',
          overflow: 'hidden',
        }}
      >
        <div style={{
          fontWeight: 700, color: card.district ? '#2c3e50' : '#ccc',
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
        }}>
          {card.district || '—'}
        </div>
        <div style={{
          color: '#555', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', marginTop: 1,
        }}>
          {card.order.client_name}
        </div>
        {card.address && (
          <div style={{
            color: '#888', fontSize: '0.92em', marginTop: 1,
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
          }}>
            {card.address}
          </div>
        )}
        {ageDays >= 7 && (
          <div style={{
            display: 'inline-block', marginTop: 3, padding: '0 5px', borderRadius: 3,
            fontSize: '0.92em', fontWeight: 600,
            background: ageDays >= 14 ? '#fdedec' : '#fef5e7',
            color:      ageDays >= 14 ? '#c0392b' : '#d35400',
          }}>
            висит {ageDays}д
          </div>
        )}
        {/* Чип «Водитель» — клик открывает модалку выбора. В viewer-mode
            рендерим как читаемый span (без клика). */}
        {viewer ? (
          <div style={{
            marginTop: 4, padding: '1px 6px',
            background: card.order.assigned_driver_id ? '#eafaf1' : '#f4f6f7',
            color:      card.order.assigned_driver_id ? '#196f3d' : '#7f8c8d',
            borderRadius: 3, fontSize: '0.92em',
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
          }}>
            👤 {card.order.assigned_driver_name || 'не назначен'}
          </div>
        ) : (
          <button
            type="button"
            onClick={e => {
              e.stopPropagation()
              setDriverPickerFor({ orderId: card.order.id, current: card.order.assigned_driver_id })
            }}
            onMouseDown={e => e.stopPropagation()}
            style={{
              display: 'block', marginTop: 4, padding: '1px 6px',
              background: card.order.assigned_driver_id ? '#eafaf1' : '#fdf2e9',
              color:      card.order.assigned_driver_id ? '#196f3d' : '#a04000',
              border: 'none', borderRadius: 3,
              fontSize: '0.92em', fontWeight: 500,
              cursor: 'pointer', width: '100%', textAlign: 'left',
              whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
            }}
            title="Назначить водителя"
          >
            👤 {card.order.assigned_driver_name || 'не назначен'}
          </button>
        )}
      </div>
    )
  }

  /**
   * Сохранить выбранного водителя для заказа из модалки picker'a.
   * Обновляем allOrders inline, чтобы UI отреагировал без перезагрузки.
   */
  const saveDriver = async (employeeId: number | null) => {
    if (!driverPickerFor) return
    const { orderId } = driverPickerFor
    try {
      const res = await setOrderDriver(orderId, employeeId)
      setAllOrders(prev => prev.map(o => o.id === orderId
        ? { ...o, assigned_driver_id: res.assigned_driver_id, assigned_driver_name: res.driver_name }
        : o
      ))
    } catch { /* ignore */ }
    setDriverPickerFor(null)
  }

  /** Drop-overlay со слотами — появляется только при перетаскивании над днём. */
  // Drag-over конкретного слота — для hover-тени.
  const [dragOverSlot, setDragOverSlot] = useState<string | null>(null)

  /** Группировка карточек дня по слотам. Ключ — value слота или 'none' для пустого. */
  const groupCardsBySlot = (cards: OrderCard[]): Record<string, OrderCard[]> => {
    const map: Record<string, OrderCard[]> = { '08:00-12:00': [], '12:00-18:00': [], '18:00-22:00': [], 'none': [] }
    for (const c of cards) {
      const key = c.timeSlot || 'none'
      if (map[key]) map[key].push(c)
      else map['none'].push(c)
    }
    return map
  }

  /** Отрисовка одного слота внутри дня — drop-зона + список карточек.
      hover-эффект: при drag-over зоны слота — подсветка и пунктирная синяя рамка. */
  const renderSlotZone = (dateStr: string, slot: { value: string, label: string, color: string }, cards: OrderCard[]) => {
    const slotKey = `${dateStr}|${slot.value}`
    const isHover = dragOverSlot === slotKey && isDragging
    return (
      <div
        key={slot.value}
        onDragOver={e => { e.preventDefault(); e.dataTransfer.dropEffect = 'move' }}
        onDragEnter={e => { e.stopPropagation(); setDragOverSlot(slotKey) }}
        onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragOverSlot(null) }}
        onDrop={e => {
          e.stopPropagation()
          setDragOverSlot(null)
          setDragOverDay(null)
          void handleDrop(dateStr, slot.value)
        }}
        style={{
          padding: '4px 6px',
          borderRadius: 5,
          background: isHover ? '#ebf5fb' : '#fff',
          border: isHover ? '2px dashed #3498db' : '1px solid #ecf0f1',
          // тонкая цветная полоска слева — индикатор слота
          borderLeft: `3px solid ${slot.color}`,
          marginBottom: 4,
          transition: 'background 0.12s ease, box-shadow 0.12s ease',
          minHeight: 26,
          minWidth: 0,
        }}
      >
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          fontSize: '0.7em', color: '#95a5a6', marginBottom: cards.length > 0 ? 3 : 0,
          whiteSpace: 'nowrap',
        }}>
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{slot.label}</span>
          {cards.length > 0 && <strong style={{ marginLeft: 4 }}>{cards.length}</strong>}
        </div>
        {cards.map(renderCard)}
      </div>
    )
  }

  const renderDaySection = (dateStr: string, label: string, cards: OrderCard[], opts?: { hideEmpty?: boolean, noDateMode?: boolean }) => {
    const isToday = dateStr === today
    const isDragOverDay = dragOverDay === dateStr
    const grouped = groupCardsBySlot(cards)

    // «Без даты» — единая drop-зона без разбивки на слоты (в нём нет смысла).
    // Drop сюда сбрасывает actual_pickup/delivery_date в null, возвращая заказ
    // в нераспределённые. Это симметрично к drop в конкретный день.
    if (opts?.noDateMode || dateStr === 'no-date') {
      return (
        <div
          key={dateStr}
          onDragOver={handleDragOver}
          onDragEnter={() => setDragOverDay(dateStr)}
          onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragOverDay(null) }}
          onDrop={() => { void handleDrop('no-date'); setDragOverDay(null) }}
          style={{
            padding: '10px 14px', marginBottom: 8, borderRadius: 8,
            background: isDragOverDay ? '#fef5e7' : '#fafafa',
            border: isDragOverDay ? '2px dashed #e67e22' : '1px solid #e6e9ec',
            minHeight: 50,
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
            <strong style={{ fontSize: '1em' }}>{label}</strong>
            <span style={{ fontSize: '0.85em', color: '#888' }}>
              {cards.length} {cards.length === 1 ? 'заказ' : 'заказов'}
            </span>
          </div>
          {cards.length === 0 ? (
            opts?.hideEmpty ? null : (
              <div style={{
                color: '#999', fontStyle: 'italic', fontSize: '0.9em',
                padding: '8px 4px', textAlign: 'center',
              }}>
                {/* В блоке «Без даты» пустота — это нормально (все распределили).
                    Даём подсказку, что сюда можно вернуть карточку, если оператор передумал. */}
                ↓ Перетащите карточку сюда, чтобы снять с даты
              </div>
            )
          ) : (
            <>
              {/* По умолчанию рендерим только первые NO_DATE_PREVIEW карточек.
                  Это критично, потому что «Без даты» накапливается и при 30+ заказах
                  без даты весь список дней уходил под фолд. */}
              {(noDateExpanded ? cards : cards.slice(0, NO_DATE_PREVIEW)).map(renderCard)}
              {cards.length > NO_DATE_PREVIEW && (
                <button
                  type="button"
                  onClick={() => setNoDateExpanded(v => !v)}
                  style={{
                    width: '100%', marginTop: 6, padding: '6px 8px',
                    background: '#fff', border: '1px dashed #bdc3c7', borderRadius: 6,
                    color: '#34495e', cursor: 'pointer', fontSize: '0.9em',
                  }}
                >
                  {noDateExpanded
                    ? `Свернуть (показано ${cards.length})`
                    : `Показать ещё ${cards.length - NO_DATE_PREVIEW}…`}
                </button>
              )}
            </>
          )}
        </div>
      )
    }

    const dColor = dayColor(dateStr)
    return (
      <div
        key={dateStr}
        onDragOver={handleDragOver}
        onDragEnter={() => setDragOverDay(dateStr)}
        onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) { setDragOverDay(null); setDragOverSlot(null) } }}
        style={{
          padding: '8px 8px',
          borderRadius: 8,
          background: isToday ? '#fffde7' : '#fafafa',
          border: isToday ? '1px solid #f9a825' : '1px solid #e6e9ec',
          minHeight: 50,
          // на горизонтальной сетке день уже не имеет marginBottom
          minWidth: 0,
          // V12: верхний бордер цвета дня недели — оператор сразу видит, какому дню
          // соответствуют точки этого цвета на карте.
          borderTop: `4px solid ${dColor}`,
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
          <strong style={{ fontSize: '0.9em', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <span style={{
              display: 'inline-block', width: 10, height: 10, borderRadius: 2,
              background: dColor, flexShrink: 0,
            }} title="Цвет дня на карте" />
            {label}
            {isToday && <span style={{ marginLeft: 4, fontSize: '0.75em', color: '#f9a825' }}>·</span>}
          </strong>
          <span style={{ fontSize: '0.78em', color: '#888' }}>
            {cards.length}
          </span>
        </div>
        {/* Слоты постоянно видны, вертикально сверху вниз. */}
        {SLOT_DEFS.map(s =>
          renderSlotZone(dateStr, { value: s.value, label: s.label, color: s.color }, grouped[s.value] || [])
        )}
        {/* «Без слота» — показываем только если в нём что-то есть или идёт перетаскивание.
            Иначе зону скрываем чтобы не зашумлять день. Drop в неё снимет слот. */}
        {(grouped['none'].length > 0 || isDragging) && (
          renderSlotZone(dateStr, { value: '', label: 'Без слота', color: '#bdc3c7' }, grouped['none'] || [])
        )}
      </div>
    )
  }

  // Карта недели
  const visibleMapCards = filteredCards.filter(c => c.date && weekDays.includes(c.date))
  const mapPoints: MapPoint[] = visibleMapCards
    .filter(c => c.lat != null && c.lon != null)
    .map(c => ({
      lat: c.lat as number,
      lon: c.lon as number,
      kind: c.type,
      // V12: цвет маркера = цвет дня недели. На карте сразу видно, где «вторничные» точки.
      color: c.date ? dayColor(c.date) : undefined,
      title: `${c.type === 'pickup' ? 'Забор' : 'Доставка'} #${String(c.order.id).padStart(5, '0')}`,
      description: `${c.order.client_name}${c.address ? ' · ' + c.address : ''}${c.timeSlot ? ' · ' + c.timeSlot : ''}`,
    }))

  return (
    <div>
      <div className="page-header">
        <h1>Логистика</h1>
      </div>

      {/* Полоса-обзор недель: всегда занимает всю ширину.
          4/8 — одна строка с равномерным распределением.
          12 — сетка 4×3 (как «месяц» из 4 недель в строке × 3 строки). */}
      <div style={{
        marginBottom: 16, padding: '10px 12px', borderRadius: 8, background: '#fff',
        border: '1px solid #e6e9ec',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
          <span style={{ fontSize: '0.8em', color: '#7f8c8d', textTransform: 'uppercase', letterSpacing: 0.6 }}>
            Обзор
          </span>
          <div style={{ display: 'inline-flex', border: '1px solid #ddd', borderRadius: 4, overflow: 'hidden', marginLeft: 'auto' }}>
            {([4, 8, 12] as Horizon[]).map(h => (
              <button
                key={h}
                onClick={() => setHorizon(h)}
                style={{
                  padding: '4px 12px', border: 'none', cursor: 'pointer', fontSize: '0.85em',
                  background: horizon === h ? '#3498db' : '#fff',
                  color: horizon === h ? '#fff' : '#333',
                }}
              >{h} нед.</button>
            ))}
          </div>
        </div>
        <div style={{
          display: 'grid',
          gridTemplateColumns: horizon === 12 ? 'repeat(4, 1fr)' : `repeat(${horizon}, 1fr)`,
          gap: 6,
        }}>
          {overviewWeeks.map(w => {
            const isCurrent = w.mondayStr === weekStart
            const isThisWeek = w.mondayStr === todayMonday
            const total = w.pickups + w.deliveries
            const sundayDate = (() => {
              const d = new Date(w.mondayStr)
              d.setDate(d.getDate() + 6)
              return d.toISOString().slice(0, 10)
            })()
            // Для 12-недельного режима пилюли мельче — оптимизируем подписи.
            const compact = horizon === 12
            return (
              <button
                key={w.mondayStr}
                onClick={() => setWeekStart(w.mondayStr)}
                style={{
                  padding: compact ? '5px 8px' : '6px 10px',
                  borderRadius: 6, cursor: 'pointer',
                  // Жёлтая полоска слева — индикатор текущей недели (всегда видна, даже если выбрана другая).
                  borderTop:    `1px solid ${isCurrent ? '#3498db' : '#e6e9ec'}`,
                  borderRight:  `1px solid ${isCurrent ? '#3498db' : '#e6e9ec'}`,
                  borderBottom: `1px solid ${isCurrent ? '#3498db' : '#e6e9ec'}`,
                  borderLeft:   `4px solid ${isThisWeek ? '#f9a825' : (isCurrent ? '#3498db' : '#e6e9ec')}`,
                  background: isCurrent ? '#ebf5fb' : '#fafafa',
                  textAlign: 'left',
                  position: 'relative',
                  overflow: 'hidden',
                  // Доп. подсветка для активной недели — кольцом-тенью внутри.
                  boxShadow: isCurrent ? 'inset 0 0 0 1px #3498db' : 'none',
                }}
                title={`${w.mondayStr} — ${sundayDate}${isThisWeek ? ' · текущая неделя' : ''}`}
              >
                <div style={{
                  fontSize: compact ? '0.78em' : '0.82em',
                  color: '#7f8c8d', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                }}>
                  {formatShortDate(w.mondayStr)}–{formatShortDate(sundayDate)}
                </div>
                <div style={{
                  marginTop: 3, fontSize: compact ? '0.78em' : '0.85em', display: 'flex', gap: compact ? 4 : 8,
                }}>
                  <span style={{ color: '#2980b9' }}>З<strong style={{ marginLeft: 2 }}>{w.pickups || 0}</strong></span>
                  <span style={{ color: '#27ae60' }}>Д<strong style={{ marginLeft: 2 }}>{w.deliveries || 0}</strong></span>
                  <span style={{ color: total > 0 ? '#2c3e50' : '#bbb', marginLeft: 'auto' }}>{total}</span>
                </div>
              </button>
            )
          })}
        </div>
      </div>

      <div className="logistics-layout" data-tour="logistics-grid">
        <div className="logistics-main">

      {/* Фильтры. Фильтр района — в боковой сводке (клик по строке).
          Стрелки навигации недель убраны: переключение через полосу обзора недель сверху. */}
      <div className="filters">
        <div className="form-group">
          <label>Тип</label>
          {/* Спринт D, фидбэк 11 мая: вместо двухпозиционного дроп-дауна —
              две кнопки-toggle. Активная подсвечена; повторный клик — выключить. */}
          <div style={{ display: 'inline-flex', gap: 6 }}>
            {[
              { v: 'pickup'   as CardType, label: 'Заборы',   color: '#3498db' },
              { v: 'delivery' as CardType, label: 'Доставки', color: '#27ae60' },
            ].map(b => {
              const on = typeFilters.includes(b.v)
              return (
                <button
                  key={b.v}
                  type="button"
                  onClick={() =>
                    setTypeFilters(prev => prev.includes(b.v) ? prev.filter(x => x !== b.v) : [...prev, b.v])
                  }
                  style={{
                    padding: '6px 14px', borderRadius: 6,
                    border: on ? `2px solid ${b.color}` : '1px solid #bdc3c7',
                    background: on ? b.color : '#fff',
                    color: on ? '#fff' : '#2c3e50',
                    fontWeight: on ? 600 : 500, fontSize: 13, cursor: 'pointer',
                  }}
                >{b.label}</button>
              )
            })}
          </div>
        </div>
        <div className="form-group">
          <label>Временной слот</label>
          <MultiSelectFilter
            options={[
              ...SLOT_DEFS.map(s => ({ value: s.value, label: s.label })),
              { value: 'none', label: 'Без слота' },
            ]}
            value={timeSlotFilters}
            onChange={setTimeSlotFilters}
            placeholder="Все"
            width={180}
          />
        </div>
        {districtFilters.length > 0 && (
          <div className="form-group" style={{ flex: '1 1 100%' }}>
            <label>Активные фильтры по районам</label>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
              {districtFilters.map(d => (
                <button
                  key={d}
                  type="button"
                  onClick={() => toggleDistrict(d)}
                  style={{
                    padding: '4px 10px', borderRadius: 14, border: '1px solid #f1c40f',
                    background: '#fef9e7', cursor: 'pointer', fontSize: 13,
                  }}
                  title="Снять фильтр по этому району"
                >
                  {d} ✕
                </button>
              ))}
              <button
                type="button"
                onClick={() => setDistrictFilters([])}
                style={{
                  padding: '4px 10px', borderRadius: 4, border: 'none',
                  background: 'transparent', color: '#7f8c8d', cursor: 'pointer', fontSize: 12,
                }}
              >
                Снять все
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Навигация недели — только подпись и сводка. Переключение неделей — через полосу обзора. */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12, flexWrap: 'wrap' }}>
        <span style={{ fontWeight: 600, fontSize: '1.05em' }}>
          {formatDayHeader(weekDays[0])} — {formatDayHeader(weekDays[6])}
        </span>
        {(weekSummary.pickups > 0 || weekSummary.deliveries > 0) && (
          <span style={{ fontSize: '0.85em', color: '#7f8c8d' }}>
            · {weekSummary.pickups} заборов · {weekSummary.deliveries} доставок
            {weekSummary.busiest && (
              <> · загруженный день — {formatDayHeader((weekSummary.busiest as { day: string }).day)} ({(weekSummary.busiest as { count: number }).count})</>
            )}
          </span>
        )}
      </div>

      {loading ? (
        <div className="loading">Загрузка...</div>
      ) : (
        <>
          {/* No-date section с собственным фильтром.
              Раньше блок скрывался когда не было нераспределённых карточек,
              из-за чего оператор не мог перетащить заказ обратно «без даты»
              (фидбэк пользователя 11 мая). Теперь блок всегда рендерится —
              если пуст, это drop-zone с подсказкой «перетащите сюда, чтобы снять с даты». */}
          {true && (
            <div style={{ marginBottom: 16 }}>
              <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                marginBottom: 4, padding: '0 4px', flexWrap: 'wrap', gap: 8,
              }}>
                <strong style={{ fontSize: '0.95em', color: '#7f8c8d', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                  Без даты ({(cardsByDay.get('no-date')?.length ?? 0)})
                </strong>
                <div style={{ display: 'inline-flex', border: '1px solid #ddd', borderRadius: 4, overflow: 'hidden' }}>
                  {[
                    { v: 'all'   as NoDateFilter, label: 'Все' },
                    { v: 'leads' as NoDateFilter, label: 'Лиды без забора' },
                    { v: 'ready' as NoDateFilter, label: 'Готовы без доставки' },
                    { v: 'old'   as NoDateFilter, label: 'Старше 7 дней' },
                  ].map(f => (
                    <button
                      key={f.v}
                      onClick={() => setNoDateFilter(f.v)}
                      style={{
                        padding: '4px 10px', border: 'none', cursor: 'pointer', fontSize: '0.82em',
                        background: noDateFilter === f.v ? '#3498db' : '#fff',
                        color: noDateFilter === f.v ? '#fff' : '#555',
                      }}
                    >{f.label}</button>
                  ))}
                </div>
              </div>
              {renderDaySection(
                'no-date',
                'Назначьте перетаскиванием на день недели',
                noDateCards,
                { noDateMode: true },
              )}
            </div>
          )}

          {/* Дни недели — горизонтальная сетка из 7 колонок (Пн..Вс).
              Внутри каждого дня — 4 слота сверху вниз (Утро, День, Вечер, Без слота).
              На узких экранах через CSS сетка переключается на стек (см. .logistics-week-grid). */}
          <div className="logistics-week-grid">
            {weekDays.map(day => renderDaySection(day, formatDayHeader(day), cardsByDay.get(day) || []))}
          </div>
        </>
      )}

        </div>
        {/* Sticky-сводка по районам справа. На узких экранах — переезжает вниз через CSS. */}
        <aside className={'logistics-aside' + (asideExpanded ? ' expanded' : '')}>
          {(() => {
            const totalAll = districtStats.reduce((a,s) => a + s.pickups + s.deliveries, 0)
            const maxLoad = districtStats.reduce((a,s) => Math.max(a, s.pickups + s.deliveries), 0)
            return (
              <div className="card" style={{ padding: '10px 12px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                  <strong style={{ fontSize: '0.85em', color: '#7f8c8d', textTransform: 'uppercase', letterSpacing: 0.6 }}>
                    Районы за неделю
                  </strong>
                  <button
                    onClick={() => setAsideExpanded(s => !s)}
                    className="btn-secondary btn-sm"
                    title={asideExpanded ? 'Свернуть' : 'Развернуть — детали по заборам, доставкам и сумме'}
                    style={{ padding: '2px 8px', fontSize: '0.85em' }}
                  >
                    {asideExpanded ? '⇥' : '⇤'}
                  </button>
                </div>
                {districtStats.length === 0 ? (
                  <div className="empty" style={{ fontSize: '0.85em', padding: '12px 0' }}>На этой неделе данных нет</div>
                ) : asideExpanded ? (
                  <table style={{ width: '100%', fontSize: '0.85em' }}>
                    <thead>
                      <tr>
                        <th style={{ textAlign: 'left' }}>Район</th>
                        <th style={{ width: 40, textAlign: 'right', color: '#2980b9' }}>Заб.</th>
                        <th style={{ width: 40, textAlign: 'right', color: '#27ae60' }}>Дос.</th>
                        <th style={{ width: 50, textAlign: 'right' }}>Всего</th>
                      </tr>
                    </thead>
                    <tbody>
                      {districtStats.map(s => {
                        const isActive = districtFilters.includes(s.district)
                        return (
                        <tr
                          key={s.district}
                          style={{
                            cursor: 'pointer',
                            background: isActive ? '#fef9e7' : undefined,
                            outline: isActive ? '1px solid #f1c40f' : undefined,
                          }}
                          onClick={() => {
                            // Спринт D: клик по району — toggle. Второй клик по тому же
                            // району снимает фильтр; клик по другому — добавляет к выбранным.
                            // «(без района)» сейчас не фильтрабелен — игнорируем.
                            if (s.district === '(без района)') return
                            toggleDistrict(s.district)
                          }}
                          title={isActive ? 'Клик — снять этот район' : 'Клик — добавить район к фильтру'}
                        >
                          <td><strong>{s.district}</strong></td>
                          <td style={{ textAlign: 'right' }}>{s.pickups || '—'}</td>
                          <td style={{ textAlign: 'right' }}>{s.deliveries || '—'}</td>
                          <td style={{ textAlign: 'right' }}><strong>{s.pickups + s.deliveries}</strong></td>
                        </tr>
                        )
                      })}
                      <tr style={{ background: '#f4f6f7', fontWeight: 700 }}>
                        <td>Итого</td>
                        <td style={{ textAlign: 'right' }}>{districtStats.reduce((a,s) => a+s.pickups, 0)}</td>
                        <td style={{ textAlign: 'right' }}>{districtStats.reduce((a,s) => a+s.deliveries, 0)}</td>
                        <td style={{ textAlign: 'right' }}>{totalAll}</td>
                      </tr>
                    </tbody>
                  </table>
                ) : (
                  // Компактный режим: район + цифра + бар нагрузки
                  <div>
                    {districtStats.map(s => {
                      const load = s.pickups + s.deliveries
                      const widthPct = maxLoad > 0 ? Math.round((load / maxLoad) * 100) : 0
                      const isActive = districtFilters.includes(s.district)
                      return (
                        <div
                          key={s.district}
                          style={{
                            marginBottom: 6, cursor: 'pointer',
                            padding: '4px 6px', borderRadius: 4,
                            background: isActive ? '#fef9e7' : 'transparent',
                            outline: isActive ? '1px solid #f1c40f' : undefined,
                          }}
                          onClick={() => {
                            // Спринт D: клик по району — toggle. Второй клик по тому же
                            // району снимает фильтр; клик по другому — добавляет к выбранным.
                            // «(без района)» сейчас не фильтрабелен — игнорируем.
                            if (s.district === '(без района)') return
                            toggleDistrict(s.district)
                          }}
                          title={isActive ? 'Клик — снять этот район' : `${s.pickups} заборов · ${s.deliveries} доставок · клик — фильтр`}
                        >
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85em' }}>
                            <span style={{
                              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: '1 1 auto', minWidth: 0,
                              fontWeight: isActive ? 700 : 400,
                            }}>{s.district}</span>
                            <strong style={{ marginLeft: 6 }}>{load}</strong>
                          </div>
                          <div style={{
                            height: 4, background: '#ecf0f1', borderRadius: 2, overflow: 'hidden', marginTop: 2,
                          }}>
                            <div style={{
                              height: '100%', width: widthPct + '%',
                              background: 'linear-gradient(90deg, #3498db, #2980b9)',
                              transition: 'width 0.2s ease',
                            }} />
                          </div>
                        </div>
                      )
                    })}
                    <div style={{
                      marginTop: 10, paddingTop: 8, borderTop: '1px solid #ecf0f1',
                      fontSize: '0.85em', color: '#7f8c8d',
                    }}>
                      Всего точек: <strong style={{ color: '#2c3e50' }}>{totalAll}</strong>
                    </div>
                  </div>
                )}
              </div>
            )
          })()}

          {/* Карта недели — всегда видна. По умолчанию маленькая (240px),
              клик по карте/кнопке — разворачивается на всю ширину окна (модально). */}
          <div className="card" style={{ padding: '10px 12px', marginTop: 12 }}>
            <div style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              marginBottom: 8,
            }}>
              <strong style={{ fontSize: '0.85em', color: '#7f8c8d', textTransform: 'uppercase', letterSpacing: 0.6 }}>
                Карта недели {mapPoints.length > 0 && <span style={{ color: '#3498db' }}>· {mapPoints.length}</span>}
              </strong>
              {mapPoints.length > 0 && (
                <button
                  onClick={() => setMapExpanded(true)}
                  className="btn-secondary btn-sm"
                  style={{ padding: '2px 8px', fontSize: '0.85em' }}
                  title="Открыть карту в полноэкранном виде"
                >
                  ⛶ Развернуть
                </button>
              )}
            </div>
            {mapPoints.length === 0 ? (
              <div style={{ fontSize: '0.85em', color: '#888', textAlign: 'center', padding: '12px 0' }}>
                Нет заказов с координатами на этой неделе.
              </div>
            ) : (
              <>
                <div style={{ marginBottom: 6, color: '#666', fontSize: '0.78em' }}>
                  <span style={{ display: 'inline-block', width: 8, height: 8, background: '#2980b9', borderRadius: 4, marginRight: 4 }} /> Забор
                  <span style={{ display: 'inline-block', width: 8, height: 8, background: '#27ae60', borderRadius: 4, marginLeft: 12, marginRight: 4 }} /> Доставка
                </div>
                <div
                  onClick={() => setMapExpanded(true)}
                  style={{ cursor: 'zoom-in' }}
                  title="Клик — развернуть карту"
                  data-tour="logistics-map"
                >
                  <MapMarkers points={mapPoints} height={220} />
                </div>
              </>
            )}
          </div>

          {/* Модальное окно с большой картой */}
          {mapExpanded && mapPoints.length > 0 && (
            <div
              className="modal-overlay"
              onClick={() => setMapExpanded(false)}
              style={{ zIndex: 1000 }}
            >
              <div
                onClick={e => e.stopPropagation()}
                style={{
                  background: '#fff', borderRadius: 8, padding: 12,
                  width: '90vw', maxWidth: 1400, maxHeight: '90vh', display: 'flex', flexDirection: 'column',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <div style={{ color: '#666', fontSize: '0.9em' }}>
                    <span style={{ display: 'inline-block', width: 10, height: 10, background: '#2980b9', borderRadius: 5, marginRight: 4 }} /> Забор
                    <span style={{ display: 'inline-block', width: 10, height: 10, background: '#27ae60', borderRadius: 5, marginLeft: 16, marginRight: 4 }} /> Доставка
                    <span style={{ marginLeft: 24, color: '#888' }}>· Наведите на метку для подсказки</span>
                  </div>
                  <button className="btn-secondary" onClick={() => setMapExpanded(false)}>Закрыть</button>
                </div>
                <div style={{ flex: 1, minHeight: 0 }}>
                  <MapMarkers points={mapPoints} height={'78vh'} />
                </div>
              </div>
            </div>
          )}
        </aside>
      </div>

      {/* Модалка выбора водителя — открывается из чипа на карточке заказа.
          UX: плитки сотрудников (цвет по хэшу имени, как в кабинете работника),
          сверху подсветка текущего, отдельная кнопка «Без водителя» — снимает
          назначение. Закрытие — клик по фону или Esc. */}
      {driverPickerFor && (
        <div
          className="modal-overlay"
          onClick={() => setDriverPickerFor(null)}
          style={{ zIndex: 1200 }}
        >
          <div
            className="modal"
            onClick={e => e.stopPropagation()}
            style={{ maxWidth: 480, padding: 16 }}
          >
            <h3 style={{ marginTop: 0, marginBottom: 4 }}>Назначить водителя</h3>
            <div style={{ fontSize: 12, color: '#7f8c8d', marginBottom: 14 }}>
              Заказ #{driverPickerFor.orderId}. Можно назначить любого сотрудника.
            </div>
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))',
              gap: 8,
              marginBottom: 12,
            }}>
              {employees.map(e => {
                const isCurrent = e.id === driverPickerFor.current
                const c = hashColor(e.name)
                return (
                  <button
                    key={e.id}
                    type="button"
                    onClick={() => void saveDriver(e.id)}
                    style={{
                      padding: '10px 12px',
                      background: c.bg, color: c.text,
                      border: isCurrent ? `2px solid ${c.text}` : '1px solid #d6dbdf',
                      borderRadius: 8,
                      cursor: 'pointer',
                      fontSize: 13, fontWeight: 600,
                      textAlign: 'center',
                      boxShadow: isCurrent ? `0 0 0 3px ${c.bg}` : 'none',
                    }}
                  >
                    {e.name}
                  </button>
                )
              })}
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                type="button"
                onClick={() => void saveDriver(null)}
                style={{
                  flex: 1, padding: '8px',
                  background: '#fdf2e9', color: '#a04000', border: '1px solid #f5cba7',
                  borderRadius: 6, cursor: 'pointer', fontSize: 13,
                }}
              >Снять назначение</button>
              <button
                type="button"
                onClick={() => setDriverPickerFor(null)}
                style={{
                  flex: 1, padding: '8px',
                  background: '#fff', color: '#2c3e50', border: '1px solid #d6dbdf',
                  borderRadius: 6, cursor: 'pointer', fontSize: 13,
                }}
              >Отмена</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
