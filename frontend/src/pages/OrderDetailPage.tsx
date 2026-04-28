import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  getOrder, getOrderItems, getOrderHistory,
  updateOrderStatus, payOrder, createWarrantyOrder,
  addOrderItem, setOrderItemPrice, updateOrderItemDescription, duplicateOrder, duplicateItem,
  updateOrderComment,
  updateOrderDetails,
  getOrderModifiers, addOrderModifier, removeOrderModifier, pushModifiersToClient,
} from '../api/orders'
import { updateOrderItemDimensions } from '../api/orders'
import { getItemServices, updateServiceStatus, updateServicePrice, assignServiceEmployees, addServiceToItem } from '../api/services'
import { getItemTypes, getEmployees, getItemType, getPriceModifiers } from '../api/references'
import type {
  Order, OrderItem, OrderItemService, OrderStatusHistory,
  ItemType, Employee, OrderStatus, ServiceStatus,
  PaymentType, AddOrderItemRequest, PriceListEntry,
  PriceModifier, OrderModifier,
} from '../types'

const ORDER_STATUS_LABELS: Record<string, string> = {
  LEAD: 'Лид', CREATED: 'Создан', FOR_PICKUP: 'К забору', IN_PROGRESS: 'В работе',
  PARTIALLY_DONE: 'Частично готов', DONE: 'Готов', DELIVERED: 'Доставлен', CANCELLED: 'Отменен',
}
const ITEM_STATUS_LABELS: Record<string, string> = {
  CREATED: 'Создана', IN_PROGRESS: 'В работе', PARTIALLY_DONE: 'Частично готова', DONE: 'Готова', CANCELLED: 'Отменена',
}
const SERVICE_STATUS_LABELS: Record<string, string> = {
  CREATED: 'Создана', IN_PROGRESS: 'В работе', DONE: 'Готова', CANCELLED: 'Отменена',
}
const PAYMENT_LABELS: Record<string, string> = {
  TRANSFER: 'Перевод', CARD: 'Карта', CASH: 'Наличные',
}

// Ручные переходы статусов заказа.
// IN_PROGRESS, PARTIALLY_DONE, DONE — автоматически из позиций.
// Ручные только: LEAD→CREATED, CREATED→FOR_PICKUP, FOR_PICKUP (ждём позиции), DONE→DELIVERED
const ALLOWED_TRANSITIONS: Record<string, OrderStatus[]> = {
  LEAD: ['CREATED', 'CANCELLED'],
  CREATED: ['FOR_PICKUP', 'CANCELLED'],
  FOR_PICKUP: ['CANCELLED'],
  IN_PROGRESS: ['CANCELLED'],
  PARTIALLY_DONE: ['CANCELLED'],
  DONE: ['DELIVERED'],
  DELIVERED: [],
  CANCELLED: [],
}

function Badge({ status, labels }: { status: string; labels: Record<string, string> }) {
  return <span className={`badge badge-${status.toLowerCase()}`}>{labels[status] ?? status}</span>
}

function formatOrderNumber(id: number, createdAt: string): string {
  const num = String(id).padStart(5, '0')
  const date = new Date(createdAt).toLocaleDateString('ru')
  return `${num} от ${date}`
}

