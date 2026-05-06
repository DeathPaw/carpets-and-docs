import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  getProductionQueue, getProductionQueueItems, getProductionQueueServices,
  type ProductionQueueItem, type ProductionQueueService,
} from '../api/analytics'
import { updateServiceStatus } from '../api/services'
import { getEmployees, getItemTypes } from '../api/references'
import { useToast } from '../components/Toast'
import MultiSelectFilter from '../components/MultiSelectFilter'
import type { Employee, ItemType, ServiceStatus } from '../types'

interface QueueOrder {
  order_id: number
  client_name: string
  status: string
  created_at: string
  total_amount: number
  pickup_district: string
  items_count: number
  services_count: number
  services_done: number
}

type Mode = 'orders' | 'items' | 'services'

const ORDER_STATUS_LABELS: Record<string, string> = {
  FOR_PICKUP: 'К забору',
  IN_PROGRESS: 'В работе',
  PARTIALLY_DONE: 'Частично готово',
}
const ITEM_STATUS_LABELS: Record<string, string> = {
  CREATED: 'Создана',
  IN_PROGRESS: 'В работе',
  PARTIALLY_DONE: 'Частично готова',
}
/** Для услуг — три колонки. Стиль такой же чтобы оператор видел знакомую раскладку. */
const SERVICE_STATUS_LABELS: Record<string, string> = {
  CREATED: 'Создана',
  IN_PROGRESS: 'В работе',
  DONE: 'Готова',
}

const COLUMN_COLORS: Record<string, string> = {
  FOR_PICKUP: '#17a2b8',
  IN_PROGRESS: '#f39c12',
  PARTIALLY_DONE: '#e67e22',
  CREATED: '#17a2b8',
  DONE: '#27ae60',
}

const ORDER_COLUMNS:   string[] = ['FOR_PICKUP', 'IN_PROGRESS', 'PARTIALLY_DONE']
const ITEM_COLUMNS:    string[] = ['CREATED',    'IN_PROGRESS', 'PARTIALLY_DONE']
const SERVICE_COLUMNS: string[] = ['CREATED',    'IN_PROGRESS', 'DONE']

