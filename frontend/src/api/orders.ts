import client from './client'
import type {
  Order, OrderItem, OrderStatusHistory,
  CreateOrderRequest, AddOrderItemRequest, UpdateOrderItemDimensionsRequest,
  UpdateStatusRequest, PayOrderRequest
} from '../types'

// Orders
export interface OrdersQuery {
  statuses?: string[]      // множественный фильтр по статусу (передаётся как несколько ?statuses=...)
  status?: string          // одиночный (legacy / совместимость)
  page?: number
  size?: number
  dateFrom?: string
  dateTo?: string
  /** По какому полю фильтровать диапазон дат. Допустимо:
   *  created_at | pickup_date | delivery_date | actual_pickup_date | actual_delivery_date.
   *  По умолчанию — created_at. */
  dateField?: string
  legacyId?: number
  paymentType?: string
  orderId?: number
  clientPhone?: string
  clientName?: string
  clientId?: number
  sortBy?: string[]        // мульти-сортировка
  sortDir?: ('asc' | 'desc')[]
  /** true = только заказы с адресом, но без координат (для перехода с дашборда). */
  noCoords?: boolean
  /** true = просрочка по фактической дате (для виджета на главной). */
  overdueActual?: boolean
  /** true = пора забирать/доставлять, но адрес не заполнен. */
  badAddress?: boolean
  /** V19: только гарантийные заказы (для аналитики). */
  onlyWarranty?: boolean
}

export const getOrdersQuery = (q: OrdersQuery = {}) => {
  const params = new URLSearchParams()
  if (q.statuses && q.statuses.length > 0) {
    q.statuses.forEach(s => params.append('statuses', s))
  } else if (q.status) {
    params.append('status', q.status)
  }
  if (q.dateFrom) params.append('dateFrom', q.dateFrom)
  if (q.dateTo) params.append('dateTo', q.dateTo)
  if (q.dateField) params.append('dateField', q.dateField)
  if (q.legacyId) params.append('legacyId', q.legacyId.toString())
  if (q.paymentType) params.append('paymentType', q.paymentType)
  if (q.orderId) params.append('orderId', q.orderId.toString())
  if (q.clientPhone) params.append('clientPhone', q.clientPhone)
  if (q.clientName) params.append('clientName', q.clientName)
  if (q.clientId) params.append('clientId', q.clientId.toString())
  if (q.sortBy && q.sortBy.length > 0) q.sortBy.forEach(s => params.append('sortBy', s))
  if (q.sortDir && q.sortDir.length > 0) q.sortDir.forEach(d => params.append('sortDir', d))
  if (q.noCoords) params.append('noCoords', 'true')
  if (q.overdueActual) params.append('overdueActual', 'true')
  if (q.badAddress) params.append('badAddress', 'true')
  if (q.onlyWarranty) params.append('onlyWarranty', 'true')
  params.append('page', String(q.page ?? 0))
  params.append('size', String(q.size ?? 20))

  return client.get<{content: Order[], total_elements: number, page: number, size: number}>(`/api/orders?${params.toString()}`).then(r => r.data)
}

// Старая позиционная сигнатура — оставлена для обратной совместимости.
export const getOrders = (status?: string, page = 0, size = 20, dateFrom?: string, dateTo?: string, legacyId?: number, paymentType?: string, orderId?: number, clientPhone?: string, clientName?: string, sortBy?: string, sortDir?: string) =>
  getOrdersQuery({
    status, page, size, dateFrom, dateTo, legacyId, paymentType, orderId, clientPhone, clientName,
    sortBy: sortBy ? [sortBy] : undefined,
    sortDir: sortDir ? [sortDir as 'asc' | 'desc'] : undefined,
  })

export const getOrder = (id: number) =>
  client.get<Order>(`/api/orders/${id}`).then(r => r.data)

export const createOrder = (data: CreateOrderRequest) =>
  client.post<Order>('/api/orders', data).then(r => r.data)

export const updateOrderStatus = (id: number, data: UpdateStatusRequest) =>
  client.patch<Order>(`/api/orders/${id}/status`, data).then(r => r.data)

