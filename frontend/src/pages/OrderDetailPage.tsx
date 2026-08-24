import { useEffect, useState, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  getOrder, getOrderItems, getOrderHistory,
  updateOrderStatus, rollbackOrderStatus, payOrder, createWarrantyOrder,
  updateOrderItemDescription, updateOrderItemDimensions, updateOrderItemStatus, duplicateOrder, duplicateItem,
  updateOrderComment,
  updateOrderDetails, updateActualDates,
  getOrderModifiers, addOrderModifier, removeOrderModifier, pushModifiersToClient, setOrderProblem,
  getItemPhotos, uploadItemPhoto, deleteItemPhoto, getAllOrderPhotos,
  setPreliminaryPayment,
  type ItemPhoto,
} from '../api/orders'
import { getItemServices, getAllOrderServices, updateServiceStatus, updateServicePrice, assignServiceEmployees, addServiceToItem } from '../api/services'
import { getItemTypes, getEmployees, getPriceModifiers, getEmployeeRoles } from '../api/references'
import { getClient, getClientModifiers, getClientEvents, addClientEvent, addClientModifier } from '../api/clients'
import { useToast } from '../components/Toast'
import ConfirmModal from '../components/ConfirmModal'
import CancelReasonModal from '../components/CancelReasonModal'
import StatusLegend from '../components/StatusLegend'
import DistrictSelect from '../components/DistrictSelect'
import AddressInput from '../components/AddressInput'
import TimeSlotSelect from '../components/TimeSlotSelect'
import MapMarkers, { type MapPoint } from '../components/MapMarkers'
import { WarrantyModal, AddItemModal, PayModal, DeliverAndPayModal } from '../components/orders/order-detail-modals'
import SkuPicker from '../components/SkuPicker'
import type {
  Order, OrderItem, OrderItemService, OrderStatusHistory,
  ItemType, Employee, OrderStatus, ServiceStatus,
  PaymentType, PreliminaryPaymentType,
  PriceModifier, OrderModifier, Client, EmployeeRole,
} from '../types'