export default function ProductionPage() {
  const navigate = useNavigate()
  const { showToast } = useToast()
  const [mode, setMode] = useState<Mode>(() => (localStorage.getItem('production_mode') as Mode) || 'orders')
  const [orders, setOrders] = useState<QueueOrder[]>([])
  const [items, setItems] = useState<ProductionQueueItem[]>([])
  const [services, setServices] = useState<ProductionQueueService[]>([])
  const [loading, setLoading] = useState(true)
  // Справочники (для фильтров режима услуг).
  const [employees, setEmployees] = useState<Employee[]>([])
  const [itemTypes, setItemTypes] = useState<ItemType[]>([])
  // Фильтры режима «По услугам».
  const [employeeFilters, setEmployeeFilters] = useState<number[]>([])
  const [itemTypeFilters, setItemTypeFilters] = useState<number[]>([])
  // Раньше — одиночный <select>; сейчас мультивыбор с поиском, как в OrdersPage.
  // Состояние массив строк (имён услуг), фильтр срабатывает если массив непуст.
  const [serviceNameFilter, setServiceNameFilter] = useState<string[]>([])
  const [orderIdFilter, setOrderIdFilter] = useState<string>('')
  const [districtFilter, setDistrictFilter] = useState<string[]>([])
  // Drag-state.
  const [dragServiceId, setDragServiceId] = useState<number | null>(null)
  const [dragOverColumn, setDragOverColumn] = useState<string | null>(null)

  useEffect(() => { localStorage.setItem('production_mode', mode) }, [mode])

  // Справочники подгружаем один раз — нужны только в режиме услуг.
  useEffect(() => {
    Promise.all([getEmployees().catch(() => []), getItemTypes().catch(() => [])])
      .then(([emps, types]) => { setEmployees(emps); setItemTypes(types) })
  }, [])

  /** Перезагрузка данных режима. Используется при смене режима и после drop-операций. */
  const reload = (m: Mode = mode) => {
    setLoading(true)
    if (m === 'orders') {
      getProductionQueue().then(setOrders).catch(() => {}).finally(() => setLoading(false))
    } else if (m === 'items') {
      getProductionQueueItems().then(setItems).catch(() => {}).finally(() => setLoading(false))
    } else {
      getProductionQueueServices().then(setServices).catch(() => {}).finally(() => setLoading(false))
    }
  }

  useEffect(() => { reload(mode) }, [mode])

  const labels = mode === 'orders' ? ORDER_STATUS_LABELS
    : mode === 'items' ? ITEM_STATUS_LABELS
    : SERVICE_STATUS_LABELS
  const columns = mode === 'orders' ? ORDER_COLUMNS
    : mode === 'items' ? ITEM_COLUMNS
    : SERVICE_COLUMNS

  // Список уникальных названий услуг и районов — для фильтров.
  const allServiceNames = useMemo(() => {
    const set = new Set<string>()
    services.forEach(s => set.add(s.service_name))
    return Array.from(set).sort()
  }, [services])
  const allDistricts = useMemo(() => {
    const set = new Set<string>()
    services.forEach(s => { if (s.pickup_district) set.add(s.pickup_district) })
    return Array.from(set).sort()
  }, [services])

  /** Применение фильтров услуг. */
  const filteredServices = useMemo(() => {
    return services.filter(s => {
      if (employeeFilters.length > 0) {
        // Услуга проходит, если хотя бы один её исполнитель в списке выбранных.
        const ok = s.employee_ids.some(id => employeeFilters.includes(id))
        if (!ok) return false
      }
      if (itemTypeFilters.length > 0 && !itemTypeFilters.includes(s.item_type_id)) return false
      if (serviceNameFilter.length > 0 && !serviceNameFilter.includes(s.service_name)) return false
      if (districtFilter.length > 0 && !districtFilter.includes(s.pickup_district || '')) return false
      if (orderIdFilter) {
        const target = orderIdFilter.replace(/^0+/, '')
        if (String(s.order_id) !== target) return false
      }
      return true
    })
  }, [services, employeeFilters, itemTypeFilters, serviceNameFilter, districtFilter, orderIdFilter])

  /** Drag-n-drop статуса услуги. Бэк сам валидирует переход; мы показываем причину если он отклонил. */
  const handleServiceDrop = async (targetStatus: string) => {
    if (dragServiceId == null) return
    const svc = services.find(s => s.service_id === dragServiceId)
    setDragServiceId(null)
    setDragOverColumn(null)
    if (!svc) return
    if (svc.status === targetStatus) return // ничего не делаем — drop в ту же колонку
    try {
      await updateServiceStatus(svc.order_id, svc.item_id, svc.service_id, {
        status: targetStatus as ServiceStatus,
      })
      // Обновляем локально без полной перезагрузки.
      setServices(prev => prev.map(s => s.service_id === svc.service_id ? { ...s, status: targetStatus } : s))
    } catch (e: unknown) {
      // Бэк возвращает понятное сообщение в response.data.message — например
      // «не назначен исполнитель» или «не заполнены размеры».
      const msg = (e as any)?.response?.data?.message || 'Не удалось сменить статус услуги'
      showToast(msg, 'error')
    }
  }

  /** Активны ли какие-нибудь фильтры услуг. */
  const hasServiceFilters =
    employeeFilters.length > 0 || itemTypeFilters.length > 0
    || serviceNameFilter.length > 0 || districtFilter.length > 0 || orderIdFilter !== ''

  return (
    <div>
      <div className="page-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
        <h1>Производство</h1>
        <div style={{ display: 'inline-flex', border: '1px solid #ddd', borderRadius: 6, overflow: 'hidden' }}>
          {([
            { v: 'orders' as Mode,   label: 'По заказам' },
            { v: 'items' as Mode,    label: 'По позициям' },
            { v: 'services' as Mode, label: 'По услугам' },
          ]).map(m => (
            <button
              key={m.v}
              onClick={() => setMode(m.v)}
              style={{
                padding: '6px 14px', cursor: 'pointer', border: 'none',
                background: mode === m.v ? '#3498db' : '#fff',
                color: mode === m.v ? '#fff' : '#333',
              }}
            >{m.label}</button>
          ))}
        </div>
      </div>

      {/* Фильтры — только в режиме услуг. По заказам/позициям пока без фильтров (стандартное поведение). */}
      {mode === 'services' && (
        <div className="filters" style={{ marginBottom: 12 }}>
          <div className="form-group">
            <label>Сотрудник</label>
            <MultiSelectFilter
              options={employees.map(e => ({ value: String(e.id), label: e.name }))}
              searchable
              value={employeeFilters.map(String)}
              onChange={vals => setEmployeeFilters(vals.map(Number))}
              placeholder="Все"
              width={200}
            />
          </div>
          <div className="form-group">
            <label>Тип позиции</label>
            <MultiSelectFilter
              options={itemTypes.map(t => ({ value: String(t.id), label: t.name }))}
              searchable
              value={itemTypeFilters.map(String)}
              onChange={vals => setItemTypeFilters(vals.map(Number))}
              placeholder="Все"
              width={180}
            />
          </div>
          <div className="form-group">
            <label>Услуга</label>
            <MultiSelectFilter
              options={allServiceNames.map(n => ({ value: n, label: n }))}
              searchable
              value={serviceNameFilter}
              onChange={setServiceNameFilter}
              placeholder="Все"
              width={180}
            />
          </div>
          <div className="form-group">
            <label>Район</label>
            <MultiSelectFilter
              options={allDistricts.map(d => ({ value: d, label: d }))}
              searchable
              value={districtFilter}
              onChange={setDistrictFilter}
              placeholder="Все"
              width={180}
            />
          </div>
          <div className="form-group">
            <label>№ заказа</label>
            <input
              type="number"
              value={orderIdFilter}
              onChange={e => setOrderIdFilter(e.target.value)}
              placeholder="Номер"
              style={{ width: 110 }}
            />
          </div>
          {hasServiceFilters && (
            <button
              className="btn-secondary"
              style={{ alignSelf: 'flex-end' }}
              onClick={() => {
                setEmployeeFilters([]); setItemTypeFilters([])
                setServiceNameFilter([]); setDistrictFilter([]); setOrderIdFilter('')
              }}
            >
              Сбросить
            </button>
          )}
        </div>
      )}

      {/* Подсказка про drag-n-drop статуса услуг — единственный режим где это активно. */}
      {mode === 'services' && (
        <div style={{ color: '#7f8c8d', fontSize: '0.85em', marginBottom: 8 }}>
          Перетащите карточку в нужный столбец — статус услуги изменится. Если переход
          невозможен (нет исполнителя, не заполнены размеры) — снизу появится подсказка с причиной.
        </div>
      )}

      {loading ? (
        <div className="loading">Загрузка...</div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16, alignItems: 'flex-start' }}>
          {columns.map(status => {
            const colData = mode === 'orders'
              ? orders.filter(o => o.status === status).sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
              : mode === 'items'
                ? items.filter(i => i.status === status).sort((a, b) => new Date(a.order_created_at).getTime() - new Date(b.order_created_at).getTime())
                : filteredServices.filter(s => s.status === status).sort((a, b) => new Date(a.order_created_at).getTime() - new Date(b.order_created_at).getTime())

            const isDropTarget = mode === 'services' && dragServiceId != null
            const isDropHover = isDropTarget && dragOverColumn === status

            return (
              <div
                key={status}
                onDragOver={isDropTarget ? e => { e.preventDefault(); e.dataTransfer.dropEffect = 'move' } : undefined}
                onDragEnter={isDropTarget ? () => setDragOverColumn(status) : undefined}
                onDragLeave={isDropTarget ? (e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragOverColumn(null) } : undefined}
                onDrop={isDropTarget ? () => void handleServiceDrop(status) : undefined}
              >
                <div style={{
                  background: COLUMN_COLORS[status] || '#7f8c8d',
                  color: '#fff', padding: '10px 16px',
                  borderRadius: '8px 8px 0 0', fontWeight: 700, fontSize: 15,
                  display: 'flex', justifyContent: 'space-between',
                }}>
                  <span>{labels[status] || status}</span>
                  <span style={{ opacity: 0.8 }}>{colData.length}</span>
                </div>
                <div style={{
                  background: isDropHover ? '#ebf5fb' : '#f8f9fa',
                  borderRadius: '0 0 8px 8px',
                  padding: 8, minHeight: 200,
                  border: isDropHover ? '2px dashed #3498db' : '2px solid transparent',
                  transition: 'background 0.15s ease, border-color 0.15s ease',
                }}>
                  {colData.length === 0 ? (
                    <div style={{ color: '#999', textAlign: 'center', padding: 24 }}>
                      {mode === 'services' && isDropTarget ? 'Отпустите для перевода' : 'Нет данных'}
                    </div>
                  ) : mode === 'orders' ? (
                    (colData as QueueOrder[]).map(item => (
                      <div
                        key={item.order_id}
                        onClick={() => navigate(`/orders/${item.order_id}`)}
                        style={{
                          background: '#fff', borderRadius: 6, padding: '10px 12px',
                          marginBottom: 8, cursor: 'pointer',
                          borderLeft: `4px solid ${COLUMN_COLORS[status] || '#7f8c8d'}`,
                          boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                          <strong style={{ fontSize: 14 }}>#{String(item.order_id).padStart(5, '0')}</strong>
                          <span style={{ fontSize: 12, color: '#888' }}>{new Date(item.created_at).toLocaleDateString('ru')}</span>
                        </div>
                        <div style={{ fontSize: 13, marginBottom: 4 }}>{item.client_name}</div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#666' }}>
                          <span>{item.items_count} поз.</span>
                          <span style={{
                            color: item.services_done === item.services_count ? '#27ae60' : '#f39c12',
                            fontWeight: 600,
                          }}>
                            {item.services_done}/{item.services_count} услуг
                          </span>
                        </div>
                        {item.pickup_district && (
                          <div style={{ fontSize: 11, color: '#999', marginTop: 2 }}>{item.pickup_district}</div>
                        )}
                      </div>
                    ))
                  ) : mode === 'items' ? (
                    (colData as ProductionQueueItem[]).map(it => (
                      <div
                        key={it.item_id}
                        onClick={() => navigate(`/items/${it.item_id}`)}
                        style={{
                          background: '#fff', borderRadius: 6, padding: '10px 12px',
                          marginBottom: 8, cursor: 'pointer',
                          borderLeft: `4px solid ${COLUMN_COLORS[status] || '#7f8c8d'}`,
                          boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
                        }}
                        title="Открыть позицию"
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                          <strong style={{ fontSize: 14 }}>Поз. #{it.item_id}</strong>
                          <span style={{ fontSize: 12, color: '#888' }}>заказ #{String(it.order_id).padStart(5, '0')}</span>
                        </div>
                        <div style={{ fontSize: 13, marginBottom: 2 }}>{it.item_type_name || `Тип`}</div>
                        {it.description && (
                          <div style={{ fontSize: 12, color: '#666', marginBottom: 4 }}>{it.description}</div>
                        )}
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#666' }}>
                          <span>{it.client_name}</span>
                          <span style={{
                            color: it.services_done === it.services_count ? '#27ae60' : '#f39c12',
                            fontWeight: 600,
                          }}>
                            {it.services_done}/{it.services_count} услуг
                          </span>
                        </div>
                        {it.pickup_district && (
                          <div style={{ fontSize: 11, color: '#999', marginTop: 2 }}>{it.pickup_district}</div>
                        )}
                      </div>
                    ))
                  ) : (
                    /* Режим: По услугам — карточки услуг с drag-n-drop. */
                    (colData as ProductionQueueService[]).map(s => (
                      <div
                        key={s.service_id}
                        draggable
                        onDragStart={() => setDragServiceId(s.service_id)}
                        onDragEnd={() => { setDragServiceId(null); setDragOverColumn(null) }}
                        onClick={() => navigate(`/orders/${s.order_id}`)}
                        title="Перетащите для смены статуса · Клик — открыть заказ"
                        style={{
                          background: '#fff', borderRadius: 6, padding: '10px 12px',
                          marginBottom: 8, cursor: 'grab',
                          borderLeft: `4px solid ${COLUMN_COLORS[status] || '#7f8c8d'}`,
                          boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
                          opacity: dragServiceId === s.service_id ? 0.5 : 1,
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
                          <strong style={{ fontSize: 14 }}>{s.service_name}</strong>
                          <span style={{ fontSize: 12, color: '#888', whiteSpace: 'nowrap' }}>
                            {Number(s.price).toFixed(0)} ₽
                          </span>
                        </div>
                        <div style={{ fontSize: 12, color: '#555', marginBottom: 2 }}>
                          {s.item_type_name || 'позиция'}
                          {s.item_description ? ` · ${s.item_description}` : ''}
                        </div>
                        <div style={{ fontSize: 12, color: '#7f8c8d', marginBottom: 2 }}>
                          Заказ #{String(s.order_id).padStart(5, '0')} · поз. #{s.position_in_order} · {s.client_name}
                        </div>
                        {s.employee_names ? (
                          <div style={{ fontSize: 11, color: '#27ae60' }}>👤 {s.employee_names}</div>
                        ) : (
                          <div style={{ fontSize: 11, color: '#e67e22' }}>исполнитель не назначен</div>
                        )}
                        {s.pickup_district && (
                          <div style={{ fontSize: 11, color: '#999', marginTop: 2 }}>{s.pickup_district}</div>
                        )}
                      </div>
                    ))
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
