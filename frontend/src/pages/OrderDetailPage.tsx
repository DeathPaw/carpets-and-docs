import { useEffect, useState, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  getOrder, getOrderItems, getOrderHistory,
  updateOrderStatus, payOrder, createWarrantyOrder,
  setOrderItemPrice, updateOrderItemDescription, updateOrderItemDimensions, duplicateOrder, duplicateItem,
  updateOrderComment,
  updateOrderDetails, updateActualDates,
  getOrderModifiers, addOrderModifier, removeOrderModifier, pushModifiersToClient,
  getItemPhotos, uploadItemPhoto, deleteItemPhoto, getAllOrderPhotos,
  type ItemPhoto,
} from '../api/orders'
import { getItemServices, getAllOrderServices, updateServiceStatus, updateServicePrice, assignServiceEmployees, addServiceToItem } from '../api/services'
import { getItemTypes, getEmployees, getPriceModifiers, getEmployeeRoles } from '../api/references'
import { getClient, getClientModifiers, getClientEvents, addClientEvent } from '../api/clients'
import { useToast } from '../components/Toast'
import ConfirmModal from '../components/ConfirmModal'
import CancelReasonModal from '../components/CancelReasonModal'
import StatusLegend from '../components/StatusLegend'
import DistrictSelect from '../components/DistrictSelect'
import AddressInput from '../components/AddressInput'
import MapMarkers, { type MapPoint } from '../components/MapMarkers'
import { WarrantyModal, AddItemModal, PayModal, DeliverAndPayModal } from '../components/orders/order-detail-modals'
import SkuPicker from '../components/SkuPicker'
import type {
  Order, OrderItem, OrderItemService, OrderStatusHistory,
  ItemType, Employee, OrderStatus, ServiceStatus,
  PaymentType,
  PriceModifier, OrderModifier, Client, EmployeeRole,
} from '../types'

// Подписи статусов и оплаты — общие, см. constants/statuses.ts
import {
  ORDER_STATUS_LABELS,
  ITEM_STATUS_LABELS,
  SERVICE_STATUS_LABELS,
  PAYMENT_LABELS,
} from '../constants/statuses'

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
  // DELIVERED → COMPLETED делается через оплату, не вручную
  DELIVERED: [],
  COMPLETED: [],   // финальный — никаких изменений
  CANCELLED: [],
}

function Badge({ status, labels }: { status: string; labels: Record<string, string> }) {
  return <span className={`badge badge-${status.toLowerCase()}`}>{labels[status] ?? status}</span>
}

