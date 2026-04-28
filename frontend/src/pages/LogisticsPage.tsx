import { useEffect, useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { getOrders, updateActualDates } from '../api/orders'
import type { Order } from '../types'

type ViewMode = 'all' | 'pickup' | 'delivery'
type CardType = 'pickup' | 'delivery'

interface OrderCard {
  order: Order
  type: CardType
  date: string | null  // actual date
  timeSlot: string | null
  district: string | null
  address: string | null
}

const DAY_NAMES = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб']

const TIME_SLOTS = [
  { label: 'Все', value: '' },
  { label: '8:00–12:00', value: '08:00-12:00' },
  { label: '12:00–18:00', value: '12:00-18:00' },
  { label: '18:00–22:00', value: '18:00-22:00' },
]

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

function formatOrderNumber(id: number, createdAt: string): string {
  return `${String(id).padStart(5, '0')} от ${new Date(createdAt).toLocaleDateString('ru')}`
}

export default function LogisticsPage() {
  const navigate = useNavigate()
  const [weekStart, setWeekStart] = useState(() => getMonday(new Date().toISOString().slice(0,10)))
  const [viewMode, setViewMode] = useState<ViewMode>('all')
  const [districtFilter, setDistrictFilter] = useState('')
  const [timeSlotFilter, setTimeSlotFilter] = useState('')
  const [allOrders, setAllOrders] = useState<Order[]>([])
  const [loading, setLoading] = useState(false)
  const [dragData, setDragData] = useState<{orderId: number, type: CardType} | null>(null)

  const weekDays = useMemo(() => getWeekDays(weekStart), [weekStart])

  useEffect(() => {
    const load = async () => {
      setLoading(true)
      try {
        const [leads, created, forPickup, inProgress, partiallyDone, done] = await Promise.all([
          getOrders('LEAD', 0, 200),
          getOrders('CREATED', 0, 200),
          getOrders('FOR_PICKUP', 0, 200),
          getOrders('IN_PROGRESS', 0, 200),
          getOrders('PARTIALLY_DONE', 0, 200),
          getOrders('DONE', 0, 200),
        ])
        setAllOrders([...leads, ...created, ...forPickup, ...inProgress, ...partiallyDone, ...done])
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
    // Also show IN_PROGRESS and PARTIALLY_DONE as potential pickups if they have pickup dates

    allOrders.forEach(o => {
      if (pickupStatuses.has(o.status) || ((o.actual_pickup_date || o.pickup_date) && !deliveryStatuses.has(o.status))) {
        if (viewMode === 'all' || viewMode === 'pickup') {
          cards.push({
            order: o,
            type: 'pickup',
            date: o.actual_pickup_date,
            timeSlot: o.actual_pickup_time_slot,
            district: o.pickup_district,
            address: o.pickup_address || o.client_address,
          })
        }
      }
      if (deliveryStatuses.has(o.status)) {
        if (viewMode === 'all' || viewMode === 'delivery') {
          cards.push({
            order: o,
            type: 'delivery',
            date: o.actual_delivery_date,
            timeSlot: o.actual_delivery_time_slot,
            district: o.delivery_district,
            address: o.delivery_address || o.client_address,
          })
        }
      }
    })
    return cards
  }, [allOrders, viewMode])

  // Apply filters
  const filteredCards = useMemo(() => {
    return allCards.filter(c => {
      if (districtFilter && c.district !== districtFilter) return false
      if (timeSlotFilter && c.timeSlot !== timeSlotFilter) return false
      return true
    })
  }, [allCards, districtFilter, timeSlotFilter])

  // Group by day
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
      // Cards outside the visible week are not shown
    })
    return map
  }, [filteredCards, weekDays])

  // All districts for filter
  const allDistricts = useMemo(() => {
    const set = new Set<string>()
    allCards.forEach(c => { if (c.district) set.add(c.district) })
    return Array.from(set).sort()
  }, [allCards])

  // District stats for the visible week
  const districtStats = useMemo(() => {
    const visibleCards = filteredCards.filter(c => c.date && weekDays.includes(c.date))
    const map = new Map<string, {district: string, pickups: number, deliveries: number, sum: number}>()
    visibleCards.forEach(c => {
      const d = c.district || '(без района)'
      if (!map.has(d)) map.set(d, {district: d, pickups: 0, deliveries: 0, sum: 0})
      const s = map.get(d)!
      if (c.type === 'pickup') s.pickups++; else s.deliveries++
      s.sum += Number(c.order.total_amount)
    })
    return Array.from(map.values()).sort((a,b) => (b.pickups+b.deliveries) - (a.pickups+a.deliveries))
  }, [filteredCards, weekDays])

  // Drag handlers
  const handleDragStart = (orderId: number, type: CardType) => {
    setDragData({orderId, type})
  }
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
  }
  const handleDrop = async (targetDate: string) => {
    if (!dragData) return
    const {orderId, type} = dragData
    setDragData(null)
    try {
      if (type === 'pickup') {
        await updateActualDates(orderId, { actual_pickup_date: targetDate })
      } else {
        await updateActualDates(orderId, { actual_delivery_date: targetDate })
      }
      // Update local state
      setAllOrders(prev => prev.map(o => {
        if (o.id !== orderId) return o
        if (type === 'pickup') return {...o, actual_pickup_date: targetDate}
        return {...o, actual_delivery_date: targetDate}
      }))
    } catch { /* ignore */ }
  }

  const prevWeek = () => {
    const d = new Date(weekStart)
    d.setDate(d.getDate() - 7)
    setWeekStart(d.toISOString().slice(0,10))
  }
  const nextWeek = () => {
    const d = new Date(weekStart)
    d.setDate(d.getDate() + 7)
    setWeekStart(d.toISOString().slice(0,10))
  }
  const goToday = () => setWeekStart(getMonday(new Date().toISOString().slice(0,10)))

  const today = new Date().toISOString().slice(0,10)

  const renderCard = (card: OrderCard) => {
    const isPickup = card.type === 'pickup'
    return (
      <div
        key={`${card.order.id}-${card.type}`}
        draggable
        onDragStart={() => handleDragStart(card.order.id, card.type)}
        onClick={() => navigate(`/orders/${card.order.id}`)}
        style={{
          padding: '8px 12px',
          marginBottom: 6,
          borderRadius: 6,
          borderLeft: `4px solid ${isPickup ? '#3498db' : '#27ae60'}`,
          background: '#fff',
          boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
          cursor: 'grab',
          fontSize: '0.9em',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <strong>{formatOrderNumber(card.order.id, card.order.created_at)}</strong>
          <span style={{
            fontSize: '0.75em', padding: '2px 6px', borderRadius: 3,
            background: isPickup ? '#ebf5fb' : '#eafaf1',
            color: isPickup ? '#2980b9' : '#27ae60',
            fontWeight: 600,
          }}>
            {isPickup ? 'Забор' : 'Доставка'}
          </span>
        </div>
        <div style={{ color: '#555', marginTop: 2 }}>{card.order.client_name}</div>
        {card.address && <div style={{ marginTop: 2, fontSize: '0.85em', color: '#666' }}>{card.address}</div>}
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 2, fontSize: '0.85em' }}>
          <span style={{ color: card.district ? '#2c3e50' : '#ccc', fontWeight: card.district ? 600 : 400 }}>
            {card.district || 'район не указан'}
          </span>
          <span style={{ color: '#888' }}>{card.timeSlot || ''}</span>
        </div>
        <div style={{ marginTop: 2, fontWeight: 600 }}>{Number(card.order.total_amount).toFixed(2)} &#8381;</div>
      </div>
    )
  }

  const renderDaySection = (dateStr: string, label: string, cards: OrderCard[]) => {
    const isToday = dateStr === today
    return (
      <div
        key={dateStr}
        onDragOver={handleDragOver}
        onDrop={() => { if (dateStr !== 'no-date') void handleDrop(dateStr) }}
        style={{
          padding: '12px 16px',
          marginBottom: 8,
          borderRadius: 8,
          background: isToday ? '#fffde7' : '#fafafa',
          border: isToday ? '2px solid #f9a825' : '1px solid #e0e0e0',
          minHeight: 60,
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <strong style={{ fontSize: '1.05em' }}>
            {label}
            {isToday && <span style={{ marginLeft: 8, fontSize: '0.8em', color: '#f9a825' }}>(сегодня)</span>}
          </strong>
          <span style={{ fontSize: '0.85em', color: '#888' }}>{cards.length} заказов</span>
        </div>
        {cards.length === 0 ? (
          <div style={{ color: '#bbb', fontStyle: 'italic', fontSize: '0.9em' }}>
            Перетащите заказ сюда
          </div>
        ) : (
          cards.map(renderCard)
        )}
      </div>
    )
  }

  return (
    <div>
      <div className="page-header">
        <h1>Логистика</h1>
      </div>

      {/* Filters */}
      <div className="filters">
        <div className="form-group">
          <label>Тип</label>
          <select value={viewMode} onChange={e => setViewMode(e.target.value as ViewMode)}>
            <option value="all">Все</option>
            <option value="pickup">Заборы</option>
            <option value="delivery">Доставки</option>
          </select>
        </div>
        <div className="form-group">
          <label>Район</label>
          <select value={districtFilter} onChange={e => setDistrictFilter(e.target.value)}>
            <option value="">Все районы</option>
            {allDistricts.map(d => <option key={d} value={d}>{d}</option>)}
          </select>
        </div>
        <div className="form-group">
          <label>Временной слот</label>
          <select value={timeSlotFilter} onChange={e => setTimeSlotFilter(e.target.value)}>
            {TIME_SLOTS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
        </div>
      </div>

      {/* Week navigation */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
        <button className="btn-secondary btn-sm" onClick={prevWeek}>&larr; Пред. неделя</button>
        <button className="btn-secondary btn-sm" onClick={goToday}>Сегодня</button>
        <button className="btn-secondary btn-sm" onClick={nextWeek}>След. неделя &rarr;</button>
        <span style={{ fontWeight: 600, fontSize: '1.1em' }}>
          {formatDayHeader(weekDays[0])} — {formatDayHeader(weekDays[6])}
        </span>
      </div>

      {loading ? (
        <div className="loading">Загрузка...</div>
      ) : (
        <>
          {/* No-date section */}
          {(cardsByDay.get('no-date')?.length ?? 0) > 0 && (
            <div style={{ marginBottom: 16 }}>
              {renderDaySection('no-date', 'Без даты (назначьте перетаскиванием)', cardsByDay.get('no-date') || [])}
            </div>
          )}

          {/* Week days */}
          {weekDays.map(day => renderDaySection(day, formatDayHeader(day), cardsByDay.get(day) || []))}

          {/* District summary */}
          {districtStats.length > 0 && (
            <div className="card" style={{ marginTop: 16 }}>
              <h2 style={{ marginTop: 0 }}>Сводка по районам за неделю</h2>
              <table>
                <thead>
                  <tr><th>Район</th><th>Заборы</th><th>Доставки</th><th>Всего</th><th>Сумма</th></tr>
                </thead>
                <tbody>
                  {districtStats.map(s => (
                    <tr key={s.district} style={{cursor:'pointer'}} onClick={() => setDistrictFilter(s.district === '(без района)' ? '' : s.district)}>
                      <td><strong>{s.district}</strong></td>
                      <td>{s.pickups || '\u2014'}</td>
                      <td>{s.deliveries || '\u2014'}</td>
                      <td><strong>{s.pickups + s.deliveries}</strong></td>
                      <td>{s.sum.toFixed(2)} &#8381;</td>
                    </tr>
                  ))}
                  <tr style={{ background: '#f0f0f0', fontWeight: 700 }}>
                    <td>Итого</td>
                    <td>{districtStats.reduce((a,s) => a+s.pickups, 0)}</td>
                    <td>{districtStats.reduce((a,s) => a+s.deliveries, 0)}</td>
                    <td>{districtStats.reduce((a,s) => a+s.pickups+s.deliveries, 0)}</td>
                    <td>{districtStats.reduce((a,s) => a+s.sum, 0).toFixed(2)} &#8381;</td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  )
}
