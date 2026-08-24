import { useEffect, useState, useMemo, useCallback } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { getOrders, updateActualDates, setOrderDriver } from '../api/orders'
import { getDrivers } from '../api/references'
import MapMarkers, { type MapPoint } from '../components/MapMarkers'
import MultiSelectFilter from '../components/MultiSelectFilter'
import CompleteDeliveriesModal from '../components/logistics/CompleteDeliveriesModal'
import AddOneOffSlotModal from '../components/logistics/AddOneOffSlotModal'
import StyledSelect from '../components/StyledSelect'
import MissingAddressModal from '../components/logistics/MissingAddressModal'
import {
  getDeliverySlots, createDeliverySlot, deleteDeliverySlot,
  slotValue, slotLabel, type DeliverySlot,
} from '../api/deliverySlots'
import { hashColor } from '../components/Tiles'
import { formatOrderNumber } from '../utils/format'
import { PAYMENT_LABELS, PRELIMINARY_PAYMENT_LABELS } from '../constants/statuses'
import { formatPhone } from '../components/PhoneInput'
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
  /** Развозка уже выполнена (DELIVERED/COMPLETED) — карточка живёт в архиве дня, не перетаскивается. */
  archived?: boolean
}

const DAY_NAMES = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб']
const MONTH_NAMES_SHORT = ['янв', 'фев', 'мар', 'апр', 'май', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек']

interface SlotDef {
  value: string
  label: string
  color: string  // цветовая полоска слева на карточке
  /** V31: id разового слота (заведён на одну дату) — по нему даём кнопку удаления. */
  oneOffId?: number
}

/**
 * Палитра слотов. Слоты приходят из справочника (delivery_time_slots) и у каждого
 * дня недели свой набор, поэтому цвет не хранится в БД — берём по позиции слота
 * внутри дня. Порядок стабильный (sort_order, start_time), значит и цвет стабильный.
 */
const SLOT_PALETTE = ['#74b9ff', '#fdcb6e', '#a29bfe', '#55efc4', '#fab1a0', '#81ecec']

/**
 * Слоты дня из справочника. Раньше здесь был хардкод 8–12/12–18/18–22, из-за
 * чего настройки рабочего времени в Справочниках на логистику не влияли и
 * выходные не отличались от будней (правка №4).
 */
/**
 * Слоты конкретной даты: шаблоны её дня недели + разовые, заведённые именно
 * на эту дату (V31, specific_date). Разовый слот, добавленный в среду 26.08,
 * в другие среды не попадает.
 */
function slotDefsForDate(dateStr: string, slots: DeliverySlot[]): SlotDef[] {
  const dow = new Date(dateStr).getDay()
  return slots
    .filter(s => s.is_active && s.day_of_week === dow
      && (!s.specific_date || s.specific_date === dateStr))
    .sort((a, b) => (a.sort_order - b.sort_order) || a.start_time.localeCompare(b.start_time))
    .map((s, i) => ({
      value: slotValue(s),
      label: s.label ? `${s.label} · ${slotLabel(s)}` : slotLabel(s),
      color: SLOT_PALETTE[i % SLOT_PALETTE.length],
      // Разовый слот помечаем, чтобы в дне была кнопка «убрать» именно у него.
      oneOffId: s.specific_date ? s.id : undefined,
    }))
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

/**
 * Печать маршрутного листа на конкретный день.
 *
 * Лист горизонтальный: под адрес нужно много места, в книжной ориентации он
 * переносился на 4-5 строк. Колонку «ФИ клиента» убрали — водителю она не нужна,
 * а место занимала. Оплата берётся из предварительного типа (оператор ставит
 * заранее), при его отсутствии — из фактической оплаты.
 *
 * driverName — если задан, лист печатается для одного водителя (его имя в шапке).
 */
function printRouteSheet(date: string, cards: OrderCard[], driverName?: string): void {
  const dayCards = cards.filter(c => c.date === date)
    .sort((a, b) => (a.timeSlot || '').localeCompare(b.timeSlot || ''))
  const formattedDate = new Date(date).toLocaleDateString('ru', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })

  const rows = dayCards.map((c, idx) => {
    const apartment = c.type === 'pickup' ? c.order.pickup_apartment : c.order.delivery_apartment
    const addr = (c.address || '—') + (apartment ? `, кв. ${apartment}` : '')
    // client_phone приезжает JOIN'ом из clients. Раньше поля не было вовсе,
    // и в колонке «Телефон» рисовался адрес из fallback'а.
    const phone = c.order.client_phone ? formatPhone(c.order.client_phone) : '—'
    // Оплата: сначала предварительный тип (намерение, ставит оператор заранее),
    // если его нет — фактический. Так водитель знает, чего ждать от клиента.
    const payment = c.order.preliminary_payment_type
      ? PRELIMINARY_PAYMENT_LABELS[c.order.preliminary_payment_type]
      : (c.order.payment_type ? PAYMENT_LABELS[c.order.payment_type] : '—')
    // Архивный маршрутный лист: выполненные точки помечаем галкой и глушим цвет,
    // чтобы при перепечатке прошедшей развозки было видно, что уже отработано.
    const rowStyle = c.archived ? ' style="color:#7f8c8d"' : ''
    const mark = c.archived ? ' ✓' : ''
    return `<tr${rowStyle}>
      <td style="padding:5px 6px;text-align:center">${idx + 1}</td>
      <td style="padding:5px 6px;text-align:center;font-weight:600">${c.type === 'pickup' ? 'Забор' : 'Отвоз'}${mark}</td>
      <td style="padding:5px 6px;white-space:nowrap">#${String(c.order.id).padStart(5, '0')}</td>
      <td style="padding:5px 6px">${addr}</td>
      <td style="padding:5px 6px;white-space:nowrap">${phone}</td>
      <td style="padding:5px 6px;text-align:right;white-space:nowrap">${Number(c.order.total_amount).toFixed(0)} ₽</td>
      <td style="padding:5px 6px;white-space:nowrap">${payment}</td>
      <td style="padding:5px 6px;white-space:nowrap">${c.timeSlot || '—'}</td>
      <td style="padding:5px 6px;color:#555">${c.order.comment || ''}</td>
      <td style="padding:5px 6px"></td>
    </tr>`
  }).join('')

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8">
    <title>Маршрутный лист ${date}</title>
    <style>
      /* Горизонтальный лист: адрес получает достаточную ширину и не ломается
         на много строк, как это было в книжной ориентации. */
      @page{ size: A4 landscape; margin: 8mm }
      body{font-family:Arial,sans-serif;font-size:11px;margin:0;color:#222}
      h1{font-size:16px;margin:0 0 4px}
      .sub{color:#666;margin-bottom:10px}
      table{width:100%;border-collapse:collapse;table-layout:fixed}
      th{background:#ecf0f1;text-align:left;padding:5px 6px;border:1px solid #bdc3c7;font-size:10px}
      td{border:1px solid #d6dbdf;font-size:11px;vertical-align:top;word-wrap:break-word}
      tr:nth-child(even) td{background:#fafafa}
      tr{page-break-inside:avoid;break-inside:avoid}
      thead{display:table-header-group}
    </style></head><body>
    <h1>Маршрутный лист${driverName ? ' — ' + driverName : ''}</h1>
    <div class="sub">${formattedDate} · всего ${dayCards.length} ${dayCards.length === 1 ? 'выезд' : 'выездов'}</div>
    <table>
      <colgroup>
        <col style="width:3%"><col style="width:6%"><col style="width:7%">
        <col style="width:30%"><col style="width:11%"><col style="width:7%">
        <col style="width:8%"><col style="width:8%"><col style="width:14%">
        <col style="width:6%">
      </colgroup>
      <thead><tr>
        <th>#</th>
        <th>Тип</th>
        <th>Заказ</th>
        <th>Адрес</th>
        <th>Телефон</th>
        <th>Сумма</th>
        <th>Оплата</th>
        <th>Время</th>
        <th>Комментарий</th>
        <th>Отметка</th>
      </tr></thead>
      <tbody>${rows || '<tr><td colspan=10 style="padding:20px;text-align:center;color:#999">На эту дату выездов нет</td></tr>'}</tbody>
    </table>
    </body></html>`

  const iframe = document.createElement('iframe')
  iframe.style.position = 'fixed'; iframe.style.left = '-9999px'; iframe.style.top = '-9999px'
  document.body.appendChild(iframe)
  const doc = iframe.contentDocument || iframe.contentWindow?.document
  if (doc) {
    doc.open(); doc.write(html); doc.close()
    setTimeout(() => {
      iframe.contentWindow?.print()
      iframe.addEventListener('afterprint', () => document.body.removeChild(iframe))
      setTimeout(() => { if (iframe.parentNode) document.body.removeChild(iframe) }, 60000)
    }, 300)
  }
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
  // День для маршрутного листа и массового завершения развозки.
  const [routeDay, setRouteDay] = useState<string>(() => new Date().toISOString().slice(0, 10))
  /**
   * Правка №1 (21.08): режим отображения логистики.
   *   'week' — прежняя недельная доска с drag&drop (по умолчанию, не менялась);
   *   'day'  — развёрнутый список заказов выбранной даты со всеми полями.
   */
  const [viewMode, setViewMode] = useState<'week' | 'day'>('week')
  /**
   * Правка №3 (21.08): фильтр по водителю в режиме «День».
   * null — все, 0 — без водителя, N — конкретный водитель.
   * Позволяет разделить развозку дня между несколькими водителями и напечатать
   * каждому свой маршрутный лист.
   */
  const [routeDriverId, setRouteDriverId] = useState<number | null>(null)
  /** V31: дата, для которой открыта модалка «добавить разовый слот». */
  const [addSlotFor, setAddSlotFor] = useState<string | null>(null)
  /** Заказ, которому не хватает адреса — окно ввода после назначения на слот. */
  const [addressFor, setAddressFor] = useState<{ order: Order; type: CardType } | null>(null)
  /** Справочник слотов под картой свёрнут по умолчанию — он нужен изредка. */
  const [slotsPanelOpen, setSlotsPanelOpen] = useState(false)
  /**
   * Правка №12: какой день показывает карта. '' — вся неделя.
   *
   * По умолчанию показываем неделю целиком: при старте с конкретного дня карта
   * часто оказывалась пустой (в этот день просто нет развозки), и выглядело это
   * как «карта не работает». День оператор выбирает панелькой над картой либо
   * через «Маршрутный лист на».
   */
  const [mapDay, setMapDay] = useState<string>('')
  /**
   * Фильтр карты по водителю. null — все, 0 — без водителя, N — конкретный.
   * Тот же смысл, что у фильтра маршрутного листа: посмотреть маршрут одного
   * водителя отдельно от остальных.
   */
  const [mapDriverId, setMapDriverId] = useState<number | null>(null)
  /**
   * Подсветка типа точек на карте: null — все одинаково, 'pickup'/'delivery' —
   * выбранный тип сохраняет цвет дня, остальные гаснут в серый. Именно гаснут,
   * а не исчезают: маршрут надо видеть целиком, но понимать, где что.
   */
  const [mapKindFocus, setMapKindFocus] = useState<CardType | null>(null)
  const [showComplete, setShowComplete] = useState(false)
  // Слоты доставки из справочника — у каждого дня недели свой набор (правка №4).
  const [slots, setSlots] = useState<DeliverySlot[]>([])
  const reloadSlots = useCallback(
    () => getDeliverySlots().then(setSlots).catch(() => setSlots([])), [])
  useEffect(() => { void reloadSlots() }, [reloadSlots])

  /**
   * V31: разовый слот — только на выбранную дату.
   *
   * day_of_week выставляем по самой дате (этого требует CHECK в БД), а
   * specific_date отсекает слот от других таких же дней недели: добавленный
   * в среду 26.08 в другие среды не появится.
   */
  const addOneOffSlot = async (dateStr: string, start: string, end: string, label: string) => {
    await createDeliverySlot({
      day_of_week: new Date(dateStr).getDay(),
      start_time: start,
      end_time: end || null,
      label: label.trim() || null,
      is_active: true,
      // Разовые показываем после обычных слотов дня.
      sort_order: 100,
      specific_date: dateStr,
    })
    await reloadSlots()
  }

  const removeOneOffSlot = async (slotId: number) => {
    if (!window.confirm('Убрать этот разовый слот? Обычное расписание дня не изменится.')) return
    await deleteDeliverySlot(slotId)
    await reloadSlots()
  }

  /** Цвет полоски слота на карточке. Ищем слот по его строковому значению во всех днях. */
  const slotColor = useCallback((slot: string | null): string => {
    if (!slot) return '#bdc3c7'
    for (const day of [1, 2, 3, 4, 5, 6, 0]) {
      const defs = slots
        .filter(s => s.day_of_week === day && s.is_active)
        .sort((a, b) => (a.sort_order - b.sort_order) || a.start_time.localeCompare(b.start_time))
      const idx = defs.findIndex(s => slotValue(s) === slot)
      if (idx >= 0) return SLOT_PALETTE[idx % SLOT_PALETTE.length]
    }
    return '#bdc3c7'
  }, [slots])

  useEffect(() => {
    const fromUrl = searchParams.get('district')
    if (fromUrl !== null) setDistrictFilters(fromUrl ? [fromUrl] : [])
  }, [searchParams])

  // Выбранный день маршрутного листа должен принадлежать показанной неделе:
  // при переключении недели select иначе «повисает» на дате из прошлой.
  useEffect(() => {
    const days = getWeekDays(weekStart)
    if (!days.includes(routeDay)) setRouteDay(days[0])
  }, [weekStart, routeDay])

  // Карта не должна остаться на дате из прошлой недели после переключения.
  // Сбрасываем на «всю неделю», а не на её первый день: так после смены недели
  // сразу видно всю развозку, а не случайно выбранный понедельник.
  useEffect(() => {
    const days = getWeekDays(weekStart)
    if (mapDay && !days.includes(mapDay)) setMapDay('')
  }, [weekStart, mapDay])

  /** Toggle района в фильтре: добавляет если нет, убирает если есть. */
  const toggleDistrict = (d: string) => {
    setDistrictFilters(prev =>
      prev.includes(d) ? prev.filter(x => x !== d) : [...prev, d]
    )
  }

  const [allOrders, setAllOrders] = useState<Order[]>([])

  /**
   * Опции фильтра «Временной слот»: справочник + слоты, реально встречающиеся
   * в заказах. Второе нужно, чтобы по старым значениям (08:00-12:00 и т.п.)
   * тоже можно было отфильтровать — иначе такие заказы не найти.
   */
  const allSlotOptions = useMemo(() => {
    const seen = new Map<string, string>()
    for (const s of slots) {
      if (!s.is_active) continue
      const v = slotValue(s)
      if (!seen.has(v)) seen.set(v, s.label ? `${s.label} · ${slotLabel(s)}` : slotLabel(s))
    }
    for (const o of allOrders) {
      for (const v of [o.actual_pickup_time_slot, o.actual_delivery_time_slot]) {
        if (v && !seen.has(v)) seen.set(v, `${v} · вне графика`)
      }
    }
    return [...seen.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([value, label]) => ({ value, label }))
  }, [slots, allOrders])

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

  /** Полная перезагрузка списка заказов. Вынесена из useEffect — её дёргает
   *  модалка массового завершения развозки, чтобы обновить доску после оплат. */
  const reload = useCallback(async () => {
    setLoading(true)
    try {
      const results = await Promise.all([
        getOrders('LEAD', 0, 200),
        getOrders('CREATED', 0, 200),
        getOrders('FOR_PICKUP', 0, 200),
        getOrders('IN_PROGRESS', 0, 200),
        getOrders('PARTIALLY_DONE', 0, 200),
        getOrders('DONE', 0, 200),
        // Завершённые развозки нужны для архива маршрутных листов: раньше заказ
        // после «Доставлен» пропадал со своего дня, и посмотреть/перепечатать
        // состав прошедшей развозки было невозможно.
        getOrders('PARTIALLY_DELIVERED', 0, 200),
        getOrders('DELIVERED', 0, 200),
        getOrders('COMPLETED', 0, 200),
      ])
      const allFetched = results.flatMap(r => Array.isArray(r) ? r as unknown as Order[] : r.content)
      setAllOrders(allFetched)
    } catch { /* ignore */ }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { void reload() }, [reload])

  // Build cards from orders
  const allCards = useMemo((): OrderCard[] => {
    const cards: OrderCard[] = []
    const pickupStatuses = new Set(['LEAD', 'CREATED', 'FOR_PICKUP'])
    // DELIVERED/PARTIALLY_DELIVERED/COMPLETED остаются на своём дне как архив
    // выполненной развозки (перетаскивать их уже нельзя — см. archived ниже).
    const deliveryStatuses = new Set(['DONE', 'PARTIALLY_DELIVERED', 'DELIVERED', 'COMPLETED'])
    const archivedStatuses = new Set(['PARTIALLY_DELIVERED', 'DELIVERED', 'COMPLETED'])

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
        // Завершённую развозку показываем только если у неё есть фактическая дата —
        // иначе она свалится в «Без даты» и замусорит очередь на разбор.
        const archived = archivedStatuses.has(o.status)
        if (showDelivery && (!archived || o.actual_delivery_date)) {
          cards.push({
            order: o,
            type: 'delivery',
            date: o.actual_delivery_date,
            timeSlot: o.actual_delivery_time_slot,
            district: o.delivery_district,
            address: o.delivery_address || o.client_address,
            lat: o.delivery_lat != null ? Number(o.delivery_lat) : null,
            lon: o.delivery_lon != null ? Number(o.delivery_lon) : null,
            archived,
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

      // Заказ без адреса развозить некуда: водитель получит точку без адреса,
      // и на карте её тоже не будет. Сразу после назначения на слот поднимаем
      // окно ввода адреса — его можно закрыть, но проблема уже на виду.
      if (!isUnassign) {
        const o = allOrders.find(x => x.id === orderId)
        const addr = type === 'pickup' ? o?.pickup_address : o?.delivery_address
        if (o && !(addr && addr.trim())) setAddressFor({ order: o, type })
      }
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
    // Архивная карточка (развозка уже выполнена) — приглушена и не таскается:
    // менять дату у состоявшейся доставки нельзя, она уже история.
    const archived = !!card.archived
    return (
      <div
        key={`${card.order.id}-${card.type}`}
        // В режиме просмотра drag не нужен — карточки только показываем.
        draggable={!viewer && !archived}
        onDragStart={() => !viewer && !archived && handleDragStart(card.order.id, card.type)}
        onDragEnd={() => setDragData(null)}
        onClick={() => navigate(`/orders/${card.order.id}`)}
        title={`${isPickup ? 'Забор' : 'Доставка'} · ${formatOrderNumber(card.order.id, card.order.created_at)} · ${card.order.client_name}${card.address ? ' · ' + card.address : ''}${archived ? ' · развозка выполнена' : ''}`}
        style={{
          padding: '6px 8px',
          marginBottom: 4,
          borderRadius: 5,
          // полоска слева — тип (забор/доставка); полоска слота — внешний боксшэдоу.
          borderLeft: `3px solid ${archived ? '#95a5a6' : typeColor}`,
          boxShadow: 'inset 3px 0 0 0 ' + sColor,
          paddingLeft: 12,
          background: archived ? '#f7f9f9' : '#fff',
          opacity: archived ? 0.72 : 1,
          cursor: archived ? 'pointer' : 'grab',
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
          {archived && <span title="Развозка выполнена" style={{ marginRight: 4 }}>✓</span>}
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

  /**
   * Слоты дня: из справочника + «осиротевшие».
   *
   * Осиротевший слот — значение, записанное в заказе, которого в справочнике
   * этого дня нет. Так выглядят заказы, назначенные на старые захардкоженные
   * слоты (08:00-12:00 / 12:00-18:00 / 18:00-22:00), и заказы на слот, который
   * потом удалили из справочника. Показываем их отдельной зоной внизу дня:
   * заказ не теряется, оператор видит исходное время и может перетащить его
   * в актуальный слот. Данные при этом не переписываем.
   */
  const slotZonesForDay = (dateStr: string, cards: OrderCard[]): SlotDef[] => {
    const defs = slotDefsForDate(dateStr, slots)
    const known = new Set(defs.map(d => d.value))
    const orphans = [...new Set(
      cards.map(c => c.timeSlot).filter((v): v is string => !!v && !known.has(v))
    )].sort()
    return [
      ...defs,
      ...orphans.map(value => ({ value, label: `${value} · вне графика`, color: '#e59866' })),
    ]
  }

  /** Группировка карточек дня по слотам. Ключ — value слота или 'none' для пустого. */
  const groupCardsBySlot = (zones: SlotDef[], cards: OrderCard[]): Record<string, OrderCard[]> => {
    const map: Record<string, OrderCard[]> = { none: [] }
    for (const def of zones) map[def.value] = []
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
    const zones = slotZonesForDay(dateStr, cards)
    const grouped = groupCardsBySlot(zones, cards)

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
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            {/* V31: добавить слот ТОЛЬКО в этот день. Заводится с specific_date,
                поэтому в другие такие же дни недели и в другие недели не попадёт. */}
            {!isReadonly && (
              <button
                type="button"
                onClick={() => setAddSlotFor(dateStr)}
                title="Добавить временной слот только на этот день"
                style={{
                  border: '1px solid #ddd', background: '#fff', borderRadius: 4,
                  cursor: 'pointer', fontSize: '0.72em', padding: '1px 5px', color: '#3498db',
                }}
              >+ слот</button>
            )}
            <span style={{ fontSize: '0.78em', color: '#888' }}>
              {cards.length}
            </span>
          </span>
        </div>
        {/* Слоты постоянно видны, вертикально сверху вниз. Набор берётся из
            справочника под день недели этой даты (у выходных он другой) плюс
            разовые слоты этой даты и «вне графика» — слоты из старых заказов,
            которых в справочнике нет. */}
        {zones.map(s => (
          <div key={s.value} style={{ position: 'relative' }}>
            {renderSlotZone(dateStr, { value: s.value, label: s.label, color: s.color }, grouped[s.value] || [])}
            {/* Разовый слот можно убрать здесь же — он существует только для этой
                даты, отдельная страница справочников для этого избыточна. */}
            {s.oneOffId != null && !isReadonly && (grouped[s.value] || []).length === 0 && (
              <button
                type="button"
                title="Убрать разовый слот этого дня"
                onClick={() => void removeOneOffSlot(s.oneOffId!)}
                style={{
                  position: 'absolute', top: 2, right: 2, border: 'none', background: 'transparent',
                  cursor: 'pointer', color: '#c0392b', fontSize: '0.85em', lineHeight: 1, padding: 2,
                }}
              >×</button>
            )}
          </div>
        ))}
        {/* «Без слота» — показываем только если в нём что-то есть или идёт перетаскивание.
            Иначе зону скрываем чтобы не зашумлять день. Drop в неё снимет слот. */}
        {(grouped['none'].length > 0 || isDragging) && (
          renderSlotZone(dateStr, { value: '', label: 'Без слота', color: '#bdc3c7' }, grouped['none'] || [])
        )}
      </div>
    )
  }

  /**
   * Правка №3 (21.08): карточки выбранного дня с учётом фильтра по водителю.
   * Используются и в режиме «День», и при печати маршрутного листа — так лист
   * гарантированно совпадает с тем, что оператор видит на экране.
   */
  const routeCards = useMemo(() => filteredCards.filter(c => {
    if (c.date !== routeDay) return false
    if (routeDriverId === null) return true
    if (routeDriverId === 0) return !c.order.assigned_driver_id
    return c.order.assigned_driver_id === routeDriverId
  }), [filteredCards, routeDay, routeDriverId])

  const routeDriverName = routeDriverId
    ? (employees.find(d => d.id === routeDriverId)?.name ?? undefined)
    : (routeDriverId === 0 ? 'без водителя' : undefined)

  /** Водители, у которых есть заказы в выбранный день — для вкладок в режиме «День». */
  const driversOfDay = useMemo(() => {
    const dayCards = filteredCards.filter(c => c.date === routeDay)
    const ids = new Set<number>()
    let unassigned = 0
    for (const c of dayCards) {
      if (c.order.assigned_driver_id) ids.add(c.order.assigned_driver_id)
      else unassigned++
    }
    return {
      list: employees.filter(d => ids.has(d.id)),
      unassigned,
      total: dayCards.length,
    }
  }, [filteredCards, routeDay, employees])

  /**
   * Правка №12: панель переключения дня над картой — оператор быстро прокликивает
   * развозки недели, не трогая выбор даты для печати.
   *
   * big=true — вариант для развёрнутой карты: кнопки крупнее и растянуты на всю
   * ширину, чтобы попадать по ним на большом экране. Панель обязательно
   * присутствует и в полноэкранном режиме — иначе, развернув карту, оператор
   * терял возможность переключить день и был вынужден её закрывать.
   */
  /**
   * Легенда карты. Раньше это были статичные точки «Забор синий / Доставка
   * зелёная», что было неправдой: маркеры красятся по ДНЮ недели, а не по типу.
   * Теперь это переключатели: клик подсвечивает свой тип, остальные точки на
   * карте гаснут в серый (не пропадают). Повторный клик снимает подсветку.
   */
  const renderMapLegend = (big: boolean) => {
    const items: { kind: CardType; label: string }[] = [
      { kind: 'pickup', label: 'Забор' },
      { kind: 'delivery', label: 'Доставка' },
    ]
    return (
      <div style={{
        display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap',
        marginBottom: 8, fontSize: big ? '0.9em' : '0.78em',
      }}>
        {items.map(it => {
          const count = visibleMapCards.filter(c => c.type === it.kind).length
          const on = mapKindFocus === it.kind
          const dim = mapKindFocus !== null && !on
          return (
            <button
              key={it.kind}
              onClick={() => setMapKindFocus(on ? null : it.kind)}
              title={on ? 'Снять подсветку' : `Подсветить: ${it.label} (остальные станут серыми)`}
              style={{
                padding: big ? '5px 12px' : '3px 8px', borderRadius: 4, cursor: 'pointer',
                fontSize: 'inherit',
                border: `1px solid ${on ? 'var(--c-primary)' : '#ddd'}`,
                background: on ? 'var(--c-primary)' : '#fff',
                color: on ? '#fff' : (dim ? 'var(--c-text-muted)' : 'var(--c-text)'),
                fontWeight: on ? 600 : 400,
              }}
            >
              {it.label}{count > 0 && ` · ${count}`}
            </button>
          )
        })}
        <span style={{ color: 'var(--c-text-muted)' }}>
          цвет точки — день недели
        </span>
      </div>
    )
  }

  const renderMapDayStrip = (big: boolean) => {
    const pad = big ? '8px 4px' : '3px 2px'
    const font = big ? '0.92em' : '0.72em'
    return (
      <div style={{ marginBottom: big ? 12 : 8 }}>
        {/* Дни — одной строкой без переносов: только «Пн», «Вт» и счётчик.
            Полная дата уехала в tooltip, иначе панель занимала три строки. */}
        <div style={{ display: 'flex', gap: big ? 6 : 3, marginBottom: 6 }}>
          {weekDays.map(d => {
            const count = mapCandidateCards.filter(c => c.date === d).length
            const active = mapDay === d
            return (
              <button
                key={d}
                onClick={() => setMapDay(d)}
                title={`${formatDayHeader(d)} · точек: ${count}`}
                style={{
                  flex: '1 1 0', minWidth: 0,
                  padding: pad, borderRadius: 4, cursor: 'pointer', fontSize: font,
                  border: `1px solid ${active ? dayColor(d) : '#ddd'}`,
                  background: active ? dayColor(d) : '#fff',
                  color: active ? '#fff' : (count > 0 ? 'var(--c-text)' : 'var(--c-text-muted)'),
                  fontWeight: active ? 600 : 400,
                }}
              >
                {DAY_NAMES[new Date(d).getDay()]}
                {count > 0 && <span style={{ marginLeft: 3, opacity: 0.85 }}>{count}</span>}
              </button>
            )
          })}
        </div>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
          <button
            onClick={() => setMapDay('')}
            title="Показать точки всей недели"
            style={{
              padding: big ? '6px 12px' : '3px 8px', borderRadius: 4, cursor: 'pointer', fontSize: font,
              border: `1px solid ${mapDay === '' ? 'var(--c-primary)' : '#ddd'}`,
              background: mapDay === '' ? 'var(--c-primary)' : '#fff',
              color: mapDay === '' ? '#fff' : 'var(--c-text)',
              fontWeight: mapDay === '' ? 600 : 400,
            }}
          >Вся неделя</button>
          {/* Фильтр по водителю — как в маршрутном листе: посмотреть маршрут
              одного водителя, не отвлекаясь на чужие точки. */}
          <StyledSelect<string>
            value={mapDriverId === null ? '' : String(mapDriverId)}
            width={big ? 220 : 150}
            ariaLabel="Водитель на карте"
            options={[
              { value: '', label: 'Все водители' },
              { value: '0', label: 'Без водителя' },
              ...employees.map(d => ({ value: String(d.id), label: d.name })),
            ]}
            onChange={v => setMapDriverId(v === '' ? null : Number(v))}
          />
        </div>
      </div>
    )
  }

  // Карта. Правка №12: по умолчанию показываем точки ОДНОГО дня — того, что выбран
  // в «Маршрутный лист на». Оператору перед развозкой нужен маршрут конкретной даты,
  // а не облако точек за всю неделю. Режим «вся неделя» остаётся как опция (mapDay = '').
  /**
   * Карточки-кандидаты для карты: неделя + фильтр по водителю, но БЕЗ фильтра
   * по дню. По ним считаются счётчики в панели дней — иначе, выбрав день,
   * оператор видел бы нули у всех остальных.
   */
  const mapCandidateCards = filteredCards.filter(c => {
    if (!c.date || !weekDays.includes(c.date)) return false
    if (c.lat == null || c.lon == null) return false
    if (mapDriverId === null) return true
    if (mapDriverId === 0) return !c.order.assigned_driver_id
    return c.order.assigned_driver_id === mapDriverId
  })

  const visibleMapCards = mapCandidateCards.filter(c => !mapDay || c.date === mapDay)
  const mapPoints: MapPoint[] = visibleMapCards
    .filter(c => c.lat != null && c.lon != null)
    .map(c => {
      // V19 (#7): apartment-suffix к адресу для удобства водителя.
      const apt = c.type === 'pickup' ? c.order.pickup_apartment : c.order.delivery_apartment
      return {
        lat: c.lat as number,
        lon: c.lon as number,
        kind: c.type,
        // Если включена подсветка типа — точки другого типа гасим в серый,
        // но с карты не убираем: оператор видит весь маршрут и понимает, где что.
        color: (mapKindFocus && c.type !== mapKindFocus)
          ? '#c8cdd2'
          : (c.date ? dayColor(c.date) : undefined),
        // Структурные поля — для красивого тултипа: дата → время → № → адрес → имя.
        date: c.date ?? undefined,
        time: c.timeSlot ?? undefined,
        orderNumber: `#${String(c.order.id).padStart(5, '0')}`,
        address: (c.address || '') + (apt ? `, кв. ${apt}` : ''),
        clientName: c.order.client_name,
        // Сохраняем title/description как fallback (вдруг где-то ещё рисуется).
        title: `${c.type === 'pickup' ? 'Забор' : 'Доставка'} #${String(c.order.id).padStart(5, '0')}`,
        description: `${c.order.client_name}${c.address ? ' · ' + c.address : ''}${c.timeSlot ? ' · ' + c.timeSlot : ''}`,
      }
    })

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
              ...allSlotOptions,
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
        {/* Правка №1 (21.08): Неделя / День. Недельный режим оставлен как был. */}
        <div style={{ display: 'inline-flex', border: '1px solid #ddd', borderRadius: 4, overflow: 'hidden' }}>
          {([['week', 'Неделя'], ['day', 'День']] as const).map(([v, label]) => (
            <button
              key={v}
              onClick={() => setViewMode(v)}
              style={{
                padding: '4px 12px', border: 'none', cursor: 'pointer', fontSize: '0.85em',
                background: viewMode === v ? '#3498db' : '#fff',
                color: viewMode === v ? '#fff' : '#555',
                fontWeight: viewMode === v ? 600 : 400,
              }}
            >{label}</button>
          ))}
        </div>
        <span style={{ fontWeight: 600, fontSize: '1.05em' }}>
          {viewMode === 'day'
            ? formatDayHeader(routeDay)
            : `${formatDayHeader(weekDays[0])} — ${formatDayHeader(weekDays[6])}`}
        </span>
        {(weekSummary.pickups > 0 || weekSummary.deliveries > 0) && (
          <span style={{ fontSize: '0.85em', color: '#7f8c8d' }}>
            · {weekSummary.pickups} заборов · {weekSummary.deliveries} доставок
            {weekSummary.busiest && (
              <> · загруженный день — {formatDayHeader((weekSummary.busiest as { day: string }).day)} ({(weekSummary.busiest as { count: number }).count})</>
            )}
          </span>
        )}
        {/* V19 (#6): печать маршрутного листа на конкретный день. */}
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center' }}>
          <label style={{ fontSize: '0.85em', color: '#7f8c8d' }}>Маршрутный лист на:</label>
          <StyledSelect<string>
            value={routeDay}
            onChange={setRouteDay}
            width={190}
            ariaLabel="День маршрутного листа"
            options={weekDays.map(d => ({
              value: d,
              label: formatDayHeader(d),
              hint: (() => {
                const n = filteredCards.filter(c => c.date === d).length
                return n > 0 ? String(n) : undefined
              })(),
            }))}
          />
          <button
            className="btn-secondary btn-sm"
            title={routeDriverId
              ? 'Напечатать маршрутный лист выбранного водителя'
              : 'Напечатать маршрутный лист на выбранный день'}
            onClick={() => printRouteSheet(routeDay, routeCards, routeDriverName)}
          >🖨 Печать</button>
          {/* Правка №2: массовое завершение развозки — оператор закрывает все
              доставки дня из одного окна, без захода в каждую карточку. */}
          {!isReadonly && (
            <button
              className="btn-success btn-sm"
              title="Оплатить и завершить доставки этого дня, не открывая каждый заказ"
              onClick={() => setShowComplete(true)}
            >✓ Завершить развозку</button>
          )}
        </div>
      </div>

      {loading ? (
        <div className="loading">Загрузка...</div>
      ) : viewMode === 'day' ? (
        /* Правка №1 (21.08): развёрнутый список заказов выбранного дня.
           Оператор видит все данные сразу и не открывает карточки по одной.
           Правка №3 (21.08): вкладки водителей — развозку дня можно разделить
           между несколькими и печатать каждому свой лист. */
        <div className="card" style={{ padding: 12 }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10, alignItems: 'center' }}>
            <span style={{ fontSize: '0.85em', color: '#7f8c8d' }}>Водитель:</span>
            {([
              { id: null as number | null, label: `Все · ${driversOfDay.total}` },
              ...driversOfDay.list.map((d: Employee) => ({
                id: d.id as number | null,
                label: `${d.name} · ${filteredCards.filter(c => c.date === routeDay && c.order.assigned_driver_id === d.id).length}`,
              })),
              ...(driversOfDay.unassigned > 0
                ? [{ id: 0 as number | null, label: `Без водителя · ${driversOfDay.unassigned}` }]
                : []),
            ]).map(tab => {
              const active = routeDriverId === tab.id
              return (
                <button
                  key={String(tab.id)}
                  onClick={() => setRouteDriverId(tab.id)}
                  style={{
                    padding: '4px 10px', borderRadius: 4, cursor: 'pointer', fontSize: '0.82em',
                    border: `1px solid ${active ? '#3498db' : '#ddd'}`,
                    background: active ? '#3498db' : '#fff',
                    color: active ? '#fff' : '#2c3e50',
                    fontWeight: active ? 600 : 400,
                  }}
                >{tab.label}</button>
              )
            })}
          </div>

          {routeCards.length === 0 ? (
            <div style={{ padding: 24, textAlign: 'center', color: '#999' }}>
              На эту дату выездов нет.
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.88em' }}>
                <thead>
                  <tr>
                    <th style={{ width: 34 }}>#</th>
                    <th style={{ width: 70 }}>Тип</th>
                    <th style={{ width: 90 }}>Заказ</th>
                    <th>ФИО клиента</th>
                    <th style={{ width: 140 }}>Телефон</th>
                    <th>Адрес</th>
                    <th style={{ width: 110 }}>Слот</th>
                    <th style={{ width: 120 }}>Оплата (предв.)</th>
                    <th>Комментарий</th>
                    <th style={{ width: 160 }}>Водитель</th>
                  </tr>
                </thead>
                <tbody>
                  {routeCards
                    .slice()
                    .sort((a, b) => (a.timeSlot || '').localeCompare(b.timeSlot || ''))
                    .map((c, idx) => {
                      const apt = c.type === 'pickup' ? c.order.pickup_apartment : c.order.delivery_apartment
                      return (
                        <tr
                          key={`${c.order.id}-${c.type}`}
                          style={{ cursor: 'pointer', color: c.archived ? '#7f8c8d' : undefined }}
                          onClick={() => navigate(`/orders/${c.order.id}`)}
                          title="Открыть заказ"
                        >
                          <td>{idx + 1}</td>
                          <td style={{ fontWeight: 600 }}>
                            {c.type === 'pickup' ? 'Забор' : 'Отвоз'}{c.archived ? ' ✓' : ''}
                          </td>
                          <td>{formatOrderNumber(c.order.id, c.order.created_at)}</td>
                          <td>{c.order.client_name}</td>
                          <td>{c.order.client_phone ? formatPhone(c.order.client_phone) : '—'}</td>
                          <td>{(c.address || '—') + (apt ? `, кв. ${apt}` : '')}</td>
                          <td>{c.timeSlot || '—'}</td>
                          <td>
                            {c.order.preliminary_payment_type
                              ? PRELIMINARY_PAYMENT_LABELS[c.order.preliminary_payment_type]
                              : (c.order.payment_type ? PAYMENT_LABELS[c.order.payment_type] : '—')}
                          </td>
                          <td style={{ color: '#555' }}>{c.order.comment || ''}</td>
                          {/* Назначение водителя прямо из списка — основной способ
                              разделить развозку между несколькими водителями. */}
                          <td onClick={e => e.stopPropagation()}>
                            <select
                              value={c.order.assigned_driver_id ?? ''}
                              disabled={isReadonly}
                              onChange={async e => {
                                const v = e.target.value ? Number(e.target.value) : null
                                try {
                                  await setOrderDriver(c.order.id, v)
                                  await reload()
                                } catch { /* ошибку покажет общий обработчик загрузки */ }
                              }}
                              style={{ width: '100%', fontSize: '0.9em', padding: '2px 4px' }}
                            >
                              <option value="">— не назначен —</option>
                              {employees.map(d => (
                                <option key={d.id} value={d.id}>{d.name}</option>
                              ))}
                            </select>
                          </td>
                        </tr>
                      )
                    })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : (
        <>
          {/* Дни недели — горизонтальная сетка из 7 колонок (Пн..Вс).
              Оператор просил календарь СВЕРХУ, а «Без даты» вниз — распределение
              по дням это основная работа, «Без даты» скорее очередь на разбор.
              На узких экранах через CSS сетка переключается на стек (см. .logistics-week-grid). */}
          <div className="logistics-week-grid">
            {weekDays.map(day => renderDaySection(day, formatDayHeader(day), cardsByDay.get(day) || []))}
          </div>

          {/* No-date section с собственным фильтром.
              Блок всегда рендерится — если пуст, это drop-zone с подсказкой
              «перетащите сюда, чтобы снять с даты». */}
          <div style={{ marginTop: 16 }}>
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
                {mapDay ? 'Карта дня' : 'Карта недели'} {mapPoints.length > 0 && <span style={{ color: '#3498db' }}>· {mapPoints.length}</span>}
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
            {renderMapDayStrip(false)}
            {mapPoints.length === 0 ? (
              <div style={{ fontSize: '0.85em', color: '#888', textAlign: 'center', padding: '12px 0' }}>
                {mapDay
                  ? 'Нет заказов с координатами на этот день.'
                  : 'Нет заказов с координатами на этой неделе.'}
              </div>
            ) : (
              <>
                {renderMapLegend(false)}
                {/* Разворачиваем по ДВОЙНОМУ клику: одиночный click срабатывал
                    и после перетаскивания карты — оператор двигал её вбок, отпускал
                    мышь и получал полноэкранный режим вместо нужного участка. */}
                <div
                  onDoubleClick={() => setMapExpanded(true)}
                  title="Двойной клик — развернуть карту"
                  data-tour="logistics-map"
                >
                  <MapMarkers points={mapPoints} height={220} />
                </div>
              </>
            )}
          </div>

          {/* Справочник временных слотов — прямо под картой, в свёрнутом и
              развёрнутом виде страницы. Оператор правит график развозки там же,
              где на неё смотрит, не уходя в Справочники. */}
          <div className="card" style={{ padding: '10px 12px', marginTop: 12 }}>
            {/* Свёрнут по умолчанию: справочник нужен изредка, а развёрнутый
                занимал половину колонки и отжимал карту вниз. */}
            <div style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              gap: 8, flexWrap: 'wrap',
            }}>
              <button
                onClick={() => setSlotsPanelOpen(v => !v)}
                title={slotsPanelOpen ? 'Свернуть' : 'Показать слоты недели'}
                style={{
                  background: 'none', border: 'none', padding: 0, cursor: 'pointer',
                  fontSize: '0.85em', color: '#7f8c8d', textTransform: 'uppercase',
                  letterSpacing: 0.6, fontWeight: 700,
                }}
              >
                {slotsPanelOpen ? '▾' : '▸'} Временные слоты
              </button>
              {!isReadonly && (
                <button
                  className="btn-secondary btn-sm"
                  onClick={() => setAddSlotFor(routeDay)}
                  title="Добавить слот на выбранный день"
                >+ Слот</button>
              )}
            </div>
            {slotsPanelOpen && (
            <>
            <div style={{ fontSize: '0.78em', color: 'var(--c-text-secondary)', margin: '8px 0' }}>
              Постоянные слоты недели и разовые на конкретную дату. Разовый действует
              только в свой день.
            </div>
            {weekDays.map(d => {
              const zones = slotDefsForDate(d, slots)
              return (
                <div key={d} style={{
                  display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap',
                  padding: '4px 0', borderBottom: '1px solid var(--c-bg-hover)',
                }}>
                  <span style={{
                    minWidth: 74, fontSize: '0.8em', fontWeight: 600,
                    color: d === today ? 'var(--c-primary-dark)' : 'var(--c-text)',
                  }}>
                    {DAY_NAMES[new Date(d).getDay()]} {formatShortDate(d)}
                  </span>
                  {zones.length === 0 ? (
                    <span style={{ fontSize: '0.78em', color: 'var(--c-text-muted)' }}>выходной</span>
                  ) : zones.map(z => (
                    <span key={z.value} style={{
                      display: 'inline-flex', alignItems: 'center', gap: 4,
                      padding: '2px 7px', borderRadius: 10, fontSize: '0.76em',
                      // Разовый слот выделяем оранжевым: видно, что он только на эту дату.
                      background: z.oneOffId ? '#fdf2e9' : 'var(--c-primary-light)',
                      color: z.oneOffId ? '#7e5109' : '#1b4f72',
                      border: `1px solid ${z.oneOffId ? '#f5cba7' : '#aed6f1'}`,
                    }}>
                      {z.label}
                      {z.oneOffId != null && !isReadonly && (
                        <button
                          title="Убрать разовый слот"
                          onClick={() => void removeOneOffSlot(z.oneOffId!)}
                          style={{
                            border: 'none', background: 'transparent', cursor: 'pointer',
                            color: '#c0392b', padding: 0, fontSize: '1em', lineHeight: 1,
                          }}
                        >&times;</button>
                      )}
                    </span>
                  ))}
                  {!isReadonly && (
                    <button
                      onClick={() => setAddSlotFor(d)}
                      title={`Добавить слот только на ${d}`}
                      style={{
                        border: '1px solid #ddd', background: '#fff', borderRadius: 4,
                        cursor: 'pointer', fontSize: '0.72em', padding: '1px 6px',
                        color: 'var(--c-primary)', marginLeft: 'auto',
                      }}
                    >+</button>
                  )}
                </div>
              )
            })}
            </>
            )}
          </div>

          {/* Модальное окно с большой картой.
              Условие только на mapExpanded (а не на наличие точек): иначе при
              переключении на день без координат окно схлопывалось само собой. */}
          {mapExpanded && (
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
                  <strong style={{ fontSize: '1.05em' }}>
                    {mapDay ? `Карта дня · ${formatDayHeader(mapDay)}` : 'Карта недели'}
                    <span style={{ color: '#3498db', marginLeft: 8 }}>· {mapPoints.length}</span>
                  </strong>
                  <button className="btn-secondary" onClick={() => setMapExpanded(false)}>Закрыть</button>
                </div>
                {/* Панель дней доступна и на полном экране, крупными кнопками:
                    развернув карту, оператор должен переключать развозки, не
                    закрывая её. */}
                {renderMapDayStrip(true)}
                {renderMapLegend(true)}
                <div style={{ flex: 1, minHeight: 0 }}>
                  {mapPoints.length === 0 ? (
                    <div style={{
                      height: '68vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
                      color: '#888', background: '#f8f9fa', borderRadius: 6,
                    }}>
                      {mapDay
                        ? 'Нет заказов с координатами на этот день.'
                        : 'Нет заказов с координатами на этой неделе.'}
                    </div>
                  ) : (
                    <MapMarkers points={mapPoints} height={'68vh'} />
                  )}
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

      {/* Правка №2: массовое завершение развозки за выбранный день.
          Берём доставки этого дня с учётом активных фильтров — оператор часто
          закрывает развозку по конкретному району. */}
      {/* Заказ поставили в слот, а адреса нет — просим ввести сразу. */}
      {addressFor && (
        <MissingAddressModal
          order={addressFor.order}
          type={addressFor.type}
          onClose={() => setAddressFor(null)}
          onSaved={async () => { await reload() }}
        />
      )}
      {/* V31: добавление разового слота на конкретную дату. */}
      {addSlotFor && (
        <AddOneOffSlotModal
          date={addSlotFor}
          onClose={() => setAddSlotFor(null)}
          onSave={async (start, end, label) => {
            await addOneOffSlot(addSlotFor, start, end, label)
            setAddSlotFor(null)
          }}
        />
      )}
      {showComplete && (
        <CompleteDeliveriesModal
          date={routeDay}
          rows={filteredCards
            .filter(c => c.type === 'delivery' && c.date === routeDay && !c.order.paid)
            .map(c => ({ order: c.order, address: c.address, timeSlot: c.timeSlot }))}
          onClose={() => setShowComplete(false)}
          onFinished={(changed) => { if (changed) void reload() }}
        />
      )}
    </div>
  )
}