// Подписи статусов и оплаты — общие, см. constants/statuses.ts
import {
  ORDER_STATUS_LABELS,
  ITEM_STATUS_LABELS,
  SERVICE_STATUS_LABELS,
  PAYMENT_LABELS,
  PRELIMINARY_PAYMENT_LABELS,
  ALL_PRELIMINARY_PAYMENTS,
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
import { useEscapeClose } from '../hooks/useEscapeClose'
import StyledSelect from '../components/StyledSelect'
import { useAuth } from '../auth/AuthContext'

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

// Разбивка цены услуги: «480 ₽/м² × 6 = 2880 ₽» — оператор сразу видит,
// откуда взялась сумма (помогает заметить кривую расценку или забытый параметр).
// Возвращает null если разбивка неуместна (FIXED, ручная цена, нет данных).
function formatPriceBreakdown(svc: OrderItemService, item: OrderItem): string | null {
  if (svc.is_manual_price) return null
  if (svc.sku_unit_price == null) return null
  const unit = svc.sku_unit_price
  const pt = svc.pricing_type
  // Для FIXED показывать «480 ₽ × 1 = 480 ₽» бессмысленно — просто прячем разбивку.
  if (!pt || pt === 'FIXED') return null
  let factor: number | null = null
  let unitLabel = ''
  switch (pt) {
    case 'BY_WEIGHT':         factor = item.weight ?? null;         unitLabel = 'кг'; break
    case 'BY_AREA':           factor = item.area ?? null;           unitLabel = 'м²'; break
    case 'BY_PERIMETER':
      // Периметр клиент не вводит — берём 2·(L+W) если есть размеры.
      factor = (item.length != null && item.width != null) ? 2 * (item.length + item.width) : null
      unitLabel = 'м'
      break
    case 'BY_LENGTH':         factor = item.length ?? null;         unitLabel = 'м';  break
    case 'BY_WIDTH':          factor = item.width ?? null;          unitLabel = 'м';  break
    case 'BY_RUNNING_METERS': factor = item.running_meters ?? null; unitLabel = 'п.м.'; break
    default: return null
  }
  if (factor == null) return null
  const total = unit * factor
  return `${unit.toFixed(0)} ₽/${unitLabel} × ${factor} = ${total.toFixed(0)} ₽`
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
  // V19 (#1): отменённые услуги по дефолту скрыты. Снять галку — показать.
  const [hideCancelledServices, setHideCancelledServices] = useState(true)
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
  // V19 (#5): когда родитель обновил позицию (например, после updateDimensions меняется
  // item.updated_at), услуги тоже могли пересчитаться на бэке — перезагружаем их список,
  // иначе цена услуги отображалась stale (480 ₽ вместо 480 × 6 = 2880 ₽).
  useEffect(() => { if (item.updated_at) void load() }, [item.updated_at])

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

  /** Открыть редактирование — поле всегда пустое (placeholder = текущая цена). */
  const openPriceEdit = (serviceId: number) => {
    setEditingPrice(serviceId)
    setPriceValue('')
  }

  const savePriceEdit = async () => {
    if (editingPrice === null) return
    try {
      // Пустое поле → null → бэк снимает is_manual_price и пересчитывает
      // через SKU.price × параметр позиции. 0 — валидная ручная цена.
      const priceParam = priceValue.trim() === '' ? null : Number(priceValue)
      await updateServicePrice(orderId, itemId, editingPrice, { price: priceParam as number })
      setEditingPrice(null)
      setPriceValue('')
      await load()
      onRefresh()
    } catch (e: unknown) { const msg = (e as any)?.response?.data?.message || 'Ошибка изменения цены'; showToast(msg, 'error') }
  }

  /** Кнопка «А» — мгновенный сброс ручной цены, без открытия редактирования. */
  const resetServicePriceToAuto = async (serviceId: number) => {
    try {
      await updateServicePrice(orderId, itemId, serviceId, { price: null as unknown as number })
      await load()
      onRefresh()
    } catch (e: unknown) { const msg = (e as any)?.response?.data?.message || 'Ошибка'; showToast(msg, 'error') }
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
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          {/* V19 (#1): тумблер видимости отменённых услуг. По дефолту скрыты. */}
          {services.some(s => s.status === 'CANCELLED') && (
            <label style={{ display: 'flex', gap: 4, alignItems: 'center', fontSize: '0.85em', color: '#7f8c8d', cursor: 'pointer' }}>
              <input
                type="checkbox"
                style={{ width: 'auto' }}
                checked={!hideCancelledServices}
                onChange={e => setHideCancelledServices(!e.target.checked)}
              />
              Показать отменённые
            </label>
          )}
          {isEditable && (
            <button
              type="button"
              onClick={() => setSkuPickerOpen(true)}
              className="btn-primary btn-sm"
            >+ Добавить услугу</button>
          )}
        </div>
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
                  стоимость задаётся самой позицией (default_price), услуги её не определяют.
                  Шире (190), потому что внутри ещё бывает «(ручная) А» + разбивка формулы,
                  а с nowrap они выпирали в соседнюю колонку «Статус». */}
              {!isDefaultType && <th style={{ width: 190, textAlign: 'right' }}>Стоимость</th>}
              <th style={{ width: 170 }}>Исполнители</th>
              {/* 280 вместо 220 — раньше кнопка «Исполнители» обрезалась справа,
                  потому что select(115) + gap + button(~120px) ≈ 250px не помещались. */}
              {isEditable && <th style={{ width: 280, textAlign: 'right' }}>Действия</th>}
            </tr>
          </thead>
          <tbody>
            {(hideCancelledServices ? services.filter(s => s.status !== 'CANCELLED') : services).map(s => {
              const blocked = isServiceBlocked(s)
              const noAssignees = !s.assignees || s.assignees.length === 0
              // Подсказку «Назначьте исполнителя» помещаем в колонку «Исполнители» —
              // чтобы колонка «Действия» во всех строках имела одинаковый layout (select + кнопка).
              const showAssignHint = noAssignees && s.status === 'CREATED' && !blocked
              // V18/V20/V21: свап «платная услуга» ↔ «Самовывоз».
              // По умолчанию (V20) у заказа 3 услуги: Приём, Доставка, Оформление.
              // Свапаются Приём и Доставка — обе с одноимённым Самовывозом.
              // Legacy SKU «Доставка (забор)»/«Доставка (отвоз)» (исторические заказы)
              // тоже работают через подстроку имени.
              const name = (s.sku_name || '').toLowerCase()
              const isDelivery = name.includes('доставка')
              const isIntake = name === 'приём' || name === 'прием' || name.startsWith('приём ') || name.startsWith('прием ')
              const isSelfPickup = name.includes('самовывоз')
              let swapTargetName: string | null = null
              if (isDelivery) {
                if (name.includes('забор')) swapTargetName = 'Самовывоз (привоз клиентом)'
                else if (name.includes('отвоз')) swapTargetName = 'Самовывоз (отвоз клиентом)'
                else swapTargetName = 'Самовывоз (отвоз клиентом)' // новая «Доставка» → отвозит клиент
              } else if (isIntake) {
                swapTargetName = 'Самовывоз (привоз клиентом)' // клиент сам привозит вещи в офис
              } else if (isSelfPickup) {
                if (name.includes('привоз')) swapTargetName = 'Приём'
                else swapTargetName = 'Доставка'
              }
              return (
                <tr key={s.id} style={blocked ? { background: '#fff3cd' } : undefined}>
                  <td>
                    {s.sku_name ?? `Услуга #${s.sku_id}`}
                    {blocked && (
                      <div style={{ fontSize: '0.8em', color: '#e67e22', fontWeight: 600 }}>
                        Не заполнены размеры
                      </div>
                    )}
                    {/* V18: свап Доставка ↔ Самовывоз. Видна только для active-услуг. */}
                    {isEditable && swapTargetName && s.status !== 'CANCELLED' && (
                      <button
                        className="btn-secondary btn-sm"
                        style={{ marginTop: 4, padding: '2px 8px', fontSize: '0.78em' }}
                        title={`Заменить на «${swapTargetName}»`}
                        onClick={async () => {
                          try {
                            // Найдём SKU по имени — берём из глобального справочника
                            const all = await import('../api/sku').then(m => m.getSkus())
                            const target = all.find(sku => sku.name === swapTargetName)
                            if (!target) { showToast(`SKU «${swapTargetName}» не найден`, 'error'); return }
                            await (await import('../api/orders')).swapItemService(orderId, itemId, s.id, target.id)
                            await load(); onRefresh()
                            showToast(`Услуга заменена на «${swapTargetName}»`, 'success')
                          } catch (e: unknown) {
                            showToast((e as any)?.response?.data?.message || 'Ошибка свапа', 'error')
                          }
                        }}
                      >↔ {isSelfPickup ? 'Платная' : 'Самовывоз'}</button>
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
                  {/* Колонка «Стоимость» — только для НЕ дефолтных. Для дефолтов <td> вообще
                      не выводим, чтобы не плодить пустые ячейки. */}
                  {!isDefaultType && (
                  <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                    {isEditable && editingPrice === s.id ? (
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2 }}>
                        <div style={{ display: 'flex', gap: 4 }}>
                          <input
                            value={priceValue}
                            onChange={e => setPriceValue(e.target.value)}
                            style={{ width: 80 }}
                            placeholder={`авто (${Number(s.price).toFixed(0)} ₽)`}
                            autoFocus
                          />
                          <button className="btn-success btn-sm" onClick={savePriceEdit} title="Сохранить">&#10003;</button>
                          <button className="btn-secondary btn-sm" onClick={() => { setEditingPrice(null); setPriceValue('') }} title="Отмена">&#10005;</button>
                        </div>
                        <span style={{ fontSize: '0.7em', color: '#888' }}>пусто = авто-расчёт</span>
                      </div>
                    ) : (() => {
                      const breakdown = formatPriceBreakdown(s, item)
                      return (
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2 }}>
                          {/* Цена + ✏️ — в одну строку. */}
                          <span
                            style={{ cursor: isEditable ? 'pointer' : 'default' }}
                            onClick={() => isEditable && openPriceEdit(s.id)}
                          >
                            {Number(s.price).toFixed(2)} &#8381;{isEditable ? ' ✏️' : ''}
                          </span>
                          {/* (ручная) + кнопка «А» — отдельной строкой ниже, чтобы не вылезали
                              в соседнюю колонку «Статус» (была проблема наложения текста). */}
                          {s.is_manual_price && (
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: '0.78em', color: '#666' }}>
                              (ручная)
                              {isEditable && (
                                <button
                                  className="btn-secondary btn-sm"
                                  onClick={() => void resetServicePriceToAuto(s.id)}
                                  title="Авто-расчёт цены (SKU × параметр позиции)"
                                  style={{ padding: '1px 6px', fontSize: '0.9em', lineHeight: 1 }}
                                >А</button>
                              )}
                            </span>
                          )}
                          {breakdown && (
                            <span style={{ fontSize: '0.72em', color: '#888' }}>{breakdown}</span>
                          )}
                        </div>
                      )
                    })()}
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
                        {/* StyledSelect вместо нативного: раскрытый список у <select>
                            рисует ОС, на macOS он тёмно-серый и выбивается из стиля. */}
                        <StyledSelect<string>
                          value={s.status}
                          width={130}
                          ariaLabel="Статус услуги"
                          options={[
                            { value: 'CREATED', label: 'Создана' },
                            ...(showAssignHint ? [] : [
                              { value: 'IN_PROGRESS', label: 'В работе' },
                              { value: 'DONE', label: 'Готова' },
                            ]),
                            { value: 'CANCELLED', label: 'Отменена' },
                          ]}
                          onChange={v => changeStatus(s.id, v as ServiceStatus)}
                        />
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
  freshlyAdded, onCancelItem, services, onQuickAssign, onQuickStatus,
}: {
  item: OrderItem
  index: number
  orderId: number
  employees: Employee[]
  roles: EmployeeRole[]
  onRefresh: () => void
  isEditable: boolean
  initialPhotos?: ItemPhoto[]
  isDefaultType: boolean
  freshlyAdded?: boolean
  /** V19: открыть модалку отмены позиции в родителе (используется единая CancelReasonModal). */
  onCancelItem: (item: OrderItem) => void
  /** Правка №5: услуги позиции — чтобы показать быстрые действия в строке. */
  services: OrderItemService[]
  onQuickAssign: (item: OrderItem) => void
  onQuickStatus: (item: OrderItem) => void
}) {
  const { showToast } = useToast()
  // Правка №5: сводка по услугам позиции для кнопок быстрых действий.
  const activeServices = services.filter(s => s.status !== 'CANCELLED')
  const needsAssignee = activeServices.some(s => (s.assignees?.length ?? 0) === 0)
  const assigneeSummary = [...new Set(
    activeServices.flatMap(s => (s.assignees ?? []).map(a => a.name))
  )].join(', ') || 'не назначены'
  // Подпись следующего шага показываем только когда услуга одна — иначе
  // «следующий статус» у разных услуг может отличаться.
  const nextStatusLabel = activeServices.length === 1
    ? (activeServices[0].status === 'CREATED' ? 'В работу'
      : activeServices[0].status === 'IN_PROGRESS' ? 'Готово' : null)
    : null
  const [expanded, setExpanded] = useState(!!freshlyAdded)
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

  // Ручное редактирование цены позиции удалено: цена = сумма цен услуг, оператор
  // меняет цену только на уровне услуги (там есть ✏️, ✓, кнопка «А» для сброса).

  const saveDimensions = async (opts?: { keepEditing?: boolean, silent?: boolean }) => {
    const fields: { key: keyof typeof dimensions; label: string; max: number }[] = [
      { key: 'length',         label: 'Длина',     max: 50 },
      { key: 'width',          label: 'Ширина',    max: 50 },
      { key: 'weight',         label: 'Вес',       max: 500 },
      { key: 'area',           label: 'Площадь',   max: 2500 },
      { key: 'running_meters', label: 'Пог.метры', max: 1000 },
    ]
    for (const f of fields) {
      const raw = dimensions[f.key]
      if (!raw) continue
      const n = Number(String(raw).replace(',', '.'))
      if (!Number.isFinite(n) || n <= 0) {
        if (!opts?.silent) showToast(`${f.label}: укажите положительное число`, 'error')
        return false
      }
      if (n > f.max) {
        if (!opts?.silent) showToast(`${f.label}: значение слишком большое (максимум ${f.max})`, 'error')
        return false
      }
    }
    try {
      const parseNum = (s: string): number | null => {
        if (!s.trim()) return null
        const n = Number(s.replace(',', '.'))
        return Number.isFinite(n) ? n : null
      }
      const lenN  = parseNum(dimensions.length)
      const widN  = parseNum(dimensions.width)
      let   areaN = parseNum(dimensions.area)
      if (areaN == null && lenN != null && widN != null) {
        areaN = Math.round(lenN * widN * 100) / 100
      }
      await updateOrderItemDimensions(orderId, item.id, {
        length: lenN ?? undefined,
        width:  widN ?? undefined,
        weight: parseNum(dimensions.weight) ?? undefined,
        area:   areaN ?? undefined,
        running_meters: parseNum(dimensions.running_meters) ?? undefined,
      })
      if (!opts?.keepEditing) setEditDimensions(false)
      onRefresh()
      return true
    } catch (e: unknown) {
      if (!opts?.silent) {
        const msg = (e as any)?.response?.data?.message || 'Ошибка сохранения размеров'
        showToast(msg, 'error')
      }
      return false
    }
  }

  // V19 (#4): автосохранение размеров при потере фокуса.
  // Если оператор переключился на что-то другое (например, нажал «+ Добавить услугу»),
  // последние введённые значения уже в БД — бэк не скажет «размеры не заполнены».
  // silent=true чтобы не спамить тостами, keepEditing=true чтобы поле осталось активным.
  const handleDimensionBlur = () => { void saveDimensions({ keepEditing: true, silent: true }) }

  return (
    <>
      <tr>
        <td>
          <button
            className="btn-secondary btn-sm"
            onClick={() => setExpanded(e => !e)}
            style={{ marginRight: 8 }}
          >
            {expanded ? '▲' : '▼'}
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
              <div>{item.description || '—'}{isEditable ? ' ✏️' : ''}</div>
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
                  type="text" inputMode="decimal" pattern="[0-9.,]*" onBlur={handleDimensionBlur}
                  placeholder="Длина"
                  value={dimensions.length}
                  onChange={e => setDimensions(d => {
                    // Авто-площадь = L × W (если оператор не задал руками)
                    const lenVal = e.target.value
                    const widNum = d.width ? Number(d.width) : null
                    const lenNum = lenVal ? Number(lenVal) : null
                    const autoArea = (lenNum != null && widNum != null)
                      ? String(Math.round(lenNum * widNum * 100) / 100)
                      : d.area
                    return {...d, length: lenVal, area: autoArea}
                  })}
                  style={{ width: 60 }}
                />
                <input
                  type="text" inputMode="decimal" pattern="[0-9.,]*" onBlur={handleDimensionBlur}
                  placeholder="Ширина"
                  value={dimensions.width}
                  onChange={e => setDimensions(d => {
                    const widVal = e.target.value
                    const lenNum = d.length ? Number(d.length) : null
                    const widNum = widVal ? Number(widVal) : null
                    const autoArea = (lenNum != null && widNum != null)
                      ? String(Math.round(lenNum * widNum * 100) / 100)
                      : d.area
                    return {...d, width: widVal, area: autoArea}
                  })}
                  style={{ width: 60 }}
                />
                <input
                  type="text" inputMode="decimal" pattern="[0-9.,]*" onBlur={handleDimensionBlur}
                  placeholder="Вес"
                  value={dimensions.weight}
                  onChange={e => setDimensions(d => ({...d, weight: e.target.value}))}
                  style={{ width: 60 }}
                />
              </div>
              <div style={{ display: 'flex', gap: 4 }}>
                <input
                  type="text" inputMode="decimal" pattern="[0-9.,]*" onBlur={handleDimensionBlur}
                  placeholder="Площадь"
                  value={dimensions.area}
                  onChange={e => setDimensions(d => ({...d, area: e.target.value}))}
                  style={{ width: 60 }}
                />
                <input
                  type="text" inputMode="decimal" pattern="[0-9.,]*" onBlur={handleDimensionBlur}
                  placeholder="Пог.м"
                  value={dimensions.running_meters}
                  onChange={e => setDimensions(d => ({...d, running_meters: e.target.value}))}
                  style={{ width: 60 }}
                />
              </div>
              <div style={{ display: 'flex', gap: 4 }}>
                <button className="btn-success btn-sm" tabIndex={-1} onClick={() => void saveDimensions()}>&#10003;</button>
                <button className="btn-secondary btn-sm" tabIndex={-1} onClick={() => setEditDimensions(false)}>&#10005;</button>
              </div>
            </div>
          ) : (
            <span
              style={{ cursor: isEditable ? 'pointer' : 'default' }}
              onClick={() => isEditable && setEditDimensions(true)}
            >
              {item.length ? `${item.length}×${item.width || 0}` : '—'}
              {item.weight ? ` (${item.weight}кг)` : ''}
              {item.area ? ` S=${item.area}` : ''}
              {item.running_meters ? ` ${item.running_meters}п.м.` : ''}
              {isEditable ? ' ✏️' : ''}
            </span>
          )}
        </td>
        <td><Badge status={item.status} labels={ITEM_STATUS_LABELS} /></td>
        {/* Цена позиции — только чтение. Сумма цен услуг этой позиции. Если оператору
            нужно подкрутить — пусть правит цену конкретной услуги (там есть ✏️ и «А»). */}
        <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
          {Number(item.price).toFixed(2)} &#8381;
        </td>
        {isEditable && (
          <td style={{ textAlign: 'right' }}>
            {/* Правка №5: быстрые действия прямо из списка позиций — оператору
                больше не нужно раскрывать каждую позицию, чтобы назначить
                исполнителя или сдвинуть статус. «Дубль»/«Отменить» ужаты до
                иконок, чтобы освободить место. */}
            {/* Фиксированные ширины: без них «Назначить» и «Исполнители» разной
                длины, и кнопки соседних строк не попадали в одну колонку. */}
            <div style={{ display: 'inline-flex', gap: 4, justifyContent: 'flex-end', alignItems: 'center', whiteSpace: 'nowrap' }}>
              {item.status !== 'CANCELLED' && activeServices.length > 0 && (
                <>
                  <button
                    className="btn-secondary btn-sm"
                    title={needsAssignee ? 'Назначить исполнителя' : `Исполнители: ${assigneeSummary}`}
                    // Пока исполнителя нет — подсвечиваем оранжевым контуром: это
                    // блокирует смену статуса, оператор должен начать отсюда.
                    style={{
                      width: 100, textAlign: 'center',
                      ...(needsAssignee
                        ? { borderColor: 'var(--c-warning-strong)', color: 'var(--c-warning-strong)' }
                        : {}),
                    }}
                    onClick={() => onQuickAssign(item)}
                  >{needsAssignee ? 'Назначить' : 'Исполнители'}</button>
                  {/* Статус недоступен без исполнителя — бэк всё равно откажет
                      («Невозможно сменить статус: не назначен исполнитель»),
                      поэтому кнопку гасим, а не даём напороться на ошибку. */}
                  <button
                    className="btn-secondary btn-sm"
                    disabled={needsAssignee}
                    style={{ width: 74, textAlign: 'center' }}
                    title={needsAssignee
                      ? 'Сначала назначьте исполнителя'
                      : (nextStatusLabel ? `Перевести услугу: ${nextStatusLabel}` : 'Сменить статус услуги')}
                    onClick={() => onQuickStatus(item)}
                  >Статус ▾</button>
                </>
              )}
              <button
                className="btn-secondary btn-sm"
                style={{ width: 34, textAlign: 'center' }}
                onClick={async () => {
                  try {
                    await duplicateItem(orderId, item.id)
                    onRefresh()
                  } catch (e: unknown) { const msg = (e as any)?.response?.data?.message || 'Ошибка дублирования позиции'; showToast(msg, 'error') }
                }}
                title="Дублировать позицию"
              >⧉</button>
              {/* V19 (#11): кнопка отмены позиции — работает даже если на позиции нет услуг.
                  Раньше оператор не мог отменить «пустую» позицию (некого было отменять). */}
              {item.status !== 'CANCELLED' ? (
                <button
                  className="btn-danger btn-sm"
                  style={{ width: 34, textAlign: 'center' }}
                  title="Отменить позицию"
                  onClick={() => onCancelItem(item)}
                >×</button>
              ) : (
                // Заглушка вместо отсутствующей кнопки — иначе у отменённой
                // позиции остальные кнопки съезжают вправо.
                <span style={{ width: 34, display: 'inline-block' }} />
              )}
            </div>
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

/**
 * Правка №5: попап быстрых действий по позиции — назначить исполнителя и
 * сменить статус, не раскрывая строку позиции и не заходя в карточку.
 *
 * Открывается, когда у позиции несколько услуг (нужно выбрать, к какой относится
 * действие) либо когда оператор жмёт «Назначить». Для позиции с одной услугой
 * смена статуса выполняется сразу, без этого окна.
 */
function QuickItemActionsModal({
  orderId, item, mode, services, employees, roles, onClose, onDone,
}: {
  orderId: number
  item: OrderItem
  /** С чего открылось окно: 'assign' — назначение, 'status' — смена статуса. */
  mode: 'assign' | 'status'
  services: OrderItemService[]
  employees: Employee[]
  roles: EmployeeRole[]
  onClose: () => void
  onDone: () => void | Promise<void>
}) {
  const { showToast } = useToast()
  // Если услуга одна, промежуточный выбор услуги не нужен: сразу раскрываем
  // список исполнителей. Оператор жал «Назначить» — он и должен его увидеть.
  const [assignFor, setAssignFor] = useState<number | null>(
    mode === 'assign' && services.length === 1 ? services[0].id : null
  )
  const [picked, setPicked] = useState<number[]>(
    mode === 'assign' && services.length === 1
      ? (services[0].assignees ?? []).map(a => a.id)
      : []
  )
  const [busy, setBusy] = useState(false)
  useEscapeClose(true, onClose)

  // Те же правила подбора исполнителей, что в развёрнутой панели услуг:
  // сотрудник без роли — универсал, иначе роль должна включать тип позиции.
  const suitable = employees.filter(e => {
    if (e.role_id == null) return true
    const role = roles.find(r => r.id === e.role_id)
    return !role || role.item_type_ids.includes(item.item_type_id)
  })

  const changeStatus = async (svc: OrderItemService, next: ServiceStatus) => {
    setBusy(true)
    try {
      await updateServiceStatus(orderId, item.id, svc.id, { status: next })
      await onDone()
      onClose()
    } catch (e: unknown) {
      showToast((e as any)?.response?.data?.message || 'Ошибка смены статуса', 'error')
    } finally { setBusy(false) }
  }

  const saveAssignees = async (svcId: number) => {
    setBusy(true)
    try {
      await assignServiceEmployees(orderId, item.id, svcId, { employee_ids: picked })
      await onDone()
      setAssignFor(null)
    } catch (e: unknown) {
      showToast((e as any)?.response?.data?.message || 'Ошибка назначения', 'error')
    } finally { setBusy(false) }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 620 }}>
        <h2 style={{ marginTop: 0 }}>
          {item.item_type_name || `Позиция #${item.id}`}
        </h2>
        <div style={{ color: '#7f8c8d', fontSize: '0.9em', marginTop: -8, marginBottom: 14 }}>
          {item.description || 'без описания'}
        </div>

        {services.length === 0 ? (
          <div style={{ color: '#999', padding: '12px 0' }}>У позиции нет активных услуг.</div>
        ) : services.map(svc => {
          const assignees = svc.assignees ?? []
          const noAssignee = assignees.length === 0
          // Куда можно перевести услугу. CREATED ↔ IN_PROGRESS ↔ DONE в обе
          // стороны: оператор должен уметь и откатить ошибочный переход.
          const targets: ServiceStatus[] =
            (['CREATED', 'IN_PROGRESS', 'DONE'] as ServiceStatus[]).filter(s => s !== svc.status)
          return (
            <div key={svc.id} style={{
              border: '1px solid #e6e9ea', borderRadius: 6, padding: 10, marginBottom: 10,
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <div style={{ minWidth: 0 }}>
                  <strong>{svc.sku_name || `Услуга #${svc.id}`}</strong>
                  <div style={{ fontSize: '0.85em', color: '#7f8c8d', marginTop: 2 }}>
                    Исполнители: {assignees.length > 0 ? assignees.map(a => a.name).join(', ') : 'не назначены'}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                  <Badge status={svc.status} labels={SERVICE_STATUS_LABELS} />
                  {/* В режиме смены статуса кнопка «Исполнители» не нужна —
                      оператор пришёл сюда за статусом, лишний выбор мешает. */}
                  {mode === 'assign' && (
                    <button
                      className="btn-secondary btn-sm"
                      disabled={busy}
                      onClick={() => {
                        setAssignFor(assignFor === svc.id ? null : svc.id)
                        setPicked(assignees.map(a => a.id))
                      }}
                    >Исполнители</button>
                  )}
                  {mode === 'status' && (
                    /* Выпадающий выбор целевого статуса вместо одной кнопки
                       «следующий шаг» — оператор видит все доступные переходы. */
                    <StyledSelect<string>
                      value=""
                      width={170}
                      disabled={busy || noAssignee}
                      ariaLabel="Перевести услугу в статус"
                      placeholder={noAssignee ? 'Нужен исполнитель' : 'Перевести в…'}
                      options={targets.map(s => ({ value: s, label: SERVICE_STATUS_LABELS[s] ?? s }))}
                      onChange={v => void changeStatus(svc, v as ServiceStatus)}
                    />
                  )}
                </div>
              </div>

              {assignFor === svc.id && (
                <div style={{ marginTop: 10, borderTop: '1px solid #eee', paddingTop: 10 }}>
                  <div style={{ maxHeight: 190, overflowY: 'auto', marginBottom: 8 }}>
                    {suitable.length === 0 ? (
                      <div style={{ color: '#999', fontSize: '0.9em' }}>Нет подходящих сотрудников</div>
                    ) : suitable.map(emp => (
                      <label key={emp.id} style={{
                        display: 'flex', alignItems: 'center', gap: 8, padding: '4px 2px', cursor: 'pointer',
                      }}>
                        <input
                          type="checkbox"
                          checked={picked.includes(emp.id)}
                          onChange={() => setPicked(p =>
                            p.includes(emp.id) ? p.filter(x => x !== emp.id) : [...p, emp.id])}
                          style={{ width: 'auto' }}
                        />
                        <span>{emp.name}</span>
                      </label>
                    ))}
                  </div>
                  {/* Только «Применить»: передумал — есть «Закрыть» у всего окна,
                      отдельная «Отмена» рядом только запутывает. */}
                  <button className="btn-primary btn-sm" disabled={busy} onClick={() => void saveAssignees(svc.id)}>
                    Применить
                  </button>
                </div>
              )}
            </div>
          )
        })}

        <div className="modal-actions">
          <button className="btn-secondary" onClick={onClose}>Закрыть</button>
        </div>
      </div>
    </div>
  )
}

// ---- Main Page ----
export default function OrderDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { showToast } = useToast()
  const { isReadonly } = useAuth()
  const orderId = Number(id)

  // Скрывать отменённые позиции (тумблер в карточке + автоматически в PDF).
  // V19 (#1): по дефолту отменённые СКРЫТЫ — оператор видит только активные.
  // Чтобы посмотреть отменённые — снимает галку.
  const [hideCanceledItems, setHideCanceledItems] = useState(true)
  // V19 (#3): отмена позиции — через единую CancelReasonModal, а не браузерный prompt().
  const [cancelItem, setCancelItem] = useState<OrderItem | null>(null)
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
  // V19: модификаторы которые уже на клиенте — чтобы скрывать кнопку «→ клиенту» для них.
  const [clientModifierIds, setClientModifierIds] = useState<Set<number>>(new Set())
  // Флаг is_problem подгружается сразу с загрузкой заказа — чтобы был красный
  // алерт «Проблемный клиент» прямо на странице заказа, а не только в модалке
  // карточки клиента.
  const [clientIsProblem, setClientIsProblem] = useState<boolean>(false)
  /** Правка №5: услуги по позициям — для быстрых действий из списка позиций. */
  const [servicesByItem, setServicesByItem] = useState<Map<number, OrderItemService[]>>(new Map())
  /**
   * Правка №5: попап быстрых действий по позиции.
   * mode задаёт, с чего он открывается — с назначения исполнителей или со смены
   * статуса. Если услуга у позиции одна, промежуточный выбор услуги пропускается.
   */
  const [quickItem, setQuickItem] = useState<{ item: OrderItem; mode: 'assign' | 'status' } | null>(null)

  const handleQuickAssign = (item: OrderItem) => setQuickItem({ item, mode: 'assign' })
  const handleQuickStatus = (item: OrderItem) => setQuickItem({ item, mode: 'status' })
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
    // V18: квартира — отдельно от адреса.
    pickup_apartment: '',
    delivery_apartment: '',
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
      const [o, its, hist, allPhotos, allSvc] = await Promise.all([
        getOrder(orderId),
        getOrderItems(orderId),
        getOrderHistory(orderId),
        getAllOrderPhotos(orderId).catch(() => [] as ItemPhoto[]),
        // Правка №5: услуги всех позиций одним запросом — нужны для быстрых
        // действий прямо в строке позиции (сколько услуг, назначен ли исполнитель).
        getAllOrderServices(orderId).catch(() => []),
      ])
      setOrder(o)
      setItems(its)
      setHistory(hist)
      const svcMap = new Map<number, OrderItemService[]>()
      allSvc.forEach(s => {
        const arr = svcMap.get(s.order_item_id) || []
        arr.push(s as unknown as OrderItemService)
        svcMap.set(s.order_item_id, arr)
      })
      setServicesByItem(svcMap)
      // Раскладываем фото по позициям в Map<itemId, photos[]> — один проход вместо N fetch.
      const grouped = new Map<number, ItemPhoto[]>()
      allPhotos.forEach(p => {
        const arr = grouped.get(p.order_item_id) || []
        arr.push(p)
        grouped.set(p.order_item_id, arr)
      })
      setPhotosByItemId(grouped)
      getOrderModifiers(orderId).then(setOrderModifiers).catch(() => {})
      // V19: подгружаем модификаторы клиента, чтобы знать какие уже у него есть.
      if (o.client_id) {
        getClientModifiers(o.client_id).then(mods => {
          setClientModifierIds(new Set(mods.map(m => m.id)))
        }).catch(() => setClientModifierIds(new Set()))
        // Флаг «Проблемный клиент» — для алерта на странице заказа.
        getClient(o.client_id).then(c => setClientIsProblem(!!c.is_problem)).catch(() => setClientIsProblem(false))
      } else {
        setClientModifierIds(new Set())
        setClientIsProblem(false)
      }
      setCommentValue(o.comment ?? '')
      setDetails({
        pickup_address: o.pickup_address ?? '',
        delivery_address: o.delivery_address ?? '',
        pickup_apartment: o.pickup_apartment ?? '',
        delivery_apartment: o.delivery_apartment ?? '',
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

  /**
   * Правка №3: подтягиваем статусы, пока страница открыта.
   *
   * Типичная жалоба «услуга Готова, а позиция Создана» возникала не из-за бэка
   * (там пересчёт корректный), а из-за того, что оператор держал заказ открытым
   * на компьютере, пока стирщик менял статус с телефона. Страница показывала
   * снимок на момент загрузки.
   *
   * Обновляем только order/items/history — НЕ трогаем состояние форм
   * (details, commentValue), иначе фоновое обновление затрёт то, что оператор
   * прямо сейчас печатает в полях адреса или комментария.
   */
  useEffect(() => {
    if (!orderId) return
    let cancelled = false
    const refreshStatuses = async () => {
      if (document.hidden) return
      try {
        const [o, its] = await Promise.all([getOrder(orderId), getOrderItems(orderId)])
        if (cancelled) return
        setOrder(o)
        setItems(its)
      } catch { /* сеть моргнула — попробуем на следующем тике */ }
    }
    const timer = setInterval(refreshStatuses, 20000)
    // Возврат на вкладку — самый частый момент, когда данные уже устарели.
    document.addEventListener('visibilitychange', refreshStatuses)
    window.addEventListener('focus', refreshStatuses)
    return () => {
      cancelled = true
      clearInterval(timer)
      document.removeEventListener('visibilitychange', refreshStatuses)
      window.removeEventListener('focus', refreshStatuses)
    }
  }, [orderId])

  // V17 presence: пока страница открыта — пингуем бэк раз в 15 сек. Бэк не шлёт нам
  // уведомления по этому заказу, пока мы тут (мы и так всё видим). Heartbeat TTL=30с,
  // так что если вкладка свернётся/упадёт — за 30с автоматически «уйдём».
  useEffect(() => {
    if (!orderId) return
    const ping = () => {
      fetch(`/api/presence/order/${orderId}`, {
        method: 'POST', credentials: 'include',
      }).catch(() => {})
    }
    ping()
    const id = setInterval(ping, 15000)
    return () => {
      clearInterval(id)
      fetch(`/api/presence/order/${orderId}`, {
        method: 'DELETE', credentials: 'include',
      }).catch(() => {})
    }
  }, [orderId])

  const [showCancelOrderModal, setShowCancelOrderModal] = useState(false)
  const [showRollbackModal, setShowRollbackModal] = useState(false)

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

  /** Откат статуса на шаг назад — исправление ошибочного перевода. Причина обязательна. */
  const confirmRollbackStatus = async (reason: string) => {
    try {
      const updated = await rollbackOrderStatus(orderId, reason)
      setOrder(updated)
      const hist = await getOrderHistory(orderId)
      setHistory(hist)
      setShowRollbackModal(false)
      // Перегружаем позиции: после отката меняется isEditable и доступные действия.
      await loadOrder()
      showToast(`Статус откачен в «${ORDER_STATUS_LABELS[updated.status]}»`, 'success')
    } catch (e: unknown) {
      const msg = (e as any)?.response?.data?.message || 'Ошибка отката статуса'
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

  /**
   * Автосохранение блока «Логистика и детали».
   *
   * Оператору неудобно жать «Сохранить» после каждой правки, поэтому сохраняем
   * сами, когда фокус уходит с поля (onBlur) и данные реально изменились.
   * Форма при этом НЕ закрывается (silent=true) — иначе она схлопывалась бы
   * посреди редактирования. Кнопка «Сохранить» остаётся как явное завершение.
   */
  const savedDetailsRef = useRef<string>('')
  useEffect(() => {
    // Запоминаем состояние на момент открытия формы — с ним сравниваем на blur.
    if (editDetails) savedDetailsRef.current = JSON.stringify(details)
    // details намеренно не в зависимостях: нужен снимок ровно при открытии.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editDetails])

  const autoSaveDetails = () => {
    if (!editDetails) return
    const now = JSON.stringify(details)
    if (now === savedDetailsRef.current) return   // ничего не меняли — не дёргаем бэк
    savedDetailsRef.current = now
    void saveDetails(true)
  }

  const saveDetails = async (silent = false) => {
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
        pickup_apartment: details.pickup_apartment || null,
        delivery_apartment: details.delivery_apartment || null,
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
      // При автосохранении форму не закрываем — оператор продолжает править.
      if (!silent) setEditDetails(false)
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

  /**
   * Печать накладной. Два вида документа:
   *   'delivery' — отвоз готовых ковров клиенту: позиции, размеры, услуги, итог;
   *   'pickup'   — забор ковров у клиента: только ковровые изделия (без служебных
   *                позиций Приём/Доставка/Оформление), размеры и стоимость помечены
   *                как предварительные, доставка вынесена отдельной строкой.
   *
   * Лист горизонтальный, на нём два одинаковых экземпляра (клиенту и организации),
   * оба с местом под подпись — режется по пунктиру посередине.
   */
  const handlePrintPdf = async (mode: 'delivery' | 'pickup' = 'delivery') => {
    if (!order) return
    const modRows = orderModifiers.map(m => {
      const amount = Number(order.base_amount) * m.percent / 100
      const sign = amount >= 0 ? '+' : ''
      return `<tr><td style="padding:3px 6px">${m.modifier_name} (${m.percent > 0 ? '+' : ''}${m.percent}%)</td><td style="padding:3px 6px;text-align:right">${sign}${amount.toFixed(2)} руб.</td></tr>`
    }).join('')

    // Загружаем услуги для всех позиций ОДНИМ батч-запросом (раньше было N запросов).
    const allFlat = await getAllOrderServices(orderId).catch(() => [])
    const servicesByItem = new Map<number, typeof allFlat>()
    allFlat.forEach(s => {
      const arr = servicesByItem.get(s.order_item_id) || []
      arr.push(s)
      servicesByItem.set(s.order_item_id, arr)
    })

    // Отменённые позиции из печатной формы исключаем всегда — клиенту они не нужны.
    const activeItems = items.filter(i => i.status !== 'CANCELLED')
    // Служебные позиции (V22): «Приём», «Доставка», «Оформление» — это не изделия,
    // а этапы работы. В накладной на забор их не показываем: клиенту важен список
    // сданных ковров, а доставка идёт отдельной строкой в итогах.
    const SERVICE_ITEM_TYPES = new Set(['Приём', 'Доставка', 'Оформление'])
    const isServiceItem = (it: typeof activeItems[number]) =>
      SERVICE_ITEM_TYPES.has((it.item_type_name || '').trim())
    const goodsItems = activeItems.filter(it => !isServiceItem(it))
    const serviceItems = activeItems.filter(isServiceItem)
    const deliveryAmount = serviceItems.reduce((sum, it) => sum + Number(it.price), 0)

    const visibleItems = mode === 'pickup' ? goodsItems : activeItems
    const dims = (it: typeof activeItems[number]) =>
      `${it.length ? it.length + '×' + (it.width || 0) : '—'}${it.weight ? ' (' + it.weight + 'кг)' : ''}${it.area ? ' S=' + it.area : ''}${it.running_meters ? ' ' + it.running_meters + 'п.м.' : ''}`

    const itemRows = visibleItems.map((it, idx) => {
      // В накладной на забор услуги не расписываем: на этом этапе состав работ
      // ещё уточняется, показываем только принятые изделия.
      const svcRows = mode === 'pickup' ? '' : (servicesByItem.get(it.id) || [])
        .filter(s => s.status !== 'CANCELLED')
        .map(s =>
          `<tr style="background:#fafafa;font-size:9px">
            <td style="padding:1px 6px 1px 16px" colspan="3">— ${s.sku_name || 'Услуга #' + s.sku_id}
              <span style="color:#888;margin-left:6px">(${SERVICE_STATUS_LABELS[s.status] || s.status})</span>
            </td>
            <td style="padding:1px 6px"></td>
            <td style="padding:1px 6px;text-align:right">${Number(s.price).toFixed(2)} руб.</td>
          </tr>`
        ).join('')
      return `<tr>
        <td style="padding:3px 6px">${idx + 1}</td>
        <td style="padding:3px 6px">${it.item_type_name || 'Тип #' + it.item_type_id}</td>
        <td style="padding:3px 6px">${it.description || '—'}${it.defects ? '<br><span style="color:#e67e22;font-size:0.9em">Дефекты: ' + it.defects + '</span>' : ''}</td>
        <td style="padding:3px 6px">${dims(it)}</td>
        <td style="padding:3px 6px;text-align:right;font-weight:bold">${Number(it.price).toFixed(2)} руб.</td>
      </tr>${svcRows}`
    }).join('')

    const docTitle = mode === 'pickup'
      ? 'НАКЛАДНАЯ НА ПРИЁМ КОВРОВ'
      : 'НАКЛАДНАЯ НА ВЫДАЧУ КОВРОВ'

    // Итоги. Для забора всё помечено как предварительное: размеры уточняются на
    // производстве, от них зависит цена.
    const totalsBlock = mode === 'pickup' ? `
<table>
  <tbody>
    <tr><td style="padding:2px 5px">Предварительная стоимость ковров</td><td style="padding:2px 5px;text-align:right">${goodsItems.reduce((s, it) => s + Number(it.price), 0).toFixed(2)} руб.</td></tr>
    <tr><td style="padding:2px 5px">Доставка</td><td style="padding:2px 5px;text-align:right">${deliveryAmount > 0 ? deliveryAmount.toFixed(2) + ' руб.' : 'включена в стоимость'}</td></tr>
    ${modRows}
    <tr class="total-row"><td style="padding:4px 5px;border-top:2px solid #333">ПРЕДВАРИТЕЛЬНО К ОПЛАТЕ</td><td style="padding:4px 5px;text-align:right;border-top:2px solid #333">${Number(order.total_amount).toFixed(2)} руб.</td></tr>
  </tbody>
</table>
<div class="notice">
  <div>• Ковровые изделия приняты у клиента для дальнейшей обработки на производстве.</div>
  <div>• Размеры предварительные и будут уточнены после поступления ковров на производство.</div>
  <div>• Стоимость предварительная и может быть изменена после уточнения размеров и фактической обработки ковров.</div>
  <div>• ${deliveryAmount > 0 ? 'Доставка рассчитывается отдельно согласно условиям заказа.' : 'Доставка включена в стоимость заказа.'}</div>
</div>` : `
<table>
  <tbody>
    <tr><td style="padding:2px 5px;font-weight:bold">Сумма позиций</td><td style="padding:2px 5px;text-align:right;font-weight:bold">${Number(order.base_amount).toFixed(2)} руб.</td></tr>
    ${modRows}
    <tr class="total-row"><td style="padding:4px 5px;border-top:2px solid #333">ИТОГО</td><td style="padding:4px 5px;text-align:right;border-top:2px solid #333">${Number(order.total_amount).toFixed(2)} руб.</td></tr>
  </tbody>
</table>
<div style="margin-top:6px">
  <span class="label">Оплата:</span> ${order.paid ? 'Оплачен (' + (order.payment_type ? PAYMENT_LABELS[order.payment_type] : '') + ')' : 'Не оплачен'}
</div>`

    /**
     * Один экземпляр накладной. copyLabel различает клиентский и наш.
     *
     * Верстаем «в ширину»: экземпляр занимает всю ширину листа и половину его
     * высоты, поэтому шапка и реквизиты идут строками, а итоги с примечаниями —
     * двумя колонками рядом с таблицей, а не под ней.
     */
    const renderCopy = (copyLabel: string) => `
<div class="copy">
  <div class="head-row">
    <div>
      <span class="company">СТИРКА КОВРОВ</span>
      <span style="font-size:8px;color:#666;margin-left:6px">Система учёта заказов</span>
    </div>
    <div class="doc-title">${docTitle}</div>
    <div class="copy-label">${copyLabel}</div>
  </div>

  <div class="meta-row">
    <span><span class="label">Заказ:</span> ${formatOrderNumber(order.id, order.created_at)}</span>
    <span><span class="label">Клиент:</span> ${order.client_name}</span>
    ${order.client_address ? '<span><span class="label">Адрес:</span> ' + order.client_address + '</span>' : ''}
    ${mode === 'pickup'
      ? (order.pickup_date ? '<span><span class="label">Забор:</span> ' + order.pickup_date + (order.pickup_time_slot ? ' (' + order.pickup_time_slot + ')' : '') + '</span>' : '')
      : (order.delivery_date ? '<span><span class="label">Доставка:</span> ' + order.delivery_date + (order.delivery_time_slot ? ' (' + order.delivery_time_slot + ')' : '') + '</span>' : '')}
    ${order.legacy_id ? '<span style="color:#666">ID старой системы: ' + order.legacy_id + '</span>' : ''}
    ${order.is_warranty ? '<span class="label">Гарантийный заказ</span>' : ''}
    ${order.comment ? '<span><span class="label">Комментарий:</span> ' + order.comment + '</span>' : ''}
  </div>

  <div class="body-row">
    <div class="col-items">
      <table>
        <thead><tr><th style="width:22px">#</th><th style="width:22%">Вид</th><th>Описание</th><th style="width:20%">${mode === 'pickup' ? 'Размеры (предв.)' : 'Размеры'}</th><th style="width:18%;text-align:right">${mode === 'pickup' ? 'Стоимость (предв.)' : 'Стоимость'}</th></tr></thead>
        <tbody>${itemRows || '<tr><td colspan="5" style="padding:8px;text-align:center;color:#999">Изделий нет</td></tr>'}</tbody>
      </table>
    </div>
    <div class="col-total">
      ${totalsBlock}
    </div>
  </div>

  <div class="foot-row">
    <div class="sig-block">
      <div class="sig-line"></div>
      <div class="sig-label">Подпись клиента / ФИО</div>
    </div>
    <div class="sig-block">
      <div class="sig-line"></div>
      <div class="sig-label">Подпись представителя / ФИО</div>
    </div>
    <div class="footer">Сформирован ${new Date().toLocaleString('ru')}</div>
  </div>
</div>`

    const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>${docTitle} ${formatOrderNumber(order.id, order.created_at)}</title>
<style>
  /* Вертикальный лист, на нём два одинаковых экземпляра друг под другом.
     Каждый занимает половину высоты и всю ширину — то есть сам «горизонтальный».
     Рвётся пополам по высоте листа: линия отреза посередине. */
  @page { size: A4 portrait; margin: 8mm; }
  body { font-family: Arial, sans-serif; font-size: 10px; margin: 0; color: #333;
         display: flex; flex-direction: column;
         /* A4 297mm минус поля 8mm сверху и снизу. */
         height: 281mm; }
  .copy { height: 50%; box-sizing: border-box; overflow: hidden; padding-bottom: 4mm;
          display: flex; flex-direction: column; }
  .copy + .copy { border-top: 1px dashed #999; padding-top: 4mm; padding-bottom: 0; }

  /* Шапка одной строкой: название, тип документа, чей экземпляр. */
  .head-row { display: flex; align-items: baseline; justify-content: space-between;
              gap: 10px; border-bottom: 2px solid #333; padding-bottom: 3px; margin-bottom: 4px; }
  .company { font-size: 13px; font-weight: bold; letter-spacing: 1.2px; }
  .doc-title { font-size: 11px; font-weight: bold; }
  .copy-label { font-size: 9px; color: #666; }

  /* Реквизиты — в строку с переносом, чтобы не съедать высоту. */
  .meta-row { display: flex; flex-wrap: wrap; gap: 2px 14px; font-size: 9px; margin-bottom: 4px; }
  .label { font-weight: bold; }

  /* Таблица и итоги рядом: половина листа по высоте, места вниз нет. */
  .body-row { display: flex; gap: 6mm; flex: 1; min-height: 0; overflow: hidden; }
  .col-items { flex: 1 1 68%; min-width: 0; overflow: hidden; }
  .col-total { flex: 0 0 30%; }

  table { width: 100%; border-collapse: collapse; }
  th { background: #f0f0f0; text-align: left; padding: 2px 5px; border: 1px solid #ccc; font-size: 8px; }
  td { border: 1px solid #ccc; font-size: 8px; vertical-align: top; }
  .total-row { font-size: 10px; font-weight: bold; }
  .notice { margin-top: 4px; font-size: 7px; color: #555; line-height: 1.45; }

  /* Подписи и штамп времени — прижаты к низу экземпляра. */
  .foot-row { display: flex; align-items: flex-end; justify-content: space-between;
              gap: 10px; margin-top: 3mm; }
  .sig-block { flex: 1 1 0; max-width: 38%; }
  .sig-line { border-bottom: 1px solid #333; margin-bottom: 2px; height: 14px; }
  .sig-label { font-size: 7px; color: #666; }
  .footer { font-size: 7px; color: #999; white-space: nowrap; }

  tr, .sig-block { page-break-inside: avoid; break-inside: avoid; }
  table thead { display: table-header-group; }
</style></head><body>
${renderCopy('Экземпляр клиента')}
${renderCopy('Экземпляр организации')}
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

  // Редактирование закрыто только у оплаченного заказа (COMPLETED): там сошлись
  // деньги, менять состав нельзя — только гарантийный возврат.
  // DELIVERED и CANCELLED раньше тоже блокировались, но тогда ошибочный перевод
  // статуса намертво замораживал заказ. Теперь оператор либо правит на месте,
  // либо жмёт «↶ Откатить» и возвращает предыдущий статус.
  // В режиме просмотра (моноблок) — всегда readonly.
  const isEditable = !isReadonly && order.status !== 'COMPLETED'

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
            {/* V30: предварительный тип оплаты. Оператор ставит заранее — водитель
                видит его в маршрутном листе. Это намерение, не факт оплаты. */}
            <div style={{ marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
              <strong>Оплата (предв.):</strong>
              <StyledSelect<string>
                value={order.preliminary_payment_type ?? ''}
                width={210}
                disabled={order.status === 'CANCELLED'}
                ariaLabel="Предварительный тип оплаты"
                placeholder="— не указан —"
                options={[
                  { value: '', label: '— не указан —' },
                  ...ALL_PRELIMINARY_PAYMENTS.map(v => ({ value: v as string, label: PRELIMINARY_PAYMENT_LABELS[v] })),
                ]}
                onChange={async raw => {
                  const v = raw ? (raw as PreliminaryPaymentType) : null
                  try {
                    await setPreliminaryPayment(orderId, v)
                    await loadOrder()
                  } catch (err: unknown) {
                    showToast((err as any)?.response?.data?.message || 'Ошибка сохранения', 'error')
                  }
                }}
              />
            </div>
            <div style={{ marginBottom: 8, display: 'inline-flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
              <strong>Клиент:</strong>{' '}
              <button className="btn-secondary btn-sm" onClick={openClientCard} style={{ marginLeft: 4 }}>
                {order.client_name}
              </button>
              {/* V19: быстрое переименование клиента прямо из заказа. Меняет имя у самого
                  клиента (и у всех его заказов — это уже бэк делает в ClientController.update). */}
              {isEditable && order.client_id && (
                <button
                  className="btn-secondary btn-sm"
                  title="Переименовать клиента (обновится во всех его заказах)"
                  onClick={async () => {
                    const newName = prompt('Новое имя клиента:', order.client_name)?.trim()
                    if (!newName || newName === order.client_name) return
                    try {
                      const c = await getClient(order.client_id!)
                      // Для физлица — пытаемся разбить введённое на «фамилия имя»
                      const isIndividual = c.client_type === 'INDIVIDUAL'
                      const parts = newName.split(/\s+/)
                      const newLastName = isIndividual && parts.length >= 2 ? parts[0] : (c.last_name ?? undefined)
                      const newFirstName = isIndividual && parts.length >= 2 ? parts.slice(1).join(' ') : (c.first_name ?? undefined)
                      await (await import('../api/clients')).updateClient(c.id, {
                        client_type: c.client_type,
                        name: newName,
                        first_name: newFirstName ?? undefined,
                        last_name: newLastName ?? undefined,
                        phone: c.phone ?? '',
                        extra_phone: c.extra_phone ?? undefined,
                        address: c.address ?? undefined,
                        apartment: c.apartment ?? undefined,
                        district: c.district ?? undefined,
                        inn: c.inn ?? undefined,
                        contact_person: c.contact_person ?? undefined,
                        contact_person_phone: c.contact_person_phone ?? undefined,
                        comment: c.comment ?? undefined,
                        is_pensioner: c.is_pensioner,
                        is_problem: c.is_problem,
                        is_regular: c.is_regular,
                        lat: c.lat,
                        lon: c.lon,
                      } as any)
                      await loadOrder()
                      showToast('Имя клиента обновлено во всех его заказах', 'success')
                    } catch (e: unknown) {
                      showToast((e as any)?.response?.data?.message || 'Ошибка переименования', 'error')
                    }
                  }}
                >✎</button>
              )}
              {isEditable && order.client_id && (
                <button
                  className="btn-secondary btn-sm"
                  title="Пометить клиента как проблемного / снять метку"
                  onClick={async () => {
                    try {
                      const c = await getClient(order.client_id!)
                      const nextProblem = !c.is_problem
                      const msg = nextProblem
                        ? `Пометить «${c.name}» как проблемного клиента? Все операторы будут видеть красный алерт при выборе клиента.`
                        : `Снять с «${c.name}» метку проблемного клиента?`
                      if (!window.confirm(msg)) return
                      await (await import('../api/clients')).updateClient(c.id, {
                        client_type: c.client_type,
                        name: c.name,
                        first_name: c.first_name ?? undefined,
                        last_name: c.last_name ?? undefined,
                        phone: c.phone ?? '',
                        extra_phone: c.extra_phone ?? undefined,
                        address: c.address ?? undefined,
                        apartment: c.apartment ?? undefined,
                        district: c.district ?? undefined,
                        inn: c.inn ?? undefined,
                        contact_person: c.contact_person ?? undefined,
                        contact_person_phone: c.contact_person_phone ?? undefined,
                        comment: c.comment ?? undefined,
                        is_pensioner: c.is_pensioner,
                        is_problem: nextProblem,
                        is_regular: c.is_regular,
                        lat: c.lat,
                        lon: c.lon,
                      } as any)
                      await loadOrder()
                      showToast(nextProblem ? 'Клиент помечен проблемным' : 'Метка снята', 'success')
                    } catch (e: unknown) {
                      showToast((e as any)?.response?.data?.message || 'Ошибка обновления клиента', 'error')
                    }
                  }}
                >⚠</button>
              )}
            </div>
            {clientIsProblem && (
              <div style={{
                marginBottom: 8, padding: '6px 10px', background: '#fdecea',
                border: '1px solid #e74c3c', borderRadius: 4, color: '#922b21',
                fontWeight: 600, fontSize: '0.9em',
              }}>
                ⚠ Проблемный клиент
              </div>
            )}
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
            /* onBlur всплывает от вложенных полей — ловим уход фокуса с любого
               из них и сохраняем, если что-то поменялось. relatedTarget внутри
               этого же блока означает переход между полями формы: там сохранять
               на каждый шаг незачем, но и вреда нет — autoSaveDetails сам
               сравнивает с последним сохранённым снимком. */
            <div onBlur={autoSaveDetails}>
              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 8 }}>
                <div className="form-group" style={{ flex: '1 1 250px', marginBottom: 4 }}>
                  <label>Адрес забора</label>
                  <AddressInput
                    value={details.pickup_address}
                    onChange={v => setDetails(d => ({...d, pickup_address: v, pickup_lat: null, pickup_lon: null}))}
                    onResolved={(r) => setDetails(d => ({
                      ...d,
                      pickup_address: r.address,
                      pickup_district: r.district || d.pickup_district,
                      pickup_lat: r.lat,
                      pickup_lon: r.lon,
                    }))}
                    externallyConfirmed={details.pickup_lat != null && details.pickup_lon != null}
                  />
                </div>
                {/* V18: квартира отдельно — не идёт в геокодирование, но видна водителю. */}
                <div className="form-group" style={{ flex: '0 0 120px', marginBottom: 4 }}>
                  <label>Кв./офис</label>
                  <input
                    value={details.pickup_apartment}
                    onChange={e => setDetails(d => ({...d, pickup_apartment: e.target.value}))}
                    placeholder="25"
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
                <div className="form-group" style={{ flex: '0 0 120px', marginBottom: 4 }}>
                  <label>Кв./офис</label>
                  <input
                    value={details.delivery_apartment}
                    onChange={e => setDetails(d => ({...d, delivery_apartment: e.target.value}))}
                    placeholder="25"
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
                <div className="form-group" style={{ flex: '0 0 200px', marginBottom: 4 }}>
                  <label>Время забора</label>
                  <TimeSlotSelect
                    value={details.pickup_time_slot}
                    onChange={v => setDetails(d => ({...d, pickup_time_slot: v}))}
                    date={details.pickup_date}
                  />
                </div>
                <div className="form-group" style={{ flex: '0 0 160px', marginBottom: 4 }}>
                  <label>Дата доставки</label>
                  <input type="date" value={details.delivery_date} onChange={e => setDetails(d => ({...d, delivery_date: e.target.value}))} />
                </div>
                <div className="form-group" style={{ flex: '0 0 200px', marginBottom: 4 }}>
                  <label>Время доставки</label>
                  <TimeSlotSelect
                    value={details.delivery_time_slot}
                    onChange={v => setDetails(d => ({...d, delivery_time_slot: v}))}
                    date={details.delivery_date}
                  />
                </div>
              </div>
              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 8 }}>
                <div className="form-group" style={{ flex: '0 0 160px', marginBottom: 4 }}>
                  <label>ID из старой системы</label>
                  <input type="number" value={details.legacy_id} onChange={e => setDetails(d => ({...d, legacy_id: e.target.value}))} placeholder="Legacy ID" />
                </div>
              </div>
              <div style={{ display: 'flex', gap: 4 }}>
                <button className="btn-success btn-sm" onClick={() => void saveDetails()}>Готово</button>
                <button className="btn-secondary btn-sm" onClick={() => setEditDetails(false)}>Закрыть</button>
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
              <div>
                <div style={{ marginBottom: 4 }}>
                  <strong>Адрес забора:</strong> {order.pickup_address || '(не указан)'}
                  {order.pickup_apartment && <span style={{ marginLeft: 6, padding: '1px 6px', background: '#ecf0f1', borderRadius: 4, fontSize: '0.9em' }}>кв. {order.pickup_apartment}</span>}
                </div>
                {order.pickup_district && <div style={{ marginBottom: 4, fontSize: '0.9em', color: '#666' }}>Район: {order.pickup_district}</div>}
                <div style={{ marginBottom: 4 }}><strong>Дата забора (план):</strong> {order.pickup_date ? `${order.pickup_date}` : '(не назначена)'} {order.pickup_time_slot ? `(${order.pickup_time_slot})` : ''}</div>
                {order.actual_pickup_date && order.actual_pickup_date !== order.pickup_date && (
                  <div style={{ marginBottom: 4, color: '#e67e22' }}><strong>Дата забора (факт):</strong> {order.actual_pickup_date} {order.actual_pickup_time_slot ? `(${order.actual_pickup_time_slot})` : ''}</div>
                )}
              </div>
              <div>
                <div style={{ marginBottom: 4 }}>
                  <strong>Адрес доставки:</strong> {order.delivery_address || '(не указан)'}
                  {order.delivery_apartment && <span style={{ marginLeft: 6, padding: '1px 6px', background: '#ecf0f1', borderRadius: 4, fontSize: '0.9em' }}>кв. {order.delivery_apartment}</span>}
                </div>
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
          {!isReadonly && ALLOWED_TRANSITIONS[order.status]?.length > 0 && (() => {
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
          {/* Откат на шаг назад. Доступен во всех статусах кроме COMPLETED —
              там заказ оплачен, корректировка только через гарантийный возврат.
              Прячем при пустой истории: откатывать некуда. */}
          {!isReadonly && order.status !== 'COMPLETED' && history.length > 0 && (
            <button
              className="btn-secondary"
              title="Вернуть заказ в предыдущий статус (нужно указать причину)"
              onClick={() => setShowRollbackModal(true)}
            >↶ Откатить статус</button>
          )}
          {/* Оплата возможна только когда заказ доставлен. После оплаты заказ становится «Завершённым». */}
          {!isReadonly && !order.paid && order.status === 'DELIVERED' && (
            <button className="btn-success" onClick={() => setShowPay(true)}>Оплатить и завершить</button>
          )}
          {/* В статусе DONE — клиент пришёл забрать сам и хочет сразу заплатить.
              Кнопка делает три операции одной транзакцией клиента: отмечаем доставку,
              переводим в DELIVERED, открываем PayModal — после оплаты заказ становится COMPLETED. */}
          {!isReadonly && !order.paid && order.status === 'DONE' && (
            <button className="btn-success" onClick={() => setShowDeliverAndPay(true)}>
              Принять оплату
            </button>
          )}
          {!isReadonly && (order.status === 'DELIVERED' || order.status === 'COMPLETED') && (
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
          {/* Две накладные под разные этапы: забор ковров у клиента и выдача готовых.
              Каждая печатается на горизонтальном листе в двух экземплярах. */}
          <button
            className="btn-secondary"
            onClick={() => void handlePrintPdf('pickup')}
            title="Накладная на приём ковров у клиента (размеры и стоимость предварительные)"
          >Накладная: забор</button>
          <button
            className="btn-secondary"
            onClick={() => void handlePrintPdf('delivery')}
            title="Накладная на выдачу готовых ковров клиенту"
          >Накладная: отвоз</button>
          {/* V17: проблемный заказ. Поднятый флаг шлёт уведомление админам и виден в UI. */}
          {!isReadonly && (
            order.is_problem ? (
              <button
                className="btn-success"
                title={`Снять флаг проблемы. Причина: ${order.problem_reason || '—'}`}
                onClick={async () => {
                  try {
                    const updated = await setOrderProblem(orderId, false)
                    setOrder(updated)
                    showToast('Флаг проблемы снят', 'success')
                  } catch (e: unknown) {
                    showToast((e as any)?.response?.data?.message || 'Ошибка', 'error')
                  }
                }}
              >✓ Проблема решена</button>
            ) : (
              <button
                className="btn-warning"
                title="Пометить заказ проблемным — придёт уведомление администраторам"
                onClick={() => {
                  const reason = prompt('Опишите проблему (минимум 10 символов):')?.trim()
                  if (!reason) return
                  if (reason.length < 10) { showToast('Минимум 10 символов', 'error'); return }
                  setOrderProblem(orderId, true, reason).then(updated => {
                    setOrder(updated)
                    showToast('Заказ помечен проблемным, админы оповещены', 'success')
                  }).catch((e: unknown) => {
                    showToast((e as any)?.response?.data?.message || 'Ошибка', 'error')
                  })
                }}
              >⚠ Проблема</button>
            )
          )}
        </div>
        {/* Баннер о проблеме — на видном месте если флаг поднят. */}
        {order.is_problem && (
          <div style={{
            marginTop: 12, padding: '10px 14px',
            background: '#fdecea', border: '1px solid #f5b7b1',
            borderRadius: 6, color: '#922b21',
          }}>
            <strong>⚠ Проблемный заказ:</strong> {order.problem_reason || 'причина не указана'}
          </div>
        )}
      </div>

      {/* Items */}
      <div className="card" data-tour="order-items">
        <div className="page-header" style={{ marginBottom: 12 }}>
          <h2 style={{ margin: 0 }}>Позиции заказа</h2>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
            {/* V19 (#1): отменённые позиции скрыты по дефолту. Снять галку — показать. */}
            {items.some(i => i.status === 'CANCELLED') && (
              <label style={{ display: 'flex', gap: 6, alignItems: 'center', cursor: 'pointer', fontSize: '0.9em', color: '#7f8c8d' }}>
                <input
                  type="checkbox"
                  checked={!hideCanceledItems}
                  onChange={e => setHideCanceledItems(!e.target.checked)}
                  style={{ width: 'auto' }}
                />
                Показать отменённые
              </label>
            )}
            {isEditable && (
              <button className="btn-primary" onClick={() => setShowAddItem(true)}>+ Добавить позицию</button>
            )}
          </div>
        </div>
        {/* Горизонтальный скролл: в «Действиях» до четырёх кнопок, на узких
            экранах колонка иначе обрезалась по краю карточки. */}
        <div style={{ overflowX: 'auto' }}>
        <table className="items-table" style={{ minWidth: 1080 }}>
          <thead>
            <tr>
              <th style={{ width: 100 }}>#</th>
              <th style={{ width: 180 }}>Тип</th>
              <th>Описание / Дефекты</th>
              <th style={{ width: 160 }}>Размеры</th>
              <th style={{ width: 120 }}>Статус</th>
              <th style={{ width: 120, textAlign: 'right' }}>Стоимость</th>
              {isEditable && <th style={{ width: 300, textAlign: 'right' }}>Действия</th>}
            </tr>
          </thead>
          <tbody>
            {items.length === 0 ? (
              <tr><td colSpan={isEditable ? 7 : 6} className="empty">Нет позиций</td></tr>
            ) : (() => {
                // V10: «по умолчанию»-сортировки нет — порядок добавления сохраняется,
                // потому что auto-add теперь живёт на SKU и не влияет на тип позиции.
                // Тумблер «Скрыть отменённые» убирает CANCELLED-позиции из таблицы (но не из заказа).
                const sorted = hideCanceledItems ? items.filter(i => i.status !== 'CANCELLED') : items
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
                    onCancelItem={(it) => setCancelItem(it)}
                    services={servicesByItem.get(item.id) || []}
                    onQuickAssign={handleQuickAssign}
                    onQuickStatus={handleQuickStatus}
                  />
                ))
              })()
            }
          </tbody>
        </table>
        </div>
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
                const alreadyOnClient = clientModifierIds.has(m.modifier_id)
                return (
                  <div key={m.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 0' }}>
                    <span>{m.modifier_name} ({isPositive ? '+' : ''}{m.percent}%)</span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ color: isPositive ? '#e74c3c' : '#27ae60', fontWeight: 600 }}>
                        {isPositive ? '+' : ''}{amount.toFixed(2)} &#8381;
                      </span>
                      {/* V19: точечный перенос модификатора на клиента — кнопка прячется,
                          если он уже привязан или у заказа нет клиента. */}
                      {isEditable && order.client_id && !alreadyOnClient && (
                        <button
                          className="btn-secondary btn-sm"
                          title="Сохранить именно этот модификатор в клиента"
                          style={{ padding: '2px 8px', fontSize: '0.8em' }}
                          onClick={async () => {
                            try {
                              await addClientModifier(order.client_id!, m.modifier_id)
                              setClientModifierIds(prev => new Set([...prev, m.modifier_id]))
                              showToast('Модификатор сохранён в клиента', 'success')
                            } catch (e: unknown) {
                              showToast((e as any)?.response?.data?.message || 'Ошибка', 'error')
                            }
                          }}
                        >→ клиенту</button>
                      )}
                      {alreadyOnClient && (
                        <span title="Этот модификатор уже привязан к клиенту"
                          style={{ fontSize: '0.75em', color: '#27ae60' }}>✓ у клиента</span>
                      )}
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
              <div style={{ marginTop: 4 }}>
                <StyledSelect<string>
                  value=""
                  width={280}
                  ariaLabel="Добавить модификатор"
                  placeholder="+ Добавить модификатор…"
                  options={available.map(m => ({
                    value: String(m.id),
                    label: `${m.name} (${m.percent > 0 ? '+' : ''}${m.percent}%)`,
                  }))}
                  onChange={v => { const id = Number(v); if (id) void handleAddModifier(id) }}
                />
              </div>
            )
          })()}

          {/* Округление вниз до сотни делает бэк (OrderService.roundDownToHundred).
              Показываем строку, иначе оператор не понимает, почему база + модификаторы
              не сходятся с ИТОГО. */}
          {(() => {
            const beforeRounding = Number(order.base_amount)
              + orderModifiers.reduce((acc, m) => acc + Number(order.base_amount) * m.percent / 100, 0)
            const diff = beforeRounding - Number(order.total_amount)
            if (diff < 0.005) return null
            return (
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', color: '#7f8c8d', fontSize: '0.9em' }}>
                <span>Округление до 100 &#8381;:</span>
                <span>&minus;{diff.toFixed(2)} &#8381;</span>
              </div>
            )
          })()}

          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 0', borderTop: '2px solid #333', marginTop: 8, fontSize: '1.1em' }}>
            <strong>ИТОГО:</strong>
            <strong>{Number(order.total_amount).toFixed(2)} &#8381;</strong>
          </div>

          {/* V19: кнопка bulk-переноса — теперь явно «все оставшиеся», чтобы не путать
              с точечными кнопками «→ клиенту» рядом с каждым модификатором. */}
          {isEditable && order.client_id && orderModifiers.some(m => !clientModifierIds.has(m.modifier_id)) && (
            <button className="btn-secondary btn-sm" onClick={async () => {
              await handlePushToClient()
              // После bulk-push считаем что ВСЕ модификаторы заказа теперь у клиента.
              setClientModifierIds(prev => {
                const next = new Set(prev)
                orderModifiers.forEach(m => next.add(m.modifier_id))
                return next
              })
            }} style={{ alignSelf: 'flex-start' }}>
              Сохранить все оставшиеся модификаторы клиенту
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
      {showRollbackModal && (
        <CancelReasonModal
          title="Откат статуса"
          subject={`Заказ #${String(order.id).padStart(5, '0')} вернётся в предыдущий статус. Причина попадёт в журнал действий.`}
          confirmLabel="Откатить"
          placeholder="Например: ошибочно нажал «Доставлен», клиент ещё не получил заказ"
          onCancel={() => setShowRollbackModal(false)}
          onConfirm={confirmRollbackStatus}
        />
      )}
      {/* Правка №5: быстрые действия по позиции без раскрытия строки. */}
      {quickItem && (
        <QuickItemActionsModal
          orderId={orderId}
          item={quickItem.item}
          mode={quickItem.mode}
          services={(servicesByItem.get(quickItem.item.id) || []).filter(s => s.status !== 'CANCELLED')}
          employees={employees}
          roles={roles}
          onClose={() => setQuickItem(null)}
          onDone={async () => { await loadOrder() }}
        />
      )}
      {/* V19 (#3): модалка отмены позиции — та же CancelReasonModal что у услуг. */}
      {cancelItem && (
        <CancelReasonModal
          title="Отмена позиции"
          subject={`Позиция #${cancelItem.id} «${cancelItem.item_type_name || ''}» будет отменена.`}
          onCancel={() => setCancelItem(null)}
          onConfirm={async (reason) => {
            const itemId = cancelItem.id
            setCancelItem(null)
            try {
              await updateOrderItemStatus(orderId, itemId, { status: 'CANCELLED', cancellation_reason: reason })
              await loadOrder()
              showToast('Позиция отменена', 'success')
            } catch (e: unknown) {
              showToast((e as any)?.response?.data?.message || 'Ошибка отмены', 'error')
            }
          }}
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
              {/* V19 (#8): кнопка «Редактировать» — открывает страницу клиентов с предзаполненным формом редактирования. */}
              {isEditable && (
                <button
                  className="btn-secondary btn-sm"
                  onClick={() => {
                    const cid = showClientCard.id
                    setShowClientCard(null)
                    navigate(`/clients?editId=${cid}`)
                  }}
                  title="Редактировать данные клиента"
                >✎ Редактировать</button>
              )}
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