// ---- Warranty Modal ----
function WarrantyModal({
  items,
  onClose,
  onConfirm,
}: {
  items: OrderItem[]
  onClose: () => void
  onConfirm: (itemIds: number[], comment: string) => void
}) {
  const [selectedIds, setSelectedIds] = useState<number[]>(items.map(i => i.id))
  const [comment, setComment] = useState('')
  const [error, setError] = useState('')

  const toggle = (id: number) => {
    setSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])
  }

  const submit = () => {
    if (selectedIds.length === 0) { setError('Выберите хотя бы одну позицию'); return }
    if (!comment.trim()) { setError('Укажите причину гарантийного возврата'); return }
    onConfirm(selectedIds, comment.trim())
  }

  return (
    <div className="modal-overlay" onClick={() => { if (confirm('Отменить создание гарантийного возврата?')) onClose() }}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <h2>Гарантийный возврат</h2>
        <p style={{ color: '#666', marginBottom: 12 }}>Выберите позиции для возврата:</p>
        <div style={{ maxHeight: 200, overflowY: 'auto', marginBottom: 12 }}>
          {items.map(item => (
            <label key={item.id} style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '4px 0', cursor: 'pointer' }}>
              <input
                type="checkbox"
                style={{ width: 'auto' }}
                checked={selectedIds.includes(item.id)}
                onChange={() => toggle(item.id)}
              />
              {item.item_type_name ?? `Позиция #${item.id}`}
              {item.description ? ` — ${item.description}` : ''}
            </label>
          ))}
        </div>
        <div className="form-group">
          <label>Причина гарантийного возврата *</label>
          <textarea
            rows={3}
            value={comment}
            onChange={e => setComment(e.target.value)}
            placeholder="Опишите причину возврата..."
          />
        </div>
        {error && <div className="error-msg">{error}</div>}
        <div className="modal-actions">
          <button className="btn-secondary" onClick={onClose}>Отмена</button>
          <button className="btn-warning" onClick={submit}>Создать гарантийный заказ</button>
        </div>
      </div>
    </div>
  )
}
function AddItemModal({
  orderId, itemTypes, onClose, onAdded,
}: {
  orderId: number
  itemTypes: ItemType[]
  onClose: () => void
  onAdded: (item: OrderItem) => void
}) {
  // Исключаем типы "по умолчанию" — они добавляются автоматически
  const selectableTypes = itemTypes.filter(t => !t.is_default)
  const [form, setForm] = useState<AddOrderItemRequest>({ item_type_id: selectableTypes[0]?.id ?? 0, description: '' })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const submit = async () => {
    if (!form.item_type_id) { setError('Выберите тип позиции'); return }
    setLoading(true)
    try {
      const item = await addOrderItem(orderId, form)
      onAdded(item)
    } catch {
      setError('Ошибка при добавлении позиции')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={() => { if (confirm('Отменить добавление позиции?')) onClose() }}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <h2>Добавить позицию</h2>
        <div className="form-group">
          <label>Тип позиции *</label>
          <select value={form.item_type_id} onChange={e => setForm(f => ({ ...f, item_type_id: Number(e.target.value) }))}>
            {selectableTypes.length === 0
              ? <option value="">Нет доступных типов</option>
              : selectableTypes.map(t => <option key={t.id} value={t.id}>{t.name}</option>)
            }
          </select>
        </div>
        <div className="form-group">
          <label>Описание</label>
          <textarea rows={2} value={form.description ?? ''} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
        </div>
        {error && <div className="error-msg">{error}</div>}
        <div className="modal-actions">
          <button className="btn-secondary" onClick={onClose}>Отмена</button>
          <button className="btn-primary" onClick={submit} disabled={loading || selectableTypes.length === 0}>
            {loading ? 'Добавление...' : 'Добавить'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ---- Pay Modal ----
function PayModal({ onClose, onPay }: { onClose: () => void; onPay: (pt: PaymentType) => void }) {
  const [paymentType, setPaymentType] = useState<PaymentType>('CARD')
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <h2>Оплата заказа</h2>
        <div className="form-group">
          <label>Тип оплаты</label>
          <select value={paymentType} onChange={e => setPaymentType(e.target.value as PaymentType)}>
            <option value="CARD">Карта</option>
            <option value="CASH">Наличные</option>
            <option value="TRANSFER">Перевод</option>
          </select>
        </div>
        <div className="modal-actions">
          <button className="btn-secondary" onClick={onClose}>Отмена</button>
          <button className="btn-success" onClick={() => onPay(paymentType)}>Оплатить</button>
        </div>
      </div>
    </div>
  )
}

// Проверяет, заполнены ли нужные размеры для данного pricing_type
function checkDimensionsForPricing(pricingType: string | null | undefined, item: OrderItem): { ok: boolean; missing: string } {
  switch (pricingType) {
    case 'BY_AREA':
      if (!item.length || !item.width) return { ok: false, missing: 'длина и ширина' }
      return { ok: true, missing: '' }
    case 'BY_WEIGHT':
      if (!item.weight) return { ok: false, missing: 'вес' }
      return { ok: true, missing: '' }
    case 'BY_PERIMETER':
      if (!item.running_meters && (!item.length || !item.width)) return { ok: false, missing: 'погонные метры или длина и ширина' }
      return { ok: true, missing: '' }
    default:
      return { ok: true, missing: '' }
  }
}

// ---- Services Panel ----
function ServicesPanel({
  orderId, item, itemTypeId, employees, onRefresh, isEditable,
}: {
  orderId: number
  item: OrderItem
  itemTypeId: number
  employees: Employee[]
  onRefresh: () => void
  isEditable: boolean
}) {
  const itemId = item.id
  const [services, setServices] = useState<OrderItemService[]>([])
  const [availableServices, setAvailableServices] = useState<{id: number, name: string, pricing_type?: string | null}[]>([])
  const [loading, setLoading] = useState(true)
  const [assignModal, setAssignModal] = useState<number | null>(null)
  const [selectedEmployees, setSelectedEmployees] = useState<number[]>([])
  const [employeeSearch, setEmployeeSearch] = useState('')
  const [selectedServiceToAdd, setSelectedServiceToAdd] = useState<number | ''>('')
  const [editingPrice, setEditingPrice] = useState<number | null>(null)
  const [priceValue, setPriceValue] = useState('')
  const [dimWarning, setDimWarning] = useState('')
  const [showDimModal, setShowDimModal] = useState<{serviceDefId: number, missing: string} | null>(null)

  const load = async () => {
    setLoading(true)
    try {
      const [servicesData, itemTypeData] = await Promise.all([
        getItemServices(orderId, itemId),
        getItemType(itemTypeId)
      ])
      setServices(servicesData)
      setAvailableServices(
        (itemTypeData.services || [])
          .filter((s: PriceListEntry) => s.is_active)
          .map((s: PriceListEntry) => ({ id: s.service_def_id, name: s.service_def_name || `Услуга #${s.service_def_id}`, pricing_type: s.pricing_type }))
      )
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void load() }, [orderId, itemId, itemTypeId])

  const changeStatus = async (serviceId: number, status: ServiceStatus) => {
    try {
      await updateServiceStatus(orderId, itemId, serviceId, { status })
      await load()
      onRefresh()
    } catch { /* ignore */ }
  }

  const openAssign = (serviceId: number, current: Employee[]) => {
    setAssignModal(serviceId)
    setSelectedEmployees(current.map(e => e.id))
    setEmployeeSearch('')
  }

  const saveAssign = async () => {
    if (assignModal === null) return
    try {
      await assignServiceEmployees(orderId, itemId, assignModal, { employee_ids: selectedEmployees })
      setAssignModal(null)
      await load()
    } catch { /* ignore */ }
  }

  const tryAddService = (serviceDefId: number) => {
    const svc = availableServices.find(s => s.id === serviceDefId)
    const check = checkDimensionsForPricing(svc?.pricing_type, item)
    if (!check.ok) {
      setShowDimModal({ serviceDefId, missing: check.missing })
      return
    }
    void doAddService(serviceDefId)
  }

  const doAddService = async (serviceDefId: number) => {
    try {
      await addServiceToItem(orderId, itemId, { service_def_id: serviceDefId })
      setSelectedServiceToAdd('')
      setDimWarning('')
      await load()
      onRefresh()
    } catch { /* ignore */ }
  }

  const openPriceEdit = (serviceId: number, currentPrice: number) => {
    setEditingPrice(serviceId)
    setPriceValue(String(currentPrice))
  }

  const savePriceEdit = async () => {
    if (editingPrice === null) return
    try {
      await updateServicePrice(orderId, itemId, editingPrice, { price: Number(priceValue) })
      setEditingPrice(null)
      await load()
      onRefresh()
    } catch { /* ignore */ }
  }

  if (loading) return <div className="loading">Загрузка услуг...</div>

  const usedServiceIds = services.map(s => s.service_def_id)
  const unusedServices = availableServices.filter(s => !usedServiceIds.includes(s.id))

  const filteredEmployees = employees.filter(e =>
    e.name.toLowerCase().includes(employeeSearch.toLowerCase())
  )

  // Определяем, заблокирована ли услуга по размерам (pricing_type vs item dimensions)
  const isServiceBlocked = (s: OrderItemService): boolean => {
    const svcDef = availableServices.find(a => a.id === s.service_def_id)
    const check = checkDimensionsForPricing(svcDef?.pricing_type, item)
    return !check.ok
  }

  return (
    <div style={{ marginTop: 8 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <h4 style={{ margin: 0 }}>Услуги</h4>
        {isEditable && unusedServices.length > 0 && (
          <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
            <select
              value={selectedServiceToAdd}
              onChange={e => {
                const val = Number(e.target.value)
                if (val) tryAddService(val)
              }}
              style={{ width: 'auto' }}
            >
              <option value="">+ Добавить услугу...</option>
              {unusedServices.map(s => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>
        )}
      </div>

      {dimWarning && <div className="error-msg" style={{ marginBottom: 8 }}>{dimWarning}</div>}

      {services.length === 0 ? (
        <div className="empty">Нет услуг</div>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Услуга</th>
              <th>Статус</th>
              <th>Стоимость</th>
              <th>Исполнители</th>
              {isEditable && <th>Действия</th>}
            </tr>
          </thead>
          <tbody>
            {services.map(s => {
              const blocked = isServiceBlocked(s)
              return (
                <tr key={s.id} style={blocked ? { background: '#fff3cd' } : undefined}>
                  <td>
                    {s.service_def_name ?? `Услуга #${s.service_def_id}`}
                    {blocked && (
                      <div style={{ fontSize: '0.8em', color: '#e67e22', fontWeight: 600 }}>
                        Не заполнены размеры
                      </div>
                    )}
                  </td>
                  <td><Badge status={s.status} labels={SERVICE_STATUS_LABELS} /></td>
                  <td>
                    {isEditable && editingPrice === s.id ? (
                      <div style={{ display: 'flex', gap: 4 }}>
                        <input
                          value={priceValue}
                          onChange={e => setPriceValue(e.target.value)}
                          style={{ width: 80 }}
                        />
                        <button className="btn-success btn-sm" onClick={savePriceEdit}>&#10003;</button>
                        <button className="btn-secondary btn-sm" onClick={() => setEditingPrice(null)}>&#10005;</button>
                      </div>
                    ) : (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        <span
                          style={{ cursor: isEditable ? 'pointer' : 'default' }}
                          onClick={() => isEditable && openPriceEdit(s.id, s.price)}
                        >
                          {Number(s.price).toFixed(2)} &#8381;{isEditable ? ' \u270F\uFE0F' : ''}
                        </span>
                        {s.is_manual_price && (
                          <span style={{ fontSize: '0.8em', color: '#666' }} title="Цена установлена вручную">
                            (ручная)
                          </span>
                        )}
                      </div>
                    )}
                  </td>
                  <td>{s.assignees?.map(e => e.name).join(', ') || '—'}</td>
                  {isEditable && (
                    <td>
                      <div className="actions">
                        {blocked ? (
                          <span style={{ color: '#e67e22', fontSize: '0.85em', fontWeight: 600 }} title="Заполните размеры позиции">
                            Заблокировано
                          </span>
                        ) : (
                          <select
                            value={s.status}
                            onChange={e => changeStatus(s.id, e.target.value as ServiceStatus)}
                            style={{ width: 'auto' }}
                          >
                            <option value="CREATED">Создана</option>
                            <option value="IN_PROGRESS">В работе</option>
                            <option value="DONE">Готова</option>
                            <option value="CANCELLED">Отменена</option>
                          </select>
                        )}
                        <button className="btn-secondary btn-sm" onClick={() => openAssign(s.id, s.assignees ?? [])}>
                          Исполнители
                        </button>
                      </div>
                    </td>
                  )}
                </tr>
              )
            })}
          </tbody>
        </table>
      )}

      {/* Модалка предупреждения при добавлении услуги без размеров */}
      {showDimModal && (
        <div className="modal-overlay" onClick={() => setShowDimModal(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h2>Не заполнены размеры</h2>
            <p>Для этой услуги необходимо указать <strong>{showDimModal.missing}</strong> в позиции заказа.</p>
            <p>Услуга будет добавлена, но её нельзя будет перевести в работу, пока размеры не заполнены.</p>
            <div className="modal-actions">
              <button className="btn-secondary" onClick={() => setShowDimModal(null)}>Отмена</button>
              <button className="btn-warning" onClick={() => {
                const sid = showDimModal.serviceDefId
                setShowDimModal(null)
                setDimWarning('Заполните размеры позиции, чтобы услуга могла быть выполнена')
                void doAddService(sid)
              }}>Добавить всё равно</button>
            </div>
          </div>
        </div>
      )}

      {assignModal !== null && (
        <div className="modal-overlay" onClick={() => setAssignModal(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h2>Назначить исполнителей</h2>
            <div className="form-group">
              <input
                value={employeeSearch}
                onChange={e => setEmployeeSearch(e.target.value)}
                placeholder="Поиск по имени..."
              />
            </div>
            <div style={{ maxHeight: 240, overflowY: 'auto' }}>
              {filteredEmployees.map(emp => (
                <label key={emp.id} style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '4px 0' }}>
                  <input
                    type="checkbox"
                    style={{ width: 'auto' }}
                    checked={selectedEmployees.includes(emp.id)}
                    onChange={e => {
                      if (e.target.checked) setSelectedEmployees(prev => [...prev, emp.id])
                      else setSelectedEmployees(prev => prev.filter(id => id !== emp.id))
                    }}
                  />
                  {emp.name}
                </label>
              ))}
            </div>
            <div className="modal-actions">
              <button className="btn-secondary" onClick={() => setAssignModal(null)}>Отмена</button>
              <button className="btn-primary" onClick={saveAssign}>Сохранить</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ---- Item Row ----
function ItemRow({
  item, index, orderId, employees, onRefresh, isEditable,
}: {
  item: OrderItem
  index: number
  orderId: number
  employees: Employee[]
  onRefresh: () => void
  isEditable: boolean
}) {
  const [expanded, setExpanded] = useState(false)
  const [editPrice, setEditPrice] = useState(false)
  const [editDimensions, setEditDimensions] = useState(false)
  const [editDesc, setEditDesc] = useState(false)
  const [descValue, setDescValue] = useState(item.description || '')
  const [defectsValue, setDefectsValue] = useState(item.defects || '')
  const [price, setPrice] = useState(String(item.price))
  const [dimensions, setDimensions] = useState({
    length: item.length?.toString() || '',
    width: item.width?.toString() || '',
    weight: item.weight?.toString() || '',
    area: item.area?.toString() || '',
    running_meters: item.running_meters?.toString() || '',
  })

  const saveDesc = async () => {
    try {
      await updateOrderItemDescription(orderId, item.id, {
        description: descValue || null,
        defects: defectsValue || null,
      })
      setEditDesc(false)
      onRefresh()
    } catch { /* ignore */ }
  }

  const savePrice = async () => {
    try {
      await setOrderItemPrice(orderId, item.id, { price: Number(price) })
      setEditPrice(false)
      onRefresh()
    } catch { /* ignore */ }
  }

  const saveDimensions = async () => {
    try {
      await updateOrderItemDimensions(orderId, item.id, {
        length: dimensions.length ? Number(dimensions.length) : undefined,
        width: dimensions.width ? Number(dimensions.width) : undefined,
        weight: dimensions.weight ? Number(dimensions.weight) : undefined,
        area: dimensions.area ? Number(dimensions.area) : undefined,
        running_meters: dimensions.running_meters ? Number(dimensions.running_meters) : undefined,
      })
      setEditDimensions(false)
      onRefresh()
    } catch { /* ignore */ }
  }

  return (
    <>
      <tr>
        <td>
          <button
            className="btn-secondary btn-sm"
            onClick={() => setExpanded(e => !e)}
            style={{ marginRight: 8 }}
          >
            {expanded ? '\u25B2' : '\u25BC'}
          </button>
          #{index}
        </td>
        <td>{item.item_type_name ?? `Тип #${item.item_type_id}`}</td>
        <td>
          {isEditable && editDesc ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <input
                value={descValue}
                onChange={e => setDescValue(e.target.value)}
                placeholder="Описание"
                style={{ width: '100%' }}
              />
              <input
                value={defectsValue}
                onChange={e => setDefectsValue(e.target.value)}
                placeholder="Дефекты"
                style={{ width: '100%' }}
              />
              <div style={{ display: 'flex', gap: 4 }}>
                <button className="btn-success btn-sm" onClick={saveDesc}>&#10003;</button>
                <button className="btn-secondary btn-sm" onClick={() => { setEditDesc(false); setDescValue(item.description || ''); setDefectsValue(item.defects || '') }}>&#10005;</button>
              </div>
            </div>
          ) : (
            <div
              style={{ cursor: isEditable ? 'pointer' : 'default' }}
              onClick={() => isEditable && setEditDesc(true)}
            >
              <div>{item.description || '—'}{isEditable ? ' \u270F\uFE0F' : ''}</div>
              {item.defects && (
                <div style={{ fontSize: '0.85em', color: '#e67e22', marginTop: 2 }}>
                  Дефекты: {item.defects}
                </div>
              )}
            </div>
          )}
        </td>
        <td>
          {isEditable && editDimensions ? (
            <div style={{ display: 'flex', gap: 4, flexDirection: 'column' }}>
              <div style={{ display: 'flex', gap: 4 }}>
                <input
                  placeholder="Длина"
                  value={dimensions.length}
                  onChange={e => setDimensions(d => ({...d, length: e.target.value}))}
                  style={{ width: 60 }}
                />
                <input
                  placeholder="Ширина"
                  value={dimensions.width}
                  onChange={e => setDimensions(d => ({...d, width: e.target.value}))}
                  style={{ width: 60 }}
                />
                <input
                  placeholder="Вес"
                  value={dimensions.weight}
                  onChange={e => setDimensions(d => ({...d, weight: e.target.value}))}
                  style={{ width: 60 }}
                />
              </div>
              <div style={{ display: 'flex', gap: 4 }}>
                <input
                  placeholder="Площадь"
                  value={dimensions.area}
                  onChange={e => setDimensions(d => ({...d, area: e.target.value}))}
                  style={{ width: 60 }}
                />
                <input
                  placeholder="Пог.м"
                  value={dimensions.running_meters}
                  onChange={e => setDimensions(d => ({...d, running_meters: e.target.value}))}
                  style={{ width: 60 }}
                />
              </div>
              <div style={{ display: 'flex', gap: 4 }}>
                <button className="btn-success btn-sm" onClick={saveDimensions}>&#10003;</button>
                <button className="btn-secondary btn-sm" onClick={() => setEditDimensions(false)}>&#10005;</button>
              </div>
            </div>
          ) : (
            <span
              style={{ cursor: isEditable ? 'pointer' : 'default' }}
              onClick={() => isEditable && setEditDimensions(true)}
            >
              {item.length ? `${item.length}\u00D7${item.width || 0}` : '—'}
              {item.weight ? ` (${item.weight}\u043A\u0433)` : ''}
              {item.area ? ` S=${item.area}` : ''}
              {item.running_meters ? ` ${item.running_meters}\u043F.\u043C.` : ''}
              {isEditable ? ' \u270F\uFE0F' : ''}
            </span>
          )}
        </td>
        <td><Badge status={item.status} labels={ITEM_STATUS_LABELS} /></td>
        <td>
          {isEditable && editPrice ? (
            <div style={{ display: 'flex', gap: 4 }}>
              <input value={price} onChange={e => setPrice(e.target.value)} style={{ width: 80 }} />
              <button className="btn-success btn-sm" onClick={savePrice}>&#10003;</button>
              <button className="btn-secondary btn-sm" onClick={() => setEditPrice(false)}>&#10005;</button>
            </div>
          ) : (
            <span
              style={{ cursor: isEditable ? 'pointer' : 'default' }}
              onClick={() => isEditable && setEditPrice(true)}
            >
              {Number(item.price).toFixed(2)} &#8381;{isEditable ? ' \u270F\uFE0F' : ''}
            </span>
          )}
        </td>
        <td>
          <Badge status={item.status} labels={ITEM_STATUS_LABELS} />
          {isEditable && (
            <button
              className="btn-secondary btn-sm"
              style={{ marginLeft: 8 }}
              onClick={async () => {
                try {
                  await duplicateItem(orderId, item.id)
                  onRefresh()
                } catch { /* ignore */ }
              }}
              title="Дублировать позицию"
            >Дубль</button>
          )}
        </td>
      </tr>
      {expanded && (
        <tr>
          <td colSpan={7} style={{ background: '#f8f9fa', padding: '12px 20px' }}>
            <ServicesPanel orderId={orderId} item={item} itemTypeId={item.item_type_id} employees={employees} onRefresh={onRefresh} isEditable={isEditable} />
          </td>
        </tr>
      )}
    </>
  )
}

// ---- Main Page ----
export default function OrderDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const orderId = Number(id)

  const [order, setOrder] = useState<Order | null>(null)
  const [items, setItems] = useState<OrderItem[]>([])
  const [history, setHistory] = useState<OrderStatusHistory[]>([])
  const [itemTypes, setItemTypes] = useState<ItemType[]>([])
  const [employees, setEmployees] = useState<Employee[]>([])
  const [loading, setLoading] = useState(true)
  const [showAddItem, setShowAddItem] = useState(false)
  const [showPay, setShowPay] = useState(false)
  const [showWarranty, setShowWarranty] = useState(false)
  const [error, setError] = useState('')
  const [orderModifiers, setOrderModifiers] = useState<OrderModifier[]>([])
  const [allModifiers, setAllModifiers] = useState<PriceModifier[]>([])
  const [editComment, setEditComment] = useState(false)
  const [commentValue, setCommentValue] = useState('')
  const [editDetails, setEditDetails] = useState(false)
  const [details, setDetails] = useState({
    pickup_address: '',
    delivery_address: '',
    legacy_id: '' as string,
    pickup_date: '',
    pickup_time_slot: '',
    delivery_date: '',
    delivery_time_slot: '',
    pickup_district: '',
    delivery_district: '',
  })

  const loadOrder = async () => {
    try {
      const [o, its, hist] = await Promise.all([
        getOrder(orderId),
        getOrderItems(orderId),
        getOrderHistory(orderId),
      ])
      setOrder(o)
      setItems(its)
      setHistory(hist)
      getOrderModifiers(orderId).then(setOrderModifiers).catch(() => {})
      setCommentValue(o.comment ?? '')
      setDetails({
        pickup_address: o.pickup_address ?? '',
        delivery_address: o.delivery_address ?? '',
        legacy_id: o.legacy_id?.toString() ?? '',
        pickup_date: o.pickup_date ?? '',
        pickup_time_slot: o.pickup_time_slot ?? '',
        delivery_date: o.delivery_date ?? '',
        delivery_time_slot: o.delivery_time_slot ?? '',
        pickup_district: o.pickup_district ?? '',
        delivery_district: o.delivery_district ?? '',
      })
    } catch {
      setError('Ошибка загрузки заказа')
    }
  }

  useEffect(() => {
    setLoading(true)
    Promise.all([
      loadOrder(),
      getItemTypes().then(setItemTypes),
      getEmployees().then(setEmployees),
      getPriceModifiers().then(setAllModifiers).catch(() => {}),
    ]).finally(() => setLoading(false))
  }, [orderId])

  const changeOrderStatus = async (status: OrderStatus) => {
    try {
      const updated = await updateOrderStatus(orderId, { status })
      setOrder(updated)
      const hist = await getOrderHistory(orderId)
      setHistory(hist)
    } catch { /* ignore */ }
  }

  const handlePay = async (paymentType: PaymentType) => {
    try {
      const updated = await payOrder(orderId, { payment_type: paymentType })
      setOrder(updated)
      setShowPay(false)
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { message?: string } } })?.response?.data?.message
      setError(msg ?? 'Ошибка оплаты')
    }
  }

  const handleWarranty = async (itemIds: number[], warrantyComment: string) => {
    try {
      const warranty = await createWarrantyOrder(orderId, { item_ids: itemIds, warranty_comment: warrantyComment })
      setShowWarranty(false)
      navigate(`/orders/${warranty.id}`)
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { message?: string } } })?.response?.data?.message
      setError(msg ?? 'Ошибка создания гарантийного заказа')
    }
  }

  const saveDetails = async () => {
    try {
      const updated = await updateOrderDetails(orderId, {
        pickup_address: details.pickup_address || null,
        delivery_address: details.delivery_address || null,
        legacy_id: details.legacy_id ? Number(details.legacy_id) : null,
        pickup_date: details.pickup_date || null,
        pickup_time_slot: details.pickup_time_slot || null,
        delivery_date: details.delivery_date || null,
        delivery_time_slot: details.delivery_time_slot || null,
        pickup_district: details.pickup_district || null,
        delivery_district: details.delivery_district || null,
      })
      setOrder(updated)
      setEditDetails(false)
    } catch {
      setError('Ошибка сохранения деталей')
    }
  }

  const saveComment = async () => {
    try {
      const updated = await updateOrderComment(orderId, commentValue)
      setOrder(updated)
      setEditComment(false)
    } catch {
      setError('Ошибка сохранения комментария')
    }
  }

  const handleAddModifier = async (modifierId: number) => {
    try {
      await addOrderModifier(orderId, modifierId)
      await loadOrder()
      const mods = await getOrderModifiers(orderId)
      setOrderModifiers(mods)
    } catch { /* ignore */ }
  }

  const handleRemoveModifier = async (modifierId: number) => {
    try {
      await removeOrderModifier(orderId, modifierId)
      await loadOrder()
      const mods = await getOrderModifiers(orderId)
      setOrderModifiers(mods)
    } catch { /* ignore */ }
  }

  const handlePushToClient = async () => {
    try {
      await pushModifiersToClient(orderId)
      setError('')
      alert('Модификаторы сохранены в клиента')
    } catch { setError('Ошибка сохранения модификаторов в клиента') }
  }

  if (loading) return <div className="loading">Загрузка...</div>
  if (!order) return <div className="error-msg">{error || 'Заказ не найден'}</div>

  const isEditable = order.status !== 'DELIVERED' && order.status !== 'CANCELLED'

  return (
    <div>
      <div className="page-header">
        <div>
          <button className="btn-secondary btn-sm" onClick={() => navigate('/orders')} style={{ marginBottom: 8 }}>
            &#8592; Назад к заказам
          </button>
          <h1>Заказ {formatOrderNumber(order.id, order.created_at)} — {order.client_name}</h1>
        </div>
      </div>

      {error && <div className="error-msg" style={{ marginBottom: 12 }}>{error}</div>}

      {/* Order Info */}
      <div className="card">
        <div style={{ display: 'flex', gap: 32, flexWrap: 'wrap', alignItems: 'flex-start' }}>
          <div>
            <div style={{ marginBottom: 8 }}>
              <strong>Статус:</strong> <Badge status={order.status} labels={ORDER_STATUS_LABELS} />
            </div>
            <div style={{ marginBottom: 8 }}><strong>Сумма:</strong> {Number(order.total_amount).toFixed(2)} &#8381;</div>
            {order.discount_percent > 0 && (
              <div style={{ marginBottom: 8 }}><strong>Скидка:</strong> {order.discount_percent}%</div>
            )}
            <div style={{ marginBottom: 8 }}><strong>Оплачен:</strong> {order.paid ? `Да (${PAYMENT_LABELS[order.payment_type ?? ''] ?? order.payment_type})` : 'Нет'}</div>
            <div style={{ marginBottom: 8 }}>
              <strong>Клиент:</strong>{' '}
              <button className="btn-secondary btn-sm" onClick={() => navigate('/clients')} style={{ marginLeft: 4 }}>
                {order.client_name}
              </button>
            </div>
            {order.client_address && <div style={{ marginBottom: 8 }}><strong>Адрес клиента:</strong> {order.client_address}</div>}
            {order.is_warranty && (
              <div style={{ marginBottom: 8 }}>
                <strong>Гарантийный заказ</strong>
                {order.parent_order_id && (
                  <>
                    {' — '}
                    <button className="btn-secondary btn-sm" onClick={() => navigate(`/orders/${order.parent_order_id}`)}>
                      Родительский заказ {String(order.parent_order_id).padStart(5, '0')}
                    </button>
                  </>
                )}
              </div>
            )}
          </div>
          <div>
            <div style={{ marginBottom: 8 }}><strong>Создан:</strong> {new Date(order.created_at).toLocaleString('ru')}</div>
            {order.payment_date && (
              <div style={{ marginBottom: 8 }}><strong>Дата оплаты:</strong> {new Date(order.payment_date).toLocaleString('ru')}</div>
            )}
          </div>
        </div>

        {/* Editable details: addresses, dates, legacy_id */}
        <div style={{ marginTop: 12, padding: 12, background: '#f8f9fa', borderRadius: 6 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <strong>Логистика и детали</strong>
            {isEditable && !editDetails && (
              <button className="btn-secondary btn-sm" onClick={() => setEditDetails(true)}>Редактировать</button>
            )}
          </div>
          {editDetails ? (
            <div>
              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 8 }}>
                <div className="form-group" style={{ flex: '1 1 250px', marginBottom: 4 }}>
                  <label>Адрес забора</label>
                  <input value={details.pickup_address} onChange={e => setDetails(d => ({...d, pickup_address: e.target.value}))} />
                </div>
                <div className="form-group" style={{ flex: '0 0 120px', marginBottom: 4 }}>
                  <label>Район забора</label>
                  <input value={details.pickup_district} onChange={e => setDetails(d => ({...d, pickup_district: e.target.value}))} />
                </div>
              </div>
              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 8 }}>
                <div className="form-group" style={{ flex: '1 1 250px', marginBottom: 4 }}>
                  <label>Адрес доставки</label>
                  <input value={details.delivery_address} onChange={e => setDetails(d => ({...d, delivery_address: e.target.value}))} />
                </div>
                <div className="form-group" style={{ flex: '0 0 120px', marginBottom: 4 }}>
                  <label>Район доставки</label>
                  <input value={details.delivery_district} onChange={e => setDetails(d => ({...d, delivery_district: e.target.value}))} />
                </div>
              </div>
              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 8 }}>
                <div className="form-group" style={{ flex: '0 0 160px', marginBottom: 4 }}>
                  <label>Дата забора</label>
                  <input type="date" value={details.pickup_date} onChange={e => setDetails(d => ({...d, pickup_date: e.target.value}))} />
                </div>
                <div className="form-group" style={{ flex: '0 0 140px', marginBottom: 4 }}>
                  <label>Время забора</label>
                  <select value={details.pickup_time_slot} onChange={e => setDetails(d => ({...d, pickup_time_slot: e.target.value}))}>
                    <option value="">—</option>
                    <option value="08:00-12:00">8:00–12:00</option>
                    <option value="12:00-18:00">12:00–18:00</option>
                    <option value="18:00-22:00">18:00–22:00</option>
                  </select>
                </div>
                <div className="form-group" style={{ flex: '0 0 160px', marginBottom: 4 }}>
                  <label>Дата доставки</label>
                  <input type="date" value={details.delivery_date} onChange={e => setDetails(d => ({...d, delivery_date: e.target.value}))} />
                </div>
                <div className="form-group" style={{ flex: '0 0 140px', marginBottom: 4 }}>
                  <label>Время доставки</label>
                  <select value={details.delivery_time_slot} onChange={e => setDetails(d => ({...d, delivery_time_slot: e.target.value}))}>
                    <option value="">—</option>
                    <option value="08:00-12:00">8:00–12:00</option>
                    <option value="12:00-18:00">12:00–18:00</option>
                    <option value="18:00-22:00">18:00–22:00</option>
                  </select>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 8 }}>
                <div className="form-group" style={{ flex: '0 0 160px', marginBottom: 4 }}>
                  <label>ID из старой системы</label>
                  <input type="number" value={details.legacy_id} onChange={e => setDetails(d => ({...d, legacy_id: e.target.value}))} placeholder="Legacy ID" />
                </div>
              </div>
              <div style={{ display: 'flex', gap: 4 }}>
                <button className="btn-success btn-sm" onClick={saveDetails}>Сохранить</button>
                <button className="btn-secondary btn-sm" onClick={() => setEditDetails(false)}>Отмена</button>
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
              <div>
                <div style={{ marginBottom: 4 }}><strong>Адрес забора:</strong> {order.pickup_address || '(не указан)'}</div>
                {order.pickup_district && <div style={{ marginBottom: 4, fontSize: '0.9em', color: '#666' }}>Район: {order.pickup_district}</div>}
                <div style={{ marginBottom: 4 }}><strong>Дата забора (план):</strong> {order.pickup_date ? `${order.pickup_date}` : '(не назначена)'} {order.pickup_time_slot ? `(${order.pickup_time_slot})` : ''}</div>
                {order.actual_pickup_date && order.actual_pickup_date !== order.pickup_date && (
                  <div style={{ marginBottom: 4, color: '#e67e22' }}><strong>Дата забора (факт):</strong> {order.actual_pickup_date} {order.actual_pickup_time_slot ? `(${order.actual_pickup_time_slot})` : ''}</div>
                )}
              </div>
              <div>
                <div style={{ marginBottom: 4 }}><strong>Адрес доставки:</strong> {order.delivery_address || '(не указан)'}</div>
                {order.delivery_district && <div style={{ marginBottom: 4, fontSize: '0.9em', color: '#666' }}>Район: {order.delivery_district}</div>}
                <div style={{ marginBottom: 4 }}><strong>Дата доставки (план):</strong> {order.delivery_date ? `${order.delivery_date}` : '(не назначена)'} {order.delivery_time_slot ? `(${order.delivery_time_slot})` : ''}</div>
                {order.actual_delivery_date && order.actual_delivery_date !== order.delivery_date && (
                  <div style={{ marginBottom: 4, color: '#e67e22' }}><strong>Дата доставки (факт):</strong> {order.actual_delivery_date} {order.actual_delivery_time_slot ? `(${order.actual_delivery_time_slot})` : ''}</div>
                )}
              </div>
              <div>
                <div style={{ marginBottom: 4 }}><strong>ID из старой системы:</strong> {order.legacy_id ?? '(нет)'}</div>
              </div>
            </div>
          )}
        </div>

        {/* Comment section - always visible */}
        <div style={{ marginTop: 12, marginBottom: 12 }}>
          <strong>Комментарий:</strong>
          {editComment ? (
            <div style={{ marginTop: 4 }}>
              <textarea
                rows={3}
                value={commentValue}
                onChange={e => setCommentValue(e.target.value)}
                style={{ marginBottom: 4 }}
              />
              <div style={{ display: 'flex', gap: 4 }}>
                <button className="btn-success btn-sm" onClick={saveComment}>Сохранить</button>
                <button className="btn-secondary btn-sm" onClick={() => { setEditComment(false); setCommentValue(order.comment ?? '') }}>Отмена</button>
              </div>
            </div>
          ) : (
            <div style={{ marginTop: 4 }}>
              <span>{order.comment || '(нет)'}</span>
              {isEditable && (
                <button className="btn-secondary btn-sm" onClick={() => setEditComment(true)} style={{ marginLeft: 8 }}>
                  Изменить
                </button>
              )}
            </div>
          )}
        </div>

        <div className="actions" style={{ marginTop: 16 }}>
          {ALLOWED_TRANSITIONS[order.status]?.length > 0 && (
            <div className="form-group" style={{ marginBottom: 0 }}>
              <select
                value=""
                onChange={e => e.target.value && changeOrderStatus(e.target.value as OrderStatus)}
                style={{ width: 'auto' }}
              >
                <option value="">Сменить статус...</option>
                {ALLOWED_TRANSITIONS[order.status]?.map(s => (
                  <option key={s} value={s}>{ORDER_STATUS_LABELS[s]}</option>
                ))}
              </select>
            </div>
          )}
          {!order.paid && order.status === 'DONE' && (
            <button className="btn-success" onClick={() => setShowPay(true)}>Оплатить</button>
          )}
          {order.status === 'DELIVERED' && (
            <button className="btn-warning" onClick={() => setShowWarranty(true)}>Гарантийный возврат</button>
          )}
          <button className="btn-secondary" onClick={async () => {
            if (!confirm('Дублировать заказ?')) return
            try {
              const dup = await duplicateOrder(orderId)
              navigate(`/orders/${dup.id}`)
            } catch { setError('Ошибка дублирования заказа') }
          }}>Дублировать заказ</button>
        </div>
      </div>

      {/* Items */}
      <div className="card">
        <div className="page-header" style={{ marginBottom: 12 }}>
          <h2 style={{ margin: 0 }}>Позиции заказа</h2>
          {isEditable && (
            <button className="btn-primary" onClick={() => setShowAddItem(true)}>+ Добавить позицию</button>
          )}
        </div>
        <table>
          <thead>
            <tr>
              <th>#</th>
              <th>Тип</th>
              <th>Описание / Дефекты</th>
              <th>Размеры</th>
              <th>Статус</th>
              <th>Стоимость</th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 ? (
              <tr><td colSpan={7} className="empty">Нет позиций</td></tr>
            ) : (() => {
                const defaultTypeIds = new Set(itemTypes.filter(t => t.is_default).map(t => t.id))
                const sorted = [
                  ...items.filter(i => !defaultTypeIds.has(i.item_type_id)),
                  ...items.filter(i => defaultTypeIds.has(i.item_type_id)),
                ]
                return sorted.map((item, idx) => (
                  <ItemRow
                    key={item.id}
                    item={item}
                    index={idx + 1}
                    orderId={orderId}
                    employees={employees}
                    onRefresh={loadOrder}
                    isEditable={isEditable}
                  />
                ))
              })()
            }
          </tbody>
        </table>
      </div>

      {/* Расчёт стоимости */}
      <div className="card">
        <h2 style={{ marginTop: 0 }}>Расчёт стоимости</h2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #eee' }}>
            <span>Сумма позиций (базовая):</span>
            <strong>{Number(order.base_amount).toFixed(2)} &#8381;</strong>
          </div>

          {orderModifiers.length > 0 && (
            <div>
              <div style={{ fontWeight: 600, marginBottom: 4 }}>Модификаторы:</div>
              {orderModifiers.map(m => {
                const amount = Number(order.base_amount) * m.percent / 100
                const isPositive = m.percent > 0
                return (
                  <div key={m.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 0' }}>
                    <span>{m.modifier_name} ({isPositive ? '+' : ''}{m.percent}%)</span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ color: isPositive ? '#27ae60' : '#e74c3c', fontWeight: 600 }}>
                        {isPositive ? '+' : ''}{amount.toFixed(2)} &#8381;
                      </span>
                      {isEditable && (
                        <button className="btn-danger btn-sm" onClick={() => handleRemoveModifier(m.modifier_id)} style={{ padding: '2px 6px' }}>&times;</button>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {isEditable && (() => {
            const usedIds = orderModifiers.map(m => m.modifier_id)
            const available = allModifiers.filter(m => !usedIds.includes(m.id))
            if (available.length === 0) return null
            return (
              <select
                value=""
                onChange={e => { const v = Number(e.target.value); if (v) void handleAddModifier(v) }}
                style={{ width: 'auto', marginTop: 4 }}
              >
                <option value="">+ Добавить модификатор...</option>
                {available.map(m => (
                  <option key={m.id} value={m.id}>{m.name} ({m.percent > 0 ? '+' : ''}{m.percent}%)</option>
                ))}
              </select>
            )
          })()}

          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 0', borderTop: '2px solid #333', marginTop: 8, fontSize: '1.1em' }}>
            <strong>ИТОГО:</strong>
            <strong>{Number(order.total_amount).toFixed(2)} &#8381;</strong>
          </div>

          {isEditable && order.client_id && orderModifiers.length > 0 && (
            <button className="btn-secondary btn-sm" onClick={handlePushToClient} style={{ alignSelf: 'flex-start' }}>
              Сохранить модификаторы в клиента
            </button>
          )}
        </div>
      </div>

      {/* History */}
      <div className="card">
        <h2>История изменений статуса</h2>
        {history.length === 0 ? (
          <div className="empty">История пуста</div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Время</th>
                <th>Было</th>
                <th>Стало</th>
              </tr>
            </thead>
            <tbody>
              {history.map(h => (
                <tr key={h.id}>
                  <td>{new Date(h.changed_at).toLocaleString('ru')}</td>
                  <td>{h.old_status ? <Badge status={h.old_status} labels={ORDER_STATUS_LABELS} /> : '—'}</td>
                  <td><Badge status={h.new_status} labels={ORDER_STATUS_LABELS} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {showAddItem && (
        <AddItemModal
          orderId={orderId}
          itemTypes={itemTypes}
          onClose={() => setShowAddItem(false)}
          onAdded={() => { setShowAddItem(false); void loadOrder() }}
        />
      )}
      {showPay && <PayModal onClose={() => setShowPay(false)} onPay={handlePay} />}
      {showWarranty && (
        <WarrantyModal
          items={items}
          onClose={() => setShowWarranty(false)}
          onConfirm={handleWarranty}
        />
      )}
    </div>
  )
}