/** V17: пометить заказ проблемным (или снять флаг). При TRUE reason обязателен (≥10 симв). */
export const setOrderProblem = (id: number, isProblem: boolean, reason?: string) =>
  client.patch<Order>(`/api/orders/${id}/problem`, { is_problem: isProblem, reason: reason ?? null }).then(r => r.data)

export const payOrder = (id: number, data: PayOrderRequest) =>
  client.post<Order>(`/api/orders/${id}/pay`, data).then(r => r.data)

export const createWarrantyOrder = (id: number, data: { item_ids: number[]; warranty_comment: string }) =>
  client.post<Order>(`/api/orders/${id}/warranty`, data).then(r => r.data)

export const getOrderHistory = (id: number) =>
  client.get<OrderStatusHistory[]>(`/api/orders/${id}/history`).then(r => r.data)

// Order Items
export const getOrderItems = (orderId: number) =>
  client.get<OrderItem[]>(`/api/orders/${orderId}/items`).then(r => r.data)

export const addOrderItem = (orderId: number, data: AddOrderItemRequest) =>
  client.post<OrderItem>(`/api/orders/${orderId}/items`, data).then(r => r.data)

export const updateOrderItemStatus = (orderId: number, itemId: number, data: UpdateStatusRequest) =>
  client.patch<OrderItem>(`/api/orders/${orderId}/items/${itemId}/status`, data).then(r => r.data)

// setOrderItemPrice удалён: цена позиции = сумма цен услуг, вручную не редактируется
// (ручная цена теперь только на уровне услуги — см. api/services.ts updateServicePrice).

// Order Item Description & Defects
export const updateOrderItemDescription = (orderId: number, itemId: number, data: { description?: string | null, defects?: string | null }) =>
  client.patch<OrderItem>(`/api/orders/${orderId}/items/${itemId}/description`, data).then(r => r.data)

// Order Item Dimensions
export const updateOrderItemDimensions = (orderId: number, itemId: number, data: UpdateOrderItemDimensionsRequest) =>
  client.patch(`/api/orders/${orderId}/items/${itemId}/dimensions`, data).then(r => r.data)

export const duplicateOrder = (id: number) =>
  client.post<Order>(`/api/orders/${id}/duplicate`).then(r => r.data)

export const duplicateItem = (orderId: number, itemId: number) =>
  client.post<OrderItem>(`/api/orders/${orderId}/items/${itemId}/duplicate`).then(r => r.data)

export const updateOrderComment = (id: number, comment: string) =>
  client.patch<Order>(`/api/orders/${id}/comment`, { comment }).then(r => r.data)

export const updateOrderDetails = (id: number, data: {
  pickup_address?: string | null
  delivery_address?: string | null
  /** V18: квартира — отдельно от адреса. */
  pickup_apartment?: string | null
  delivery_apartment?: string | null
  legacy_id?: number | null
  pickup_date?: string | null
  pickup_time_slot?: string | null
  delivery_date?: string | null
  delivery_time_slot?: string | null
  pickup_district?: string | null
  delivery_district?: string | null
  pickup_lat?: number | null
  pickup_lon?: number | null
  delivery_lat?: number | null
  delivery_lon?: number | null
}) =>
  client.patch<Order>(`/api/orders/${id}/details`, data).then(r => r.data)

/** V18: свап услуги на позиции — платная Доставка ↔ Самовывоз. */
export const swapItemService = (orderId: number, itemId: number, serviceId: number, newSkuId: number) =>
  client.post(`/api/orders/${orderId}/items/${itemId}/services/${serviceId}/swap`, { new_sku_id: newSkuId }).then(r => r.data)

export const updateActualDates = (id: number, data: {
  actual_pickup_date?: string | null
  actual_pickup_time_slot?: string | null
  actual_delivery_date?: string | null
  actual_delivery_time_slot?: string | null
}) =>
  client.patch<Order>(`/api/orders/${id}/actual-dates`, data).then(r => r.data)

/**
 * Назначить водителя на заказ (Спринт D — фидбэк по логистике от 11 мая).
 * Передаём `employee_id: null` чтобы снять назначение. Возвращает обновлённое
 * имя — UI сразу подставляет в чип карточки.
 */