// formatOrderNumber теперь общая — см. utils/format.ts
import { formatOrderNumber } from '../utils/format'
import { isViewerMode } from '../utils/viewer'

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
  orderId, item, itemTypeId, employees, roles, onRefresh, isEditable, onOpenDimensions, isDefaultType,
}: {
  orderId: number
  item: OrderItem
  itemTypeId: number
  employees: Employee[]
  /** Все роли (для фильтрации исполнителей по типу позиции). Если undefined — фильтрация пропускается. */
  roles: EmployeeRole[]
  onRefresh: () => void
  isEditable: boolean
  /** Открыть форму редактирования размеров позиции (вызывается из модалки «Заполните размеры»). */
  onOpenDimensions: () => void
  /**
   * Тип позиции — дефолтный (доставка/оформление). У таких услуг цена не показывается:
   * фактическая стоимость уже отображена на самой позиции (default_price /
   * free_threshold-логика), а дублирование цены услуги вводит в заблуждение
   * («200 на позиции + 200 на услуге = 400» → нет, это одна и та же сумма).
   */
  isDefaultType: boolean
}) {
  const { showToast } = useToast()
  const itemId = item.id
  const [services, setServices] = useState<OrderItemService[]>([])
  const [loading, setLoading] = useState(true)
  const [skuPickerOpen, setSkuPickerOpen] = useState(false)
  const [assignModal, setAssignModal] = useState<number | null>(null)
  const [selectedEmployees, setSelectedEmployees] = useState<number[]>([])
  const [employeeSearch, setEmployeeSearch] = useState('')
  const [editingPrice, setEditingPrice] = useState<number | null>(null)
  const [priceValue, setPriceValue] = useState('')
  const [dimWarning, setDimWarning] = useState('')
  // Модалка «Заполните размеры» при попытке перевести услугу в работу/готова без размеров.
  // Раньше блок приходил из бэка как 422-ошибка с тостом — оператор не сразу понимал что делать.
  // Теперь спрашиваем заранее и предлагаем кнопку «Заполнить размеры».
  const [statusBlockModal, setStatusBlockModal] = useState<{serviceId: number, missing: string} | null>(null)

  const load = async () => {
    setLoading(true)
    try {
      const servicesData = await getItemServices(orderId, itemId)
      setServices(servicesData)
      void itemTypeId // unused after V10 — SKU выбирается через SkuPicker по атрибутам
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void load() }, [orderId, itemId, itemTypeId])

  const [cancelServiceId, setCancelServiceId] = useState<number | null>(null)

  const changeStatus = async (serviceId: number, status: ServiceStatus) => {
    // Отмена — спросим причину в модалке.
    if (status === 'CANCELLED') {
      setCancelServiceId(serviceId)
      return
    }
    // Превентивная проверка размеров. Бэк тоже валидирует и вернёт 422,
    // но фронт может сразу показать понятное окно с кнопкой «Заполнить».
    if (status === 'IN_PROGRESS' || status === 'DONE') {
      const svc = services.find(s => s.id === serviceId)
      // V10: pricing_type теперь приходит на самой услуге (OrderItemService.pricing_type),
      // не нужно искать в каталоге.
      const check = checkDimensionsForPricing(svc?.pricing_type, item)
      if (!check.ok) {
        setStatusBlockModal({ serviceId, missing: check.missing })
        return
      }
    }
    try {
      await updateServiceStatus(orderId, itemId, serviceId, { status })
      await load()
      onRefresh()
    } catch (e: unknown) { const msg = (e as any)?.response?.data?.message || 'Ошибка смены статуса услуги'; showToast(msg, 'error') }
  }

  const confirmCancelService = async (reason: string) => {
    if (cancelServiceId === null) return
    try {
      await updateServiceStatus(orderId, itemId, cancelServiceId, {
        status: 'CANCELLED',
        cancellation_reason: reason,
      })
      setCancelServiceId(null)
      await load()
      onRefresh()
    } catch (e: unknown) {
      const msg = (e as any)?.response?.data?.message || 'Ошибка отмены услуги'
      showToast(msg, 'error')
    }
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
    } catch (e: unknown) { const msg = (e as any)?.response?.data?.message || 'Ошибка назначения исполнителей'; showToast(msg, 'error') }
  }

  /**
   * V10: добавление услуги через SkuPicker. Picker сам показывает «подходящие»
   * по атрибутам SKU. Превентивная проверка размеров теперь делается на бэке
   * при попытке перевести услугу в работу — не блокируем сам факт добавления.
   */
  const doAddService = async (skuId: number) => {
    try {
      await addServiceToItem(orderId, itemId, { sku_id: skuId })
      setDimWarning('')
      await load()
      onRefresh()
    } catch (e: unknown) { const msg = (e as any)?.response?.data?.message || 'Ошибка добавления услуги'; showToast(msg, 'error') }
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
    } catch (e: unknown) { const msg = (e as any)?.response?.data?.message || 'Ошибка изменения цены'; showToast(msg, 'error') }
  }

  if (loading) return <div className="loading">Загрузка услуг...</div>

  // Дубли запрещены, но отменённая услуга освобождает слот — её можно добавить заново.
  const activeSkuIds = new Set(
    services.filter(s => s.status !== 'CANCELLED').map(s => s.sku_id)
  )

  // Фильтрация по ролям: показываем только тех, чья роль включает тип позиции,
  // ИЛИ кто без роли (универсалы). Если ролей нет вообще — показываем всех.
  // Это reflects бизнес-правило «Вася работает только с коврами».
  const itemTypeIdNum = item.item_type_id
  const suitableByRole = (e: Employee): boolean => {
    if (e.role_id == null) return true
    const role = roles.find(r => r.id === e.role_id)
    if (!role) return true
    return role.item_type_ids.includes(itemTypeIdNum)
  }
  const filteredEmployees = employees
    .filter(suitableByRole)
    .filter(e => e.name.toLowerCase().includes(employeeSearch.toLowerCase()))

  // Определяем, заблокирована ли услуга по размерам (pricing_type vs item dimensions).
  // V10: pricing_type приходит на самой услуге (OrderItemService.pricing_type).
  const isServiceBlocked = (s: OrderItemService): boolean => {
    const check = checkDimensionsForPricing(s.pricing_type, item)
    return !check.ok
  }

  return (
    <div style={{ marginTop: 8 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8, gap: 12, flexWrap: 'wrap' }}>
        <h4 style={{ margin: 0 }}>Услуги</h4>
        {/* V10: вместо чипов «+ Стирка / + Чистка» — единая кнопка с открытием
            SkuPicker'а. Picker сам показывает подходящие SKU по атрибутам позиции. */}
        {isEditable && (
          <button
            type="button"
            onClick={() => setSkuPickerOpen(true)}
            className="btn-primary btn-sm"
          >+ Добавить услугу</button>
        )}
      </div>

      {dimWarning && <div className="error-msg" style={{ marginBottom: 8 }}>{dimWarning}</div>}

      {services.length === 0 ? (
        <div className="empty">Нет услуг</div>
      ) : (
        <table className="services-table">
          <thead>
            <tr>
              <th>Услуга</th>
              <th style={{ width: 110 }}>Статус</th>
              {/* Колонка «Стоимость» — только для НЕ дефолтных типов. У доставки/оформления
                  стоимость задаётся самой позицией (default_price), услуги её не определяют. */}
              {!isDefaultType && <th style={{ width: 110, textAlign: 'right' }}>Стоимость</th>}
              <th style={{ width: 170 }}>Исполнители</th>
              {/* 280 вместо 220 — раньше кнопка «Исполнители» обрезалась справа,
                  потому что select(115) + gap + button(~120px) ≈ 250px не помещались. */}
              {isEditable && <th style={{ width: 280, textAlign: 'right' }}>Действия</th>}
            </tr>
          </thead>
          <tbody>
            {services.map(s => {
              const blocked = isServiceBlocked(s)
              const noAssignees = !s.assignees || s.assignees.length === 0
              // Подсказку «Назначьте исполнителя» помещаем в колонку «Исполнители» —
              // чтобы колонка «Действия» во всех строках имела одинаковый layout (select + кнопка).
              const showAssignHint = noAssignees && s.status === 'CREATED' && !blocked
              return (
                <tr key={s.id} style={blocked ? { background: '#fff3cd' } : undefined}>
                  <td>
                    {s.sku_name ?? `Услуга #${s.sku_id}`}
                    {blocked && (
                      <div style={{ fontSize: '0.8em', color: '#e67e22', fontWeight: 600 }}>
                        Не заполнены размеры
                      </div>
                    )}
                  </td>
                  <td>
                    <Badge status={s.status} labels={SERVICE_STATUS_LABELS} />
                    {s.status === 'CANCELLED' && s.cancellation_reason && (
                      <div
                        style={{ fontSize: '0.78em', color: '#888', marginTop: 2, lineHeight: 1.3, whiteSpace: 'normal' }}
                        title={s.cancellation_reason}
                      >
                        {s.cancellation_reason}
                      </div>
                    )}
                  </td>
                  {/* \u041A\u043E\u043B\u043E\u043D\u043A\u0430 \u00AB\u0421\u0442\u043E\u0438\u043C\u043E\u0441\u0442\u044C\u00BB \u2014 \u0442\u043E\u043B\u044C\u043A\u043E \u0434\u043B\u044F \u041D\u0415 \u0434\u0435\u0444\u043E\u043B\u0442\u043D\u044B\u0445. \u0414\u043B\u044F \u0434\u0435\u0444\u043E\u043B\u0442\u043E\u0432 <td> \u0432\u043E\u043E\u0431\u0449\u0435
                      \u043D\u0435 \u0432\u044B\u0432\u043E\u0434\u0438\u043C, \u0447\u0442\u043E\u0431\u044B \u043D\u0435 \u043F\u043B\u043E\u0434\u0438\u0442\u044C \u043F\u0443\u0441\u0442\u044B\u0435 \u044F\u0447\u0435\u0439\u043A\u0438. */}
                  {!isDefaultType && (
                  <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                    {isEditable && editingPrice === s.id ? (
                      <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
                        <input
                          value={priceValue}
                          onChange={e => setPriceValue(e.target.value)}
                          style={{ width: 80 }}
                        />
                        <button className="btn-success btn-sm" onClick={savePriceEdit}>&#10003;</button>
                        <button className="btn-secondary btn-sm" onClick={() => setEditingPrice(null)}>&#10005;</button>
                      </div>
                    ) : (
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, justifyContent: 'flex-end' }}>
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
                      </span>
                    )}
                  </td>
                  )}
                  <td>
                    {!noAssignees ? (
                      s.assignees!.map(e => e.name).join(', ')
                    ) : showAssignHint ? (
                      <span style={{ color: '#e67e22', fontSize: '0.85em', fontWeight: 600 }}>
                        Назначьте исполнителя
                      </span>
                    ) : (
                      <span style={{ color: '#aaa' }}>—</span>
                    )}
                  </td>
                  {isEditable && (
                    <td style={{ textAlign: 'right' }}>
                      <div style={{ display: 'inline-flex', gap: 6, alignItems: 'center', justifyContent: 'flex-end' }}>
                        {/* Селект показываем всегда. Если размеры не заполнены — попытка перевести
                            в IN_PROGRESS/DONE откроет модалку «Заполните размеры», а не молча
                            заблокирует. Селект подсвечен оранжевым, чтобы оператор понимал почему. */}
                        <select
                          value={s.status}
                          onChange={e => changeStatus(s.id, e.target.value as ServiceStatus)}
                          style={{
                            width: 115,
                            fontSize: '0.9em',
                            ...(blocked ? { borderColor: '#e67e22', background: '#fff3cd' } : {}),
                          }}
                          title={blocked ? 'Размеры позиции не заполнены — попытка перевести в работу откроет окно подсказки' : undefined}
                        >
                          <option value="CREATED">Создана</option>
                          {!showAssignHint && <option value="IN_PROGRESS">В работе</option>}
                          {!showAssignHint && <option value="DONE">Готова</option>}
                          <option value="CANCELLED">Отменена</option>
                        </select>
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

      {/* Модалка-блокер при попытке перевести услугу в работу/готова без размеров.
          Раньше была только подсказка в tooltip. Теперь — явная модалка
          с прямой кнопкой «Заполнить размеры», которая открывает форму редактирования. */}
      {statusBlockModal && (
        <div className="modal-overlay" onClick={() => setStatusBlockModal(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h2>Заполните размеры позиции</h2>
            <p>
              Чтобы перевести услугу в работу, нужно указать <strong>{statusBlockModal.missing}</strong>.
            </p>
            <div className="modal-actions">
              <button className="btn-secondary" onClick={() => setStatusBlockModal(null)}>Закрыть</button>
              <button className="btn-primary" onClick={() => {
                setStatusBlockModal(null)
                onOpenDimensions()
              }}>Заполнить размеры</button>
            </div>
          </div>
        </div>
      )}

      {/* V10: модалка «заполните размеры перед добавлением» удалена —
          SkuPicker не требует размеров, добавлять услугу можно всегда.
          Если размеры нужны для расчёта (BY_AREA/BY_WEIGHT/…), бэк блокирует
          переход услуги в работу/готова — для этого случая есть statusBlockModal. */}

      {assignModal !== null && (() => {
        // Подсказка: какие роли подходят для этого типа позиции — оператор должен
        // понимать, почему список исполнителей в одной услуге отличается от другой.
        // Показываем имена ролей, у которых текущий item_type_id входит в их список.
        const matchingRoles = roles.filter(r => r.item_type_ids.includes(item.item_type_id))
        const itemTypeName = item.item_type_name || `тип #${item.item_type_id}`
        return (
          <div className="modal-overlay" onClick={() => setAssignModal(null)}>
            <div className="modal" onClick={e => e.stopPropagation()}>
              <h2>Назначить исполнителей</h2>
              <div className="notice notice-info" style={{ fontSize: '0.85em' }}>
                <div><strong>Тип позиции:</strong> {itemTypeName}</div>
                <div style={{ marginTop: 4 }}>
                  <strong>Видны исполнители:</strong>{' '}
                  {matchingRoles.length > 0 ? (
                    <>с ролью {matchingRoles.map(r => `«${r.name}»`).join(', ')} или без роли (универсалы)</>
                  ) : (
                    <>только без роли (универсалы) — ни одна роль не включает этот тип</>
                  )}
                </div>
              </div>
              <div className="form-group">
                <input
                  value={employeeSearch}
                  onChange={e => setEmployeeSearch(e.target.value)}
                  placeholder="Поиск по имени..."
                />
              </div>
              <div style={{ maxHeight: 240, overflowY: 'auto' }}>
                {filteredEmployees.length === 0 && (
                  <div className="empty">Нет подходящих исполнителей</div>
                )}
                {filteredEmployees.map(emp => {
                  const role = emp.role_id != null ? roles.find(r => r.id === emp.role_id) : null
                  return (
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
                      <span>{emp.name}</span>
                      {/* Бейдж роли — оператор сразу видит, почему именно этот исполнитель подходит. */}
                      {role
                        ? <span style={{
                            fontSize: '0.78em', padding: '1px 6px', borderRadius: 8,
                            background: '#ecf0f1', color: '#7f8c8d',
                          }}>{role.name}</span>
                        : <span style={{ fontSize: '0.78em', color: '#aaa', fontStyle: 'italic' }}>универсал</span>
                      }
                    </label>
                  )
                })}
              </div>
              <div className="modal-actions">
                <button className="btn-secondary" onClick={() => setAssignModal(null)}>Отмена</button>
                <button className="btn-primary" onClick={saveAssign}>Сохранить</button>
              </div>
            </div>
          </div>
        )
      })()}

      {cancelServiceId !== null && (
        <CancelReasonModal
          title="Отмена услуги"
          subject={(() => {
            const s = services.find(s => s.id === cancelServiceId)
            return s ? `Услуга «${s.sku_name}» будет отменена.` : undefined
          })()}
          onCancel={() => setCancelServiceId(null)}
          onConfirm={confirmCancelService}
        />
      )}

      {skuPickerOpen && (
        <SkuPicker
          item={item}
          excludeSkuIds={activeSkuIds}
          onSelect={skuId => void doAddService(skuId)}
          onClose={() => setSkuPickerOpen(false)}
        />
      )}
    </div>
  )
}

// ---- Item Row ----
function ItemRow({
  item, index, orderId, employees, roles, onRefresh, isEditable, initialPhotos, isDefaultType,
  freshlyAdded,
}: {
  item: OrderItem
  index: number
  orderId: number
  employees: Employee[]
  roles: EmployeeRole[]
  onRefresh: () => void
  isEditable: boolean
  /** Фото, переданные из родителя (батч-fetch). Если не передано — компонент сам подгрузит. */
  initialPhotos?: ItemPhoto[]
  /** Дефолтный тип (доставка/оформление) — пробрасывается в ServicesPanel,
      чтобы тот скрыл цены услуг (они входят в стоимость позиции). */
  isDefaultType: boolean
  /** true — позиция только что добавлена в этой же сессии. Тогда:
      • строка автоматически раскрыта (детали + услуги видны),
      • режим редактирования описания включён сразу,
      • фокус ставится на поле описания.
      Миша на встрече 11 мая: «не заставляй оператора отдельно раскрывать каждую
      только что добавленную позицию — это лишний клик». */
  freshlyAdded?: boolean
}) {
  const { showToast } = useToast()
  const [expanded, setExpanded] = useState(!!freshlyAdded)
  const [editPrice, setEditPrice] = useState(false)
  const [editDimensions, setEditDimensions] = useState(!!freshlyAdded && isEditable)
  const [editDesc, setEditDesc] = useState(!!freshlyAdded && isEditable)
  const [photos, setPhotos] = useState<{id: number, filename: string, content_type: string, data: string}[]>(
    initialPhotos ? initialPhotos.map(p => ({ id: p.id, filename: p.filename, content_type: p.content_type, data: p.data })) : []
  )
  const [photoPreview, setPhotoPreview] = useState<string | null>(null)
  const [uploadingPhoto, setUploadingPhoto] = useState(false)
  const [photosEditMode, setPhotosEditMode] = useState(false)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
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

  // Загружаем фото при монтировании только если родитель не передал initialPhotos —
  // обычно фото приходят батчем из OrderDetailPage. Fallback нужен для standalone-использования.
  useEffect(() => {
    if (initialPhotos) {
      setPhotos(initialPhotos.map(p => ({ id: p.id, filename: p.filename, content_type: p.content_type, data: p.data })))
      return
    }
    getItemPhotos(orderId, item.id).then(setPhotos).catch(() => {})
  }, [orderId, item.id, initialPhotos])

  const handlePhotoUpload = async (file: File) => {
    setUploadingPhoto(true)
    try {
      await uploadItemPhoto(orderId, item.id, file)
      const p = await getItemPhotos(orderId, item.id)
      setPhotos(p)
    } catch { showToast('Ошибка загрузки фото', 'error') }
    finally { setUploadingPhoto(false) }
  }

  const handlePhotoDelete = async (photoId: number) => {
    try {
      await deleteItemPhoto(orderId, item.id, photoId)
      setPhotos(prev => prev.filter(p => p.id !== photoId))
    } catch { showToast('Ошибка удаления фото', 'error') }
  }

  const saveDesc = async () => {
    try {
      await updateOrderItemDescription(orderId, item.id, {
        description: descValue || null,
        defects: defectsValue || null,
      })
      setEditDesc(false)
      onRefresh()
    } catch (e: unknown) { const msg = (e as any)?.response?.data?.message || 'Ошибка сохранения описания'; showToast(msg, 'error') }
  }

  const savePrice = async () => {
    try {
      await setOrderItemPrice(orderId, item.id, { price: Number(price) })
      setEditPrice(false)
      onRefresh()
    } catch (e: unknown) { const msg = (e as any)?.response?.data?.message || 'Ошибка изменения цены'; showToast(msg, 'error') }
  }

  const saveDimensions = async () => {
    // Валидация: только положительные числа в разумных пределах. Защищает от опечаток
    // (длина 9999, отрицательный вес и т.п.) которые потом сломают расчёт цены.
    const fields: { key: keyof typeof dimensions; label: string; max: number }[] = [
      { key: 'length',         label: 'Длина',     max: 50 },     // м
      { key: 'width',          label: 'Ширина',    max: 50 },     // м
      { key: 'weight',         label: 'Вес',       max: 500 },    // кг
      { key: 'area',           label: 'Площадь',   max: 2500 },   // м²
      { key: 'running_meters', label: 'Пог.метры', max: 1000 },   // м
    ]
    for (const f of fields) {
      const raw = dimensions[f.key]
      if (!raw) continue
      const n = Number(raw)
      if (!Number.isFinite(n) || n <= 0) {
        showToast(`${f.label}: укажите положительное число`, 'error')
        return
      }
      if (n > f.max) {
        showToast(`${f.label}: значение слишком большое (максимум ${f.max})`, 'error')
        return
      }
    }
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
    } catch (e: unknown) { const msg = (e as any)?.response?.data?.message || 'Ошибка сохранения размеров'; showToast(msg, 'error') }
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
        <td>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {photos.length > 0 && (
              <img
                src={`data:${photos[0].content_type};base64,${photos[0].data}`}
                alt=""
                onClick={e => { e.stopPropagation(); setPhotoPreview(`data:${photos[0].content_type};base64,${photos[0].data}`) }}
                style={{
                  width: 40, height: 40, objectFit: 'cover', borderRadius: 4,
                  border: '1px solid #ddd', cursor: 'pointer', flexShrink: 0,
                }}
                title={photos.length > 1 ? `+${photos.length - 1} фото` : ''}
              />
            )}
            <span>{item.item_type_name ?? `Тип #${item.item_type_id}`}</span>
          </div>
        </td>
        <td>
          {isEditable && editDesc ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <input
                value={descValue}
                onChange={e => setDescValue(e.target.value)}
                placeholder="Описание"
                style={{ width: '100%' }}
                // autoFocus только когда позиция «свежеподнятая» — иначе при
                // случайном клике на ✏️ пользователь не теряет фокус из других мест.
                autoFocus={freshlyAdded}
              />
              <input
                value={defectsValue}
                onChange={e => setDefectsValue(e.target.value)}
                placeholder="Дефекты"
                style={{ width: '100%' }}
              />
              {/* tabIndex=-1 на ✓/✕ — Tab проходит мимо них к следующей позиции
                  (или к полям размеров), фидбэк 11 мая по tab-порядку. Кнопки
                  остаются кликабельными. */}
              <div style={{ display: 'flex', gap: 4 }}>
                <button className="btn-success btn-sm" tabIndex={-1} onClick={saveDesc}>&#10003;</button>
                <button className="btn-secondary btn-sm" tabIndex={-1} onClick={() => { setEditDesc(false); setDescValue(item.description || ''); setDefectsValue(item.defects || '') }}>&#10005;</button>
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
                  type="number" min={0} step="0.01"
                  placeholder="Длина"
                  value={dimensions.length}
                  onChange={e => setDimensions(d => ({...d, length: e.target.value}))}
                  style={{ width: 60 }}
                />
                <input
                  type="number" min={0} step="0.01"
                  placeholder="Ширина"
                  value={dimensions.width}
                  onChange={e => setDimensions(d => ({...d, width: e.target.value}))}
                  style={{ width: 60 }}
                />
                <input
                  type="number" min={0} step="0.01"
                  placeholder="Вес"
                  value={dimensions.weight}
                  onChange={e => setDimensions(d => ({...d, weight: e.target.value}))}
                  style={{ width: 60 }}
                />
              </div>
              <div style={{ display: 'flex', gap: 4 }}>
                <input
                  type="number" min={0} step="0.01"
                  placeholder="Площадь"
                  value={dimensions.area}
                  onChange={e => setDimensions(d => ({...d, area: e.target.value}))}
                  style={{ width: 60 }}
                />
                <input
                  type="number" min={0} step="0.01"
                  placeholder="Пог.м"
                  value={dimensions.running_meters}
                  onChange={e => setDimensions(d => ({...d, running_meters: e.target.value}))}
                  style={{ width: 60 }}
                />
              </div>
              <div style={{ display: 'flex', gap: 4 }}>
                <button className="btn-success btn-sm" tabIndex={-1} onClick={saveDimensions}>&#10003;</button>
                <button className="btn-secondary btn-sm" tabIndex={-1} onClick={() => setEditDimensions(false)}>&#10005;</button>
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
        <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
          {isEditable && editPrice ? (
            <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
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
        {isEditable && (
          <td style={{ textAlign: 'right' }}>
            <button
              className="btn-secondary btn-sm"
              onClick={async () => {
                try {
                  await duplicateItem(orderId, item.id)
                  onRefresh()
                } catch (e: unknown) { const msg = (e as any)?.response?.data?.message || 'Ошибка дублирования позиции'; showToast(msg, 'error') }
              }}
              title="Дублировать позицию"
            >Дубль</button>
          </td>
        )}
      </tr>
      {expanded && (
        <tr>
          <td colSpan={isEditable ? 7 : 6} style={{ background: '#f8f9fa', padding: '12px 20px' }}>
            {/* Photo section */}
            <div style={{ marginBottom: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                <h4 style={{ margin: 0 }}>Фото</h4>
                {isEditable && (
                  <>
                    <button
                      className="btn-secondary btn-sm"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={uploadingPhoto}
                    >
                      {uploadingPhoto ? 'Загрузка...' : 'Добавить фото'}
                    </button>
                    <input
                      ref={el => { fileInputRef.current = el }}
                      type="file"
                      accept="image/*"
                      style={{ display: 'none' }}
                      onChange={e => {
                        const f = e.target.files?.[0]
                        if (f) { void handlePhotoUpload(f) }
                        e.target.value = ''
                      }}
                    />
                  </>
                )}
              </div>
              {photos.length > 0 && (
                <>
                  {isEditable && (
                    <div style={{ marginBottom: 6 }}>
                      <button
                        type="button"
                        className="btn-secondary btn-sm"
                        onClick={() => setPhotosEditMode(m => !m)}
                        style={photosEditMode ? { background: '#e67e22', color: '#fff' } : undefined}
                      >
                        {photosEditMode ? 'Готово' : '✏️ Редактировать фото'}
                      </button>
                      {photosEditMode && (
                        <span style={{ marginLeft: 8, color: '#e67e22', fontSize: '0.85em' }}>
                          Нажмите ✕ на фото — удалит. Нажмите «Готово» когда закончили.
                        </span>
                      )}
                    </div>
                  )}
                  <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 4 }}>
                    {photos.map(p => (
                      <div key={p.id} style={{ position: 'relative', flexShrink: 0 }}>
                        <img
                          src={`data:${p.content_type};base64,${p.data}`}
                          alt={p.filename}
                          style={{
                            width: 80, height: 80, objectFit: 'cover', borderRadius: 4,
                            cursor: 'pointer',
                            border: photosEditMode ? '2px solid #e67e22' : '1px solid #ddd',
                          }}
                          onClick={() => setPhotoPreview(`data:${p.content_type};base64,${p.data}`)}
                        />
                        {isEditable && photosEditMode && (
                          <button
                            onClick={() => void handlePhotoDelete(p.id)}
                            title="Удалить фото"
                            style={{
                              position: 'absolute', top: -6, right: -6,
                              width: 22, height: 22, borderRadius: '50%',
                              background: '#e74c3c', color: '#fff', border: '2px solid #fff',
                              cursor: 'pointer', fontSize: 13, lineHeight: '18px',
                              padding: 0, textAlign: 'center',
                              boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
                            }}
                          >&times;</button>
                        )}
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
            {photoPreview && (
              <div
                className="modal-overlay"
                onClick={() => setPhotoPreview(null)}
                style={{ zIndex: 1000 }}
              >
                <div onClick={e => e.stopPropagation()} style={{ maxWidth: '90vw', maxHeight: '90vh' }}>
                  <img
                    src={photoPreview}
                    alt="preview"
                    style={{ maxWidth: '90vw', maxHeight: '85vh', borderRadius: 8 }}
                  />
                  <div style={{ textAlign: 'center', marginTop: 8 }}>
                    <button className="btn-secondary" onClick={() => setPhotoPreview(null)}>Закрыть</button>
                  </div>
                </div>
              </div>
            )}
            <ServicesPanel orderId={orderId} item={item} itemTypeId={item.item_type_id} employees={employees} roles={roles} onRefresh={onRefresh} isEditable={isEditable} onOpenDimensions={() => setEditDimensions(true)} isDefaultType={isDefaultType} />
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
  const { showToast } = useToast()
  const orderId = Number(id)

  const [order, setOrder] = useState<Order | null>(null)
  const [items, setItems] = useState<OrderItem[]>([])
  // Все фото по заказу одним батчем — раздаём в ItemRow через initialPhotos.
  // До этого ItemRow сам fetch'ил фото на mount → N запросов на N позиций.
  const [photosByItemId, setPhotosByItemId] = useState<Map<number, ItemPhoto[]>>(new Map())
  // ID позиций, которые оператор только что добавил в этой сессии. ItemRow
  // по этому флагу автоматически раскрывается и фокусит поле описания
  // (Спринт A.4, замечание Миши: «не заставляй раскрывать каждую вручную»).
  // Сбрасывается при уходе со страницы — повторно не сработает.
  const [freshlyAddedIds, setFreshlyAddedIds] = useState<Set<number>>(new Set())
  const [history, setHistory] = useState<OrderStatusHistory[]>([])
  const [itemTypes, setItemTypes] = useState<ItemType[]>([])
  const [employees, setEmployees] = useState<Employee[]>([])
  // Роли — для фильтрации списка исполнителей при назначении услуги (по типу позиции).
  const [roles, setRoles] = useState<EmployeeRole[]>([])
  const [loading, setLoading] = useState(true)
  const [showAddItem, setShowAddItem] = useState(false)
  const [showPay, setShowPay] = useState(false)
  const [showDeliverAndPay, setShowDeliverAndPay] = useState(false)
  const [showWarranty, setShowWarranty] = useState(false)
  const [error, setError] = useState('')
  const [orderModifiers, setOrderModifiers] = useState<OrderModifier[]>([])
  const [allModifiers, setAllModifiers] = useState<PriceModifier[]>([])
  const [showClientCard, setShowClientCard] = useState<Client | null>(null)
  const [clientCardMods, setClientCardMods] = useState<PriceModifier[]>([])
  const [clientEvents, setClientEvents] = useState<{id: number, client_id: number, event_type: string, description: string, created_at: string}[]>([])
  const [newEventNote, setNewEventNote] = useState('')
  const [editComment, setEditComment] = useState(false)
  const [commentValue, setCommentValue] = useState('')
  const [editDetails, setEditDetails] = useState(false)
  const [mapVisible, setMapVisible] = useState(false)
  const [confirmAction, setConfirmAction] = useState<{title: string, message: string, action: () => void} | null>(null)
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
    pickup_lat: null as number | null,
    pickup_lon: null as number | null,
    delivery_lat: null as number | null,
    delivery_lon: null as number | null,
  })

  const loadOrder = async () => {
    try {
      const [o, its, hist, allPhotos] = await Promise.all([
        getOrder(orderId),
        getOrderItems(orderId),
        getOrderHistory(orderId),
        getAllOrderPhotos(orderId).catch(() => [] as ItemPhoto[]),
      ])
      setOrder(o)
      setItems(its)
      setHistory(hist)
      // Раскладываем фото по позициям в Map<itemId, photos[]> — один проход вместо N fetch.
      const grouped = new Map<number, ItemPhoto[]>()
      allPhotos.forEach(p => {
        const arr = grouped.get(p.order_item_id) || []
        arr.push(p)
        grouped.set(p.order_item_id, arr)
      })
      setPhotosByItemId(grouped)
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
        pickup_lat: o.pickup_lat,
        pickup_lon: o.pickup_lon,
        delivery_lat: o.delivery_lat,
        delivery_lon: o.delivery_lon,
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
      getEmployeeRoles().then(setRoles).catch(() => {}),
      getPriceModifiers().then(setAllModifiers).catch(() => {}),
    ]).finally(() => setLoading(false))
  }, [orderId])

  const [showCancelOrderModal, setShowCancelOrderModal] = useState(false)

  const changeOrderStatus = async (status: OrderStatus) => {
    if (status === 'CANCELLED') {
      setShowCancelOrderModal(true)
      return
    }
    try {
      const updated = await updateOrderStatus(orderId, { status })
      setOrder(updated)
      const hist = await getOrderHistory(orderId)
      setHistory(hist)
    } catch (e: unknown) { const msg = (e as any)?.response?.data?.message || 'Ошибка смены статуса'; showToast(msg, 'error') }
  }

  const confirmCancelOrder = async (reason: string) => {
    try {
      const updated = await updateOrderStatus(orderId, { status: 'CANCELLED', cancellation_reason: reason })
      setOrder(updated)
      const hist = await getOrderHistory(orderId)
      setHistory(hist)
      setShowCancelOrderModal(false)
    } catch (e: unknown) {
      const msg = (e as any)?.response?.data?.message || 'Ошибка отмены заказа'
      showToast(msg, 'error')
    }
  }

  const handleDeliverAndPay = async (data: { date: string; slot: string; paymentType: PaymentType }) => {
    try {
      // 1. Назначаем фактическую дату/слот доставки.
      await updateActualDates(orderId, {
        actual_delivery_date: data.date,
        actual_delivery_time_slot: data.slot || null,
      })
      // 2. Переводим в DELIVERED. Бэк проверит, что actual_delivery_date указана — теперь да.
      await updateOrderStatus(orderId, { status: 'DELIVERED' })
      // 3. Оплачиваем — бэк сам переведёт в COMPLETED.
      const updated = await payOrder(orderId, { payment_type: data.paymentType })
      setOrder(updated)
      setShowDeliverAndPay(false)
      const hist = await getOrderHistory(orderId)
      setHistory(hist)
    } catch (e: unknown) {
      const msg = (e as any)?.response?.data?.message || 'Не удалось принять оплату'
      showToast(msg, 'error')
    }
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
    // Валидация дат: забор не в прошлом, доставка >= забора.
    const today = new Date().toISOString().slice(0, 10)
    if (details.pickup_date && details.pickup_date < today) {
      showToast('Дата забора не может быть в прошлом', 'error')
      return
    }
    if (details.pickup_date && details.delivery_date && details.delivery_date < details.pickup_date) {
      showToast('Дата доставки не может быть раньше даты забора', 'error')
      return
    }
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
        pickup_lat: details.pickup_lat,
        pickup_lon: details.pickup_lon,
        delivery_lat: details.delivery_lat,
        delivery_lon: details.delivery_lon,
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
    } catch (e: unknown) { const msg = (e as any)?.response?.data?.message || 'Ошибка добавления модификатора'; showToast(msg, 'error') }
  }

  const handleRemoveModifier = async (modifierId: number) => {
    try {
      await removeOrderModifier(orderId, modifierId)
      await loadOrder()
      const mods = await getOrderModifiers(orderId)
      setOrderModifiers(mods)
    } catch (e: unknown) { const msg = (e as any)?.response?.data?.message || 'Ошибка удаления модификатора'; showToast(msg, 'error') }
  }

  const handlePushToClient = async () => {
    try {
      await pushModifiersToClient(orderId)
      setError('')
      showToast('Модификаторы сохранены в клиента', 'success')
    } catch (e: unknown) { const msg = (e as any)?.response?.data?.message || 'Ошибка сохранения модификаторов в клиента'; showToast(msg, 'error') }
  }

  const openClientCard = async () => {
    if (!order?.client_id) return
    try {
      const c = await getClient(order.client_id)
      setShowClientCard(c)
      const mods = await getClientModifiers(order.client_id)
      setClientCardMods(mods)
      getClientEvents(order.client_id).then(evts => setClientEvents(evts.slice(0, 10))).catch(() => {})
    } catch (e: unknown) { const msg = (e as any)?.response?.data?.message || 'Ошибка загрузки клиента'; showToast(msg, 'error') }
  }

  const handlePrintPdf = async () => {
    if (!order) return
    const modRows = orderModifiers.map(m => {
      const amount = Number(order.base_amount) * m.percent / 100
      const sign = amount >= 0 ? '+' : ''
      return `<tr><td style="padding:4px 8px">${m.modifier_name} (${m.percent > 0 ? '+' : ''}${m.percent}%)</td><td style="padding:4px 8px;text-align:right">${sign}${amount.toFixed(2)} руб.</td></tr>`
    }).join('')

    // Загружаем услуги для всех позиций ОДНИМ батч-запросом (раньше было N запросов).
    const allFlat = await getAllOrderServices(orderId).catch(() => [])
    const servicesByItem = new Map<number, typeof allFlat>()
    allFlat.forEach(s => {
      const arr = servicesByItem.get(s.order_item_id) || []
      arr.push(s)
      servicesByItem.set(s.order_item_id, arr)
    })

    // V10: «авто-добавленные» позиции теперь определяются на уровне SKU (is_auto_add),
    // а не типа позиции. Здесь для печати считаем, что все позиции одинаково значимы.
    const itemRows = items.map((it, idx) => {
      const isDefault = false
      const svcList = servicesByItem.get(it.id) || []
      const svcRows = svcList.map(s =>
        `<tr style="background:#fafafa;font-size:11px">
          <td style="padding:2px 8px 2px 24px" colspan="3">— ${s.sku_name || 'Услуга #' + s.sku_id}
            <span style="color:#888;margin-left:8px">(${SERVICE_STATUS_LABELS[s.status] || s.status})</span>
          </td>
          <td style="padding:2px 8px"></td>
          <td style="padding:2px 8px;text-align:right">${Number(s.price).toFixed(2)} руб.</td>
        </tr>`
      ).join('')
      return `<tr${isDefault ? ' style="color:#888"' : ''}>
        <td style="padding:4px 8px">${idx + 1}</td>
        <td style="padding:4px 8px">${it.item_type_name || 'Тип #' + it.item_type_id}</td>
        <td style="padding:4px 8px">${it.description || '—'}${it.defects ? '<br><span style="color:#e67e22;font-size:0.9em">Дефекты: ' + it.defects + '</span>' : ''}</td>
        <td style="padding:4px 8px">${it.length ? it.length + '×' + (it.width || 0) : '—'}${it.weight ? ' (' + it.weight + 'кг)' : ''}${it.area ? ' S=' + it.area : ''}${it.running_meters ? ' ' + it.running_meters + 'п.м.' : ''}</td>
        <td style="padding:4px 8px;text-align:right;font-weight:bold">${Number(it.price).toFixed(2)} руб.</td>
      </tr>${svcRows}`
    }).join('')

    const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Заказ ${formatOrderNumber(order.id, order.created_at)}</title>
<style>
  body { font-family: Arial, sans-serif; font-size: 13px; margin: 30px; color: #333; }
  h1 { font-size: 18px; margin: 0 0 4px; }
  h2 { font-size: 14px; margin: 16px 0 8px; border-bottom: 1px solid #999; padding-bottom: 4px; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 12px; }
  th { background: #f0f0f0; text-align: left; padding: 4px 8px; border: 1px solid #ccc; font-size: 12px; }
  td { border: 1px solid #ccc; font-size: 12px; vertical-align: top; }
  .header { text-align: center; margin-bottom: 20px; border-bottom: 2px solid #333; padding-bottom: 10px; }
  .company { font-size: 20px; font-weight: bold; letter-spacing: 2px; }
  .info-grid { display: flex; gap: 30px; margin-bottom: 12px; }
  .info-col { flex: 1; }
  .info-row { margin-bottom: 4px; }
  .label { font-weight: bold; }
  .total-row { font-size: 15px; font-weight: bold; }
  .signatures { display: flex; justify-content: space-between; margin-top: 50px; }
  .sig-block { width: 45%; }
  .sig-line { border-bottom: 1px solid #333; margin-top: 40px; margin-bottom: 4px; }
  .sig-label { font-size: 11px; color: #666; }
  /* Запрещаем разрывы страницы внутри строк таблицы и подписных блоков —
     иначе строка позиции/услуги может разломиться пополам между листами. */
  tr, .sig-block, .info-row, .total-row { page-break-inside: avoid; break-inside: avoid; }
  table thead { display: table-header-group; }
  h2 { page-break-after: avoid; break-after: avoid; }
  @media print {
    body { margin: 15px; }
    @page { margin: 12mm; }
  }
</style></head><body>
<div class="header">
  <div class="company">КОВРОВОЕ ПРОИЗВОДСТВО</div>
  <div style="font-size:11px;color:#666">Система учёта заказов</div>
</div>

<h1>Заказ ${formatOrderNumber(order.id, order.created_at)}</h1>
${order.legacy_id ? '<div style="margin-bottom:8px;color:#666">ID из старой системы: ' + order.legacy_id + '</div>' : ''}

<div class="info-grid">
  <div class="info-col">
    <div class="info-row"><span class="label">Клиент:</span> ${order.client_name}</div>
    ${order.client_address ? '<div class="info-row"><span class="label">Адрес клиента:</span> ' + order.client_address + '</div>' : ''}
    <div class="info-row"><span class="label">Статус:</span> ${ORDER_STATUS_LABELS[order.status]}</div>
    ${order.is_warranty ? '<div class="info-row"><span class="label">Гарантийный заказ</span>' + (order.parent_order_id ? ' (от заказа #' + String(order.parent_order_id).padStart(5, '0') + ')' : '') + '</div>' : ''}
  </div>
  <div class="info-col">
    ${order.pickup_address ? '<div class="info-row"><span class="label">Адрес забора:</span> ' + order.pickup_address + (order.pickup_district ? ' (' + order.pickup_district + ')' : '') + '</div>' : ''}
    ${order.delivery_address ? '<div class="info-row"><span class="label">Адрес доставки:</span> ' + order.delivery_address + (order.delivery_district ? ' (' + order.delivery_district + ')' : '') + '</div>' : ''}
    ${order.pickup_date ? '<div class="info-row"><span class="label">Дата забора:</span> ' + order.pickup_date + (order.pickup_time_slot ? ' (' + order.pickup_time_slot + ')' : '') + '</div>' : ''}
    ${order.delivery_date ? '<div class="info-row"><span class="label">Дата доставки:</span> ' + order.delivery_date + (order.delivery_time_slot ? ' (' + order.delivery_time_slot + ')' : '') + '</div>' : ''}
  </div>
</div>

${order.comment ? '<div style="margin-bottom:12px"><span class="label">Комментарий:</span> ' + order.comment + '</div>' : ''}

<h2>Позиции заказа</h2>
<table>
  <thead><tr><th>#</th><th>Тип</th><th>Описание</th><th>Размеры</th><th style="text-align:right">Стоимость</th></tr></thead>
  <tbody>${itemRows}</tbody>
</table>

<h2>Расчёт стоимости</h2>
<table>
  <tbody>
    <tr><td style="padding:4px 8px;font-weight:bold">Сумма позиций (базовая)</td><td style="padding:4px 8px;text-align:right;font-weight:bold">${Number(order.base_amount).toFixed(2)} руб.</td></tr>
    ${modRows}
    <tr class="total-row"><td style="padding:8px;border-top:2px solid #333">ИТОГО</td><td style="padding:8px;text-align:right;border-top:2px solid #333">${Number(order.total_amount).toFixed(2)} руб.</td></tr>
  </tbody>
</table>

<div style="margin-top:8px">
  <span class="label">Оплата:</span> ${order.paid ? 'Оплачен (' + (order.payment_type ? PAYMENT_LABELS[order.payment_type] : '') + ')' : 'Не оплачен'}
</div>

<div class="signatures">
  <div class="sig-block">
    <div class="sig-line"></div>
    <div class="sig-label">Подпись клиента / ФИО</div>
  </div>
  <div class="sig-block">
    <div class="sig-line"></div>
    <div class="sig-label">Подпись представителя компании / ФИО</div>
  </div>
</div>

<div style="text-align:center;margin-top:30px;font-size:10px;color:#999">
  Документ сформирован ${new Date().toLocaleString('ru')}
</div>
</body></html>`

    const iframe = document.createElement('iframe')
    iframe.style.position = 'fixed'
    iframe.style.left = '-9999px'
    iframe.style.top = '-9999px'
    document.body.appendChild(iframe)
    const doc = iframe.contentDocument || iframe.contentWindow?.document
    if (doc) {
      doc.open()
      doc.write(html)
      doc.close()
      setTimeout(() => {
        iframe.contentWindow?.print()
        iframe.addEventListener('afterprint', () => document.body.removeChild(iframe))
        // Fallback cleanup after 60 seconds
        setTimeout(() => { if (iframe.parentNode) document.body.removeChild(iframe) }, 60000)
      }, 300)
    }
  }

  if (loading) return <div className="loading">Загрузка...</div>
  if (!order) return <div className="error-msg">{error || 'Заказ не найден'}</div>

  // Заказ нельзя редактировать в финальных статусах. DELIVERED ещё можно править
  // (оператор может уточнить дату доставки и оплатить), а COMPLETED/CANCELLED — нет.
  // В режиме просмотра (моноблок) — всегда readonly.
  const isEditable = !isViewerMode()
                  && order.status !== 'DELIVERED'
                  && order.status !== 'COMPLETED'
                  && order.status !== 'CANCELLED'

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
      <div className="card" data-tour="order-info">
        <div style={{ display: 'flex', gap: 32, flexWrap: 'wrap', alignItems: 'flex-start' }}>
          <div>
            <div style={{ marginBottom: 8 }}>
              <strong>Статус:</strong> <Badge status={order.status} labels={ORDER_STATUS_LABELS} />
              <StatusLegend />
              {order.status === 'CANCELLED' && order.cancellation_reason && (
                <div style={{ fontSize: '0.85em', color: '#888', marginTop: 4 }}>
                  <strong style={{ color: '#c0392b' }}>Причина отмены:</strong> {order.cancellation_reason}
                </div>
              )}
            </div>
            <div style={{ marginBottom: 8 }}><strong>Сумма:</strong> {Number(order.total_amount).toFixed(2)} &#8381;</div>
            {order.discount_percent > 0 && (
              <div style={{ marginBottom: 8 }}><strong>Скидка:</strong> {order.discount_percent}%</div>
            )}
            <div style={{ marginBottom: 8 }}><strong>Оплачен:</strong> {order.paid ? `Да (${order.payment_type ? PAYMENT_LABELS[order.payment_type] : ''})` : 'Нет'}</div>
            <div style={{ marginBottom: 8 }}>
              <strong>Клиент:</strong>{' '}
              <button className="btn-secondary btn-sm" onClick={openClientCard} style={{ marginLeft: 4 }}>
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
          {/* Подсветка: для перевода в DELIVERED обязательна фактическая дата доставки.
              Если её ещё нет — даём подсказку с понятным следующим шагом. */}
          {order.status === 'DONE' && !order.actual_delivery_date && (
            <div style={{
              marginBottom: 10, padding: '8px 12px', borderRadius: 5,
              background: '#fef5e7', borderLeft: '4px solid #e67e22', fontSize: '0.9em',
            }}>
              <strong style={{ color: '#d35400' }}>Дата доставки (факт) не указана.</strong>
              {' '}Чтобы перевести заказ в «Доставлен» — отметьте дату в Логистике (drag&nbsp;and&nbsp;drop)
              или нажмите «Принять оплату» — там можно сделать обе операции сразу.
            </div>
          )}
          {editDetails ? (
            <div>
              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 8 }}>
                <div className="form-group" style={{ flex: '1 1 250px', marginBottom: 4 }}>
                  <label>Адрес забора</label>
                  <AddressInput
                    value={details.pickup_address}
                    // Ручное изменение — координаты обнуляем, иначе на карте останется
                    // точка от предыдущего адреса.
                    onChange={v => setDetails(d => ({...d, pickup_address: v, pickup_lat: null, pickup_lon: null}))}
                    onResolved={(r) => setDetails(d => ({
                      ...d,
                      pickup_address: r.address,
                      pickup_district: r.district || d.pickup_district,
                      pickup_lat: r.lat,
                      pickup_lon: r.lon,
                    }))}
                    // Загруженный из БД заказ уже имеет координаты — не пугаем оператора
                    // бейджем «не подтверждён» при открытии существующего заказа.
                    externallyConfirmed={details.pickup_lat != null && details.pickup_lon != null}
                  />
                </div>
                <div className="form-group" style={{ flex: '0 0 220px', marginBottom: 4 }}>
                  <label>Район забора</label>
                  <DistrictSelect
                    value={details.pickup_district}
                    onChange={v => setDetails(d => ({...d, pickup_district: v}))}
                    width="100%"
                  />
                </div>
              </div>
              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 8 }}>
                <div className="form-group" style={{ flex: '1 1 250px', marginBottom: 4 }}>
                  <label>Адрес доставки</label>
                  <AddressInput
                    value={details.delivery_address}
                    onChange={v => setDetails(d => ({...d, delivery_address: v, delivery_lat: null, delivery_lon: null}))}
                    onResolved={(r) => setDetails(d => ({
                      ...d,
                      delivery_address: r.address,
                      delivery_district: r.district || d.delivery_district,
                      delivery_lat: r.lat,
                      delivery_lon: r.lon,
                    }))}
                    externallyConfirmed={details.delivery_lat != null && details.delivery_lon != null}
                  />
                </div>
                <div className="form-group" style={{ flex: '0 0 220px', marginBottom: 4 }}>
                  <label>Район доставки</label>
                  <DistrictSelect
                    value={details.delivery_district}
                    onChange={v => setDetails(d => ({...d, delivery_district: v}))}
                    width="100%"
                  />
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

        {/* Карта забора и доставки — по умолчанию свёрнута, разворачивается по клику. */}
        {(() => {
          const points: MapPoint[] = []
          if (order.pickup_lat != null && order.pickup_lon != null) {
            points.push({
              lat: Number(order.pickup_lat), lon: Number(order.pickup_lon),
              kind: 'pickup',
              title: 'Забор',
              description: order.pickup_address || undefined,
            })
          }
          if (order.delivery_lat != null && order.delivery_lon != null) {
            const samePoint = order.pickup_lat != null
              && Number(order.delivery_lat) === Number(order.pickup_lat)
              && Number(order.delivery_lon) === Number(order.pickup_lon)
            if (!samePoint) {
              points.push({
                lat: Number(order.delivery_lat), lon: Number(order.delivery_lon),
                kind: 'delivery',
                title: 'Доставка',
                description: order.delivery_address || undefined,
              })
            }
          }
          if (points.length === 0) return null
          return (
            <div style={{ marginTop: 12 }}>
              {!mapVisible ? (
                <button
                  className="btn-secondary"
                  onClick={() => setMapVisible(true)}
                  title="Показать адреса на карте"
                >
                  Показать карту
                </button>
              ) : (
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                    <div style={{ color: '#666', fontSize: '0.9em' }}>
                      <span style={{ display: 'inline-block', width: 10, height: 10, background: '#2980b9', borderRadius: 5, marginRight: 4 }} /> Забор
                      <span style={{ display: 'inline-block', width: 10, height: 10, background: '#27ae60', borderRadius: 5, marginLeft: 16, marginRight: 4 }} /> Доставка
                    </div>
                    <button
                      onClick={() => setMapVisible(false)}
                      className="btn-secondary btn-sm"
                    >Свернуть карту</button>
                  </div>
                  <MapMarkers points={points} height={280} />
                </div>
              )}
            </div>
          )
        })()}

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
              {/* Комментарий редактируется всегда — это единственное поле,
                  которое не блокируется в COMPLETED/CANCELLED. */}
              {order.status !== 'CANCELLED' && (
                <button className="btn-secondary btn-sm" onClick={() => setEditComment(true)} style={{ marginLeft: 8 }}>
                  Изменить
                </button>
              )}
            </div>
          )}
        </div>

        <div className="actions" style={{ marginTop: 16 }}>
          {!isViewerMode() && ALLOWED_TRANSITIONS[order.status]?.length > 0 && (() => {
            // Раньше — обычный select «Сменить статус». Заменено на плитки-кнопки:
            // оператор делает это многократно за день, дроп-даун — два клика вместо
            // одного (Миша, встреча 11 мая: «дропдауны на ≤5 значений бесят»).
            const transitions = ALLOWED_TRANSITIONS[order.status] || []
            return (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <span style={{ fontSize: '0.9em', color: '#7f8c8d' }}>Перевести в:</span>
                {transitions.map(s => (
                  <button
                    key={s}
                    type="button"
                    className="btn-primary btn-sm"
                    onClick={() => changeOrderStatus(s as OrderStatus)}
                    title={`Перевести в «${ORDER_STATUS_LABELS[s]}»`}
                  >
                    {ORDER_STATUS_LABELS[s]}
                  </button>
                ))}
              </div>
            )
          })()}
          {/* Оплата возможна только когда заказ доставлен. После оплаты заказ становится «Завершённым». */}
          {!isViewerMode() && !order.paid && order.status === 'DELIVERED' && (
            <button className="btn-success" onClick={() => setShowPay(true)}>Оплатить и завершить</button>
          )}
          {/* В статусе DONE — клиент пришёл забрать сам и хочет сразу заплатить.
              Кнопка делает три операции одной транзакцией клиента: отмечаем доставку,
              переводим в DELIVERED, открываем PayModal — после оплаты заказ становится COMPLETED. */}
          {!isViewerMode() && !order.paid && order.status === 'DONE' && (
            <button className="btn-success" onClick={() => setShowDeliverAndPay(true)}>
              Принять оплату
            </button>
          )}
          {!isViewerMode() && (order.status === 'DELIVERED' || order.status === 'COMPLETED') && (
            <button className="btn-warning" onClick={() => setShowWarranty(true)}>Гарантийный возврат</button>
          )}
          <button className="btn-secondary" onClick={() => {
            setConfirmAction({
              title: 'Дублировать заказ',
              message: 'Создать копию этого заказа?',
              action: async () => {
                try {
                  const dup = await duplicateOrder(orderId)
                  navigate(`/orders/${dup.id}`)
                } catch (e: unknown) { const msg = (e as any)?.response?.data?.message || 'Ошибка дублирования заказа'; showToast(msg, 'error') }
              }
            })
          }}>Дублировать заказ</button>
          <button className="btn-secondary" onClick={handlePrintPdf}>Печать PDF</button>
        </div>
      </div>

      {/* Items */}
      <div className="card" data-tour="order-items">
        <div className="page-header" style={{ marginBottom: 12 }}>
          <h2 style={{ margin: 0 }}>Позиции заказа</h2>
          {isEditable && (
            <button className="btn-primary" onClick={() => setShowAddItem(true)}>+ Добавить позицию</button>
          )}
        </div>
        <table className="items-table">
          <thead>
            <tr>
              <th style={{ width: 100 }}>#</th>
              <th style={{ width: 180 }}>Тип</th>
              <th>Описание / Дефекты</th>
              <th style={{ width: 160 }}>Размеры</th>
              <th style={{ width: 120 }}>Статус</th>
              <th style={{ width: 120, textAlign: 'right' }}>Стоимость</th>
              {isEditable && <th style={{ width: 80, textAlign: 'right' }}>Действия</th>}
            </tr>
          </thead>
          <tbody>
            {items.length === 0 ? (
              <tr><td colSpan={isEditable ? 7 : 6} className="empty">Нет позиций</td></tr>
            ) : (() => {
                // V10: «по умолчанию»-сортировки нет — порядок добавления сохраняется,
                // потому что auto-add теперь живёт на SKU и не влияет на тип позиции.
                const sorted = items
                return sorted.map((item, idx) => (
                  <ItemRow
                    key={item.id}
                    item={item}
                    index={idx + 1}
                    orderId={orderId}
                    employees={employees}
                    roles={roles}
                    onRefresh={loadOrder}
                    isEditable={isEditable}
                    initialPhotos={photosByItemId.get(item.id) || []}
                    isDefaultType={false}
                    freshlyAdded={freshlyAddedIds.has(item.id)}
                  />
                ))
              })()
            }
          </tbody>
        </table>
      </div>

      {/* Расчёт стоимости */}
      <div className="card" data-tour="order-calc">
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
                      <span style={{ color: isPositive ? '#e74c3c' : '#27ae60', fontWeight: 600 }}>
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
          onAdded={(newIds) => {
            setShowAddItem(false)
            // Помечаем свежедобавленные ID — ItemRow раскроет их и поставит фокус
            // в поле описания, чтобы оператор сразу дописывал, не раскрывая каждую.
            setFreshlyAddedIds(prev => {
              const next = new Set(prev)
              for (const id of newIds) next.add(id)
              return next
            })
            void loadOrder()
          }}
        />
      )}
      {showPay && <PayModal onClose={() => setShowPay(false)} onPay={handlePay} />}
      {showDeliverAndPay && <DeliverAndPayModal onClose={() => setShowDeliverAndPay(false)} onSubmit={handleDeliverAndPay} />}
      {showCancelOrderModal && (
        <CancelReasonModal
          title="Отмена заказа"
          subject={`Заказ #${String(order.id).padStart(5, '0')} будет отменён.`}
          onCancel={() => setShowCancelOrderModal(false)}
          onConfirm={confirmCancelOrder}
        />
      )}
      {showWarranty && (
        <WarrantyModal
          items={items}
          onClose={() => setShowWarranty(false)}
          onConfirm={handleWarranty}
        />
      )}

      {confirmAction && (
        <ConfirmModal
          title={confirmAction.title}
          message={confirmAction.message}
          onConfirm={() => { setConfirmAction(null); confirmAction.action() }}
          onCancel={() => setConfirmAction(null)}
        />
      )}

      {showClientCard && (
        <div className="modal-overlay" onClick={() => setShowClientCard(null)}>
          <div className="modal large" onClick={e => e.stopPropagation()} style={{ maxHeight: '85vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
              <div>
                <h2 style={{ margin: 0 }}>{showClientCard.name}</h2>
                <div style={{ color: '#888', fontSize: '0.9em', marginTop: 4 }}>
                  {showClientCard.client_type === 'LEGAL_ENTITY' ? 'Юридическое лицо' : 'Физическое лицо'} &middot; #{showClientCard.id}
                </div>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 32, flexWrap: 'wrap' }}>
              <div style={{ flex: '1 1 250px' }}>
                {showClientCard.client_type === 'INDIVIDUAL' && (
                  <>
                    <div style={{ marginBottom: 8 }}><strong>Фамилия:</strong> {showClientCard.last_name || 'не указано'}</div>
                    <div style={{ marginBottom: 8 }}><strong>Имя:</strong> {showClientCard.first_name || 'не указано'}</div>
                  </>
                )}
                {showClientCard.client_type === 'LEGAL_ENTITY' && (
                  <>
                    <div style={{ marginBottom: 8 }}><strong>ИНН:</strong> {showClientCard.inn || 'не указано'}</div>
                    <div style={{ marginBottom: 8 }}><strong>Контактное лицо:</strong> {showClientCard.contact_person || 'не указано'}</div>
                    <div style={{ marginBottom: 8 }}><strong>Тел. контакта:</strong> {showClientCard.contact_person_phone || 'не указано'}</div>
                  </>
                )}
                <div style={{ marginBottom: 8 }}><strong>Телефон:</strong> {showClientCard.phone || 'не указано'}</div>
                <div style={{ marginBottom: 8 }}><strong>Доп. телефон:</strong> {showClientCard.extra_phone || 'не указано'}</div>
              </div>
              <div style={{ flex: '1 1 250px' }}>
                <div style={{ marginBottom: 8 }}><strong>Адрес:</strong> {showClientCard.address || 'не указано'}</div>
                <div style={{ marginBottom: 8 }}><strong>Район:</strong> {showClientCard.district || 'не указано'}</div>
                <div style={{ marginBottom: 8 }}><strong>Комментарий:</strong> {showClientCard.comment || 'не указано'}</div>
                <div style={{ marginBottom: 8 }}><strong>Создан:</strong> {new Date(showClientCard.created_at).toLocaleDateString('ru')}</div>
              </div>
            </div>
            {clientCardMods.length > 0 && (
              <div style={{ marginTop: 12 }}>
                <strong>Модификаторы цены:</strong>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 4 }}>
                  {clientCardMods.map(m => (
                    <span key={m.id} style={{
                      padding: '3px 8px', borderRadius: 4, fontSize: '0.85em', fontWeight: 600,
                      color: m.percent < 0 ? '#27ae60' : m.percent > 0 ? '#e74c3c' : '#888',
                      background: m.percent < 0 ? '#eafaf1' : m.percent > 0 ? '#fdedec' : '#f5f5f5',
                    }}>
                      {m.name} ({m.percent > 0 ? '+' : ''}{m.percent}%)
                    </span>
                  ))}
                </div>
              </div>
            )}
            {/* Client Events */}
            <div style={{ marginTop: 16 }}>
              <strong>События клиента</strong>
              <div style={{ display: 'flex', gap: 4, marginTop: 8, marginBottom: 8 }}>
                <input
                  value={newEventNote}
                  onChange={e => setNewEventNote(e.target.value)}
                  placeholder="Добавить заметку..."
                  style={{ flex: 1 }}
                  onKeyDown={e => {
                    if (e.key === 'Enter' && newEventNote.trim() && showClientCard) {
                      addClientEvent(showClientCard.id, 'NOTE', newEventNote.trim())
                        .then(() => getClientEvents(showClientCard.id))
                        .then(evts => { setClientEvents(evts.slice(0, 10)); setNewEventNote('') })
                        .catch(() => {})
                    }
                  }}
                />
                <button
                  className="btn-primary btn-sm"
                  disabled={!newEventNote.trim()}
                  onClick={() => {
                    if (newEventNote.trim() && showClientCard) {
                      addClientEvent(showClientCard.id, 'NOTE', newEventNote.trim())
                        .then(() => getClientEvents(showClientCard.id))
                        .then(evts => { setClientEvents(evts.slice(0, 10)); setNewEventNote('') })
                        .catch(() => {})
                    }
                  }}
                >Добавить</button>
              </div>
              <div style={{ maxHeight: 200, overflowY: 'auto' }}>
                {clientEvents.length === 0 ? (
                  <div style={{ color: '#999', fontSize: '0.9em' }}>Нет событий</div>
                ) : clientEvents.map(ev => {
                  const typeColors: Record<string, string> = { NOTE: '#888', CALL: '#3498db', COMPLAINT: '#e74c3c', ORDER_CREATED: '#27ae60', WARRANTY: '#f39c12' }
                  return (
                    <div key={ev.id} style={{ display: 'flex', gap: 8, padding: '4px 0', borderBottom: '1px solid #f0f0f0', fontSize: '0.85em' }}>
                      <span style={{ color: typeColors[ev.event_type] || '#888', fontWeight: 600, minWidth: 60 }}>
                        {ev.event_type === 'NOTE' ? 'Заметка' : ev.event_type === 'CALL' ? 'Звонок' : ev.event_type === 'COMPLAINT' ? 'Жалоба' : ev.event_type === 'ORDER_CREATED' ? 'Заказ' : ev.event_type === 'WARRANTY' ? 'Гарантия' : ev.event_type}
                      </span>
                      <span style={{ flex: 1 }}>{ev.description}</span>
                      <span style={{ color: '#999', whiteSpace: 'nowrap' }}>{new Date(ev.created_at).toLocaleDateString('ru')}</span>
                    </div>
                  )
                })}
              </div>
            </div>
            <div className="modal-actions" style={{ marginTop: 16 }}>
              <button className="btn-secondary" onClick={() => setShowClientCard(null)}>Закрыть</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
