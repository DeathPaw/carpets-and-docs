import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  getProductionQueue, getProductionQueueItems, getProductionQueueServices,
  type ProductionQueueItem, type ProductionQueueService,
} from '../api/analytics'
import { updateServiceStatus, assignServiceEmployees } from '../api/services'
import { getEmployees, getEmployeesSuitableFor, getItemTypes } from '../api/references'
import { useToast } from '../components/Toast'
import MultiSelectFilter from '../components/MultiSelectFilter'
import PageFilterBar from '../components/PageFilterBar'
import { hashColor } from '../components/Tiles'
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
  // Модалка выбора исполнителя при перетаскивании в IN_PROGRESS, когда у услуги
  // ещё нет назначения (Спринт D, фидбэк 11 мая: «не дает переставить если не
  // указан исполнитель — давай вместо ошибки открывать pop up»).
  const [assigneePicker, setAssigneePicker] = useState<{ svc: ProductionQueueService; targetStatus: string } | null>(null)
  const [pickerEmployees, setPickerEmployees] = useState<Employee[]>([])
  // Фильтр «только без исполнителя».
  const [onlyUnassigned, setOnlyUnassigned] = useState(false)
  // V10/V11/V13: универсальный поиск — работает во всех 3 режимах (по заказам/позициям/услугам).
  // Ищет по имени клиента (подстрока), телефону (последние цифры), legacy ID.
  const [searchText, setSearchText] = useState('')

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
  // Районы собираем из всех трёх наборов: фильтр теперь общий для режимов,
  // и в «По заказам» список не должен быть пустым только потому, что услуги не загружены.
  const allDistricts = useMemo(() => {
    const set = new Set<string>()
    services.forEach(s => { if (s.pickup_district) set.add(s.pickup_district) })
    items.forEach(i => { if (i.pickup_district) set.add(i.pickup_district) })
    orders.forEach(o => { if (o.pickup_district) set.add(o.pickup_district) })
    return Array.from(set).sort()
  }, [services, items, orders])

  /**
   * V13: универсальный текстовый поиск по клиенту/legacy ID. Используется во всех 3 режимах.
   * - Имя клиента: case-insensitive substring.
   * - Телефон: последние 10 цифр (формат не важен).
   * - Legacy ID: точное совпадение чисел.
   */
  const matchesSearch = (clientName: string | null | undefined,
                         clientPhone: string | null | undefined,
                         legacyId: number | null | undefined): boolean => {
    if (!searchText.trim()) return true
    const q = searchText.trim().toLowerCase()
    if (clientName && clientName.toLowerCase().includes(q)) return true
    if (clientPhone) {
      const phoneDigits = clientPhone.replace(/\D/g, '')
      const qDigits = q.replace(/\D/g, '')
      if (qDigits && phoneDigits.includes(qDigits)) return true
    }
    if (legacyId != null && String(legacyId).includes(q)) return true
    return false
  }

  /** Применение фильтров услуг. */
  const filteredServices = useMemo(() => {
    return services.filter(s => {
      // Спринт D: отдельный фильтр «только без исполнителя».
      if (onlyUnassigned && s.employee_ids.length > 0) return false
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
      if (!matchesSearch(s.client_name, s.client_phone, s.legacy_id)) return false
      return true
    })
  }, [services, employeeFilters, itemTypeFilters, serviceNameFilter, districtFilter, orderIdFilter, onlyUnassigned, searchText])

  /** № заказа из фильтра, без ведущих нулей: оператор вводит и «7», и «00007». */
  const orderIdTarget = orderIdFilter.replace(/^0+/, '')

  const filteredOrders = useMemo(() =>
    orders.filter(o => {
      if (!matchesSearch(o.client_name, (o as any).client_phone, (o as any).legacy_id)) return false
      if (orderIdTarget && String(o.order_id) !== orderIdTarget) return false
      // У заказа район забора лежит в pickup_district.
      if (districtFilter.length > 0 && !districtFilter.includes(o.pickup_district || '')) return false
      return true
    }),
  [orders, searchText, orderIdTarget, districtFilter])

  const filteredItems = useMemo(() =>
    items.filter(it => {
      if (!matchesSearch(it.client_name, (it as any).client_phone, (it as any).legacy_id)) return false
      if (orderIdTarget && String(it.order_id) !== orderIdTarget) return false
      if (districtFilter.length > 0 && !districtFilter.includes(it.pickup_district || '')) return false
      // У позиции из очереди производства есть только имя типа, не id —
      // сопоставляем выбранные типы по имени через справочник itemTypes.
      if (itemTypeFilters.length > 0) {
        const names = itemTypes.filter(t => itemTypeFilters.includes(t.id)).map(t => t.name)
        if (!names.includes(it.item_type_name || '')) return false
      }
      return true
    }),
  [items, searchText, orderIdTarget, districtFilter, itemTypeFilters, itemTypes])

  /** Drag-n-drop статуса услуги. Бэк сам валидирует переход; мы показываем причину если он отклонил.
   *  Особый случай: drop в IN_PROGRESS на услуге без assignee — открываем модалку
   *  выбора сотрудника (Спринт D), назначаем + переводим статус единым актом. */
  const handleServiceDrop = async (targetStatus: string) => {
    if (dragServiceId == null) return
    const svc = services.find(s => s.service_id === dragServiceId)
    setDragServiceId(null)
    setDragOverColumn(null)
    if (!svc) return
    if (svc.status === targetStatus) return // ничего не делаем — drop в ту же колонку

    // Если перетаскиваем в работу/готово, а исполнителей нет — спросим у оператора.
    if ((targetStatus === 'IN_PROGRESS' || targetStatus === 'DONE') && svc.employee_ids.length === 0) {
      try {
        const list = await getEmployeesSuitableFor(svc.item_type_id)
        setPickerEmployees(list.filter(e => e.active))
        setAssigneePicker({ svc, targetStatus })
      } catch {
        showToast('Не удалось загрузить список сотрудников', 'error')
      }
      return
    }
    await applyStatusChange(svc, targetStatus)
  }

  /** Применить смену статуса услуги (с уже назначенным исполнителем). */
  const applyStatusChange = async (svc: ProductionQueueService, targetStatus: string) => {
    try {
      await updateServiceStatus(svc.order_id, svc.item_id, svc.service_id, {
        status: targetStatus as ServiceStatus,
      })
      setServices(prev => prev.map(s => s.service_id === svc.service_id ? { ...s, status: targetStatus } : s))
    } catch (e: unknown) {
      const msg = (e as any)?.response?.data?.message || 'Не удалось сменить статус услуги'
      showToast(msg, 'error')
    }
  }

  /** Назначение сотрудника из модалки + смена статуса (после успешного назначения). */
  const confirmAssigneeAndChange = async (employeeId: number) => {
    if (!assigneePicker) return
    const { svc, targetStatus } = assigneePicker
    try {
      await assignServiceEmployees(svc.order_id, svc.item_id, svc.service_id, {
        employee_ids: [employeeId],
      })
      // Локально подменяем исполнителя — теперь можно вызвать applyStatusChange.
      const empName = pickerEmployees.find(e => e.id === employeeId)?.name || ''
      const updatedSvc: ProductionQueueService = {
        ...svc,
        employee_ids: [employeeId],
        employee_names: empName,
      }
      setServices(prev => prev.map(s => s.service_id === svc.service_id ? updatedSvc : s))
      setAssigneePicker(null)
      await applyStatusChange(updatedSvc, targetStatus)
    } catch {
      showToast('Не удалось назначить исполнителя', 'error')
    }
  }

  /** Активен ли хоть один фильтр — от этого зависит показ кнопки «Сбросить». */
  const hasAnyFilters =
    employeeFilters.length > 0 || itemTypeFilters.length > 0
    || serviceNameFilter.length > 0 || districtFilter.length > 0 || orderIdFilter !== ''
    || onlyUnassigned || searchText.trim() !== ''

  return (
    <div>
      <PageFilterBar
        title="Производство"
        districts={allDistricts}
        districtValue={districtFilter}
        onDistrictChange={setDistrictFilter}
        orderNo={orderIdFilter}
        onOrderNoChange={setOrderIdFilter}
        search={searchText}
        onSearchChange={setSearchText}
        right={
          <div data-tour="production-modes" style={{ display: 'inline-flex', border: '1px solid #ddd', borderRadius: 6, overflow: 'hidden' }}>
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
        }
        // Фильтры во всех режимах. Часть групп имеет смысл не везде: исполнитель
        // и услуга есть только у услуг, тип позиции — у позиций и услуг.
        // Район и № заказа общие и живут в центральной панели выше.
        extra={
        <div className="filters" style={{ marginBottom: 0 }}>
          {mode === 'services' && (
          <>
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
            <label>&nbsp;</label>
            {/* Спринт D, фидбэк 11 мая: «отдельную кнопку чтобы показать все
                где не назначен исполнитель». Toggle: вкл → видны только пустые. */}
            <button
              type="button"
              onClick={() => setOnlyUnassigned(v => !v)}
              style={{
                padding: '6px 14px', borderRadius: 6,
                border: onlyUnassigned ? '2px solid #c0392b' : '1px solid #bdc3c7',
                background: onlyUnassigned ? '#c0392b' : '#fff',
                color: onlyUnassigned ? '#fff' : '#2c3e50',
                fontWeight: onlyUnassigned ? 600 : 500, fontSize: 13, cursor: 'pointer',
              }}
              title="Показать только услуги без назначенного исполнителя"
            >
              {onlyUnassigned ? '✓ Только без исполнителя' : 'Только без исполнителя'}
            </button>
          </div>
          </>
          )}
          {mode !== 'orders' && (
          <div className="form-group" style={{ flex: '1 1 100%' }}>
            <label>Тип позиции</label>
            {/* Спринт D: плашки вместо MultiSelectFilter — не нужно открывать
                выпадающий список. Активный тип — синяя заливка. */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {itemTypes.map(t => {
                const on = itemTypeFilters.includes(t.id)
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() =>
                      setItemTypeFilters(prev => prev.includes(t.id) ? prev.filter(x => x !== t.id) : [...prev, t.id])
                    }
                    style={{
                      padding: '5px 12px', borderRadius: 5,
                      border: on ? '2px solid #3498db' : '1px solid #bdc3c7',
                      background: on ? '#3498db' : '#fff',
                      color: on ? '#fff' : '#2c3e50',
                      fontSize: 13, cursor: 'pointer', fontWeight: on ? 600 : 500,
                    }}
                  >{t.name}</button>
                )
              })}
            </div>
          </div>
          )}
          {mode === 'services' && (
          <div className="form-group" style={{ flex: '1 1 100%' }}>
            <label>Услуга</label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {allServiceNames.map(n => {
                const on = serviceNameFilter.includes(n)
                return (
                  <button
                    key={n}
                    type="button"
                    onClick={() =>
                      setServiceNameFilter(prev => prev.includes(n) ? prev.filter(x => x !== n) : [...prev, n])
                    }
                    style={{
                      padding: '5px 12px', borderRadius: 5,
                      border: on ? '2px solid #16a085' : '1px solid #bdc3c7',
                      background: on ? '#16a085' : '#fff',
                      color: on ? '#fff' : '#2c3e50',
                      fontSize: 13, cursor: 'pointer', fontWeight: on ? 600 : 500,
                    }}
                  >{n}</button>
                )
              })}
            </div>
          </div>
          )}
          {hasAnyFilters && (
            <button
              className="btn-secondary"
              style={{ alignSelf: 'flex-end' }}
              onClick={() => {
                setEmployeeFilters([]); setItemTypeFilters([])
                setServiceNameFilter([]); setDistrictFilter([]); setOrderIdFilter('')
                setOnlyUnassigned(false); setSearchText('')
              }}
            >
              Сбросить
            </button>
          )}
        </div>}
      />

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
              ? filteredOrders.filter(o => o.status === status).sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
              : mode === 'items'
                ? filteredItems.filter(i => i.status === status).sort((a, b) => new Date(a.order_created_at).getTime() - new Date(b.order_created_at).getTime())
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

      {/* Модалка выбора исполнителя при перетаскивании в «В работе»/«Готово»
          для услуги без assignee (Спринт D, фидбэк 11 мая). Плитки —
          только сотрудники, чья роль умеет работать с типом этой позиции.
          Список грузится при открытии модалки через getEmployeesSuitableFor. */}
      {assigneePicker && (
        <div className="modal-overlay" onClick={() => setAssigneePicker(null)} style={{ zIndex: 1300 }}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 480, padding: 16 }}>
            <h3 style={{ marginTop: 0, marginBottom: 4 }}>Выберите исполнителя</h3>
            <div style={{ fontSize: 12, color: '#7f8c8d', marginBottom: 14 }}>
              {assigneePicker.svc.service_name} на {assigneePicker.svc.item_type_name} ·
              заказ #{assigneePicker.svc.order_id}. Показаны только сотрудники с подходящей ролью.
            </div>
            {pickerEmployees.length === 0 ? (
              <div style={{ padding: 16, textAlign: 'center', color: '#7f8c8d' }}>
                Нет сотрудников с подходящей ролью.
                <br />Назначьте роль в карточке сотрудника или добавьте тип в её роль.
              </div>
            ) : (
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))',
                gap: 8, marginBottom: 12,
              }}>
                {pickerEmployees.map(e => {
                  const c = hashColor(e.name)
                  return (
                    <button
                      key={e.id}
                      type="button"
                      onClick={() => void confirmAssigneeAndChange(e.id)}
                      style={{
                        padding: '10px 12px',
                        background: c.bg, color: c.text,
                        border: '1px solid #d6dbdf', borderRadius: 8,
                        cursor: 'pointer', fontSize: 13, fontWeight: 600,
                        textAlign: 'center',
                      }}
                    >{e.name}</button>
                  )
                })}
              </div>
            )}
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button
                type="button"
                onClick={() => setAssigneePicker(null)}
                style={{
                  padding: '8px 16px',
                  background: '#fff', border: '1px solid #bdc3c7',
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