export const setOrderDriver = (id: number, employeeId: number | null) =>
  client.patch<{ ok: boolean; assigned_driver_id: number | null; driver_name: string | null }>(
    `/api/orders/${id}/driver`, { employee_id: employeeId }
  ).then(r => r.data)

// Order Modifiers
export const getOrderModifiers = (orderId: number) =>
  client.get<import('../types').OrderModifier[]>(`/api/orders/${orderId}/modifiers`).then(r => r.data)

export const addOrderModifier = (orderId: number, modifierId: number) =>
  client.post(`/api/orders/${orderId}/modifiers`, { modifier_id: modifierId }).then(r => r.data)

export const removeOrderModifier = (orderId: number, modifierId: number) =>
  client.delete(`/api/orders/${orderId}/modifiers/${modifierId}`).then(r => r.data)

export const pushModifiersToClient = (orderId: number) =>
  client.post(`/api/orders/${orderId}/modifiers/push-to-client`)

// Employee Earnings
// Получить одну позицию по id (без orderId)
export const getOrderItemById = (itemId: number) =>
  client.get<OrderItem>(`/api/order-items/${itemId}`).then(r => r.data)

// Item Photos
export interface ItemPhoto {
  id: number
  order_item_id: number
  filename: string
  content_type: string
  data: string
  created_at: string
}
export interface ItemPhotoMeta {
  id: number
  order_item_id: number
  filename: string
  content_type: string
  created_at: string
}

export const getItemPhotos = (orderId: number, itemId: number) =>
  client.get<ItemPhoto[]>(`/api/orders/${orderId}/items/${itemId}/photos`).then(r => r.data)

/** Все фото по всем позициям заказа одним запросом — устраняет N+1. */
export const getAllOrderPhotos = (orderId: number) =>
  client.get<ItemPhoto[]>(`/api/orders/${orderId}/photos`).then(r => r.data)

/** Метаданные фото (без base64-data) для списка позиций — для превью-плейсхолдеров. */
export const getItemsPhotosMeta = (itemIds: number[]) => {
  if (itemIds.length === 0) return Promise.resolve([] as ItemPhotoMeta[])
  const sp = new URLSearchParams()
  itemIds.forEach(id => sp.append('itemIds', String(id)))
  return client.get<ItemPhotoMeta[]>(`/api/items/photos?${sp.toString()}`).then(r => r.data)
}

/**
 * Первое фото каждой позиции из списка — с base64-data для отрисовки превью.
 * Заменяет N запросов от ItemThumb одним запросом.
 */
export const getItemsFirstPhotos = (itemIds: number[]) => {
  if (itemIds.length === 0) return Promise.resolve([] as ItemPhoto[])
  const sp = new URLSearchParams()
  itemIds.forEach(id => sp.append('itemIds', String(id)))
  return client.get<ItemPhoto[]>(`/api/items/photos?${sp.toString()}`).then(r => r.data)
}

export const uploadItemPhoto = (orderId: number, itemId: number, file: File) => {
  return new Promise<void>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = async () => {
      try {
        const base64 = (reader.result as string).split(',')[1]
        await client.post(`/api/orders/${orderId}/items/${itemId}/photos`, {
          filename: file.name,
          content_type: file.type,
          data: base64,
        })
        resolve()
      } catch (e) { reject(e) }
    }
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

export const deleteItemPhoto = (orderId: number, itemId: number, photoId: number) =>
  client.delete(`/api/orders/${orderId}/items/${itemId}/photos/${photoId}`)

export const getEmployeeEarnings = (employeeId: number, status?: string, dateFrom?: string, dateTo?: string) => {
  const params = new URLSearchParams()
  if (status) params.append('status', status)
  if (dateFrom) params.append('dateFrom', dateFrom)
  if (dateTo) params.append('dateTo', dateTo)
  
  const query = params.toString() ? `?${params.toString()}` : ''
  return client.get<number>(`/api/employees/${employeeId}/earnings${query}`).then(r => r.data)
}