import client from './client'
import type {
  OrderItemService,
  OrderItemPositioned,
  UpdateStatusRequest,
  AssignEmployeesRequest,
  ServiceStatus,
  OrderItemStatus,
} from '../types'

export const getItemServices = (orderId: number, itemId: number) =>
  client.get<OrderItemService[]>(`/api/orders/${orderId}/items/${itemId}/services`).then(r => r.data)

/**
 * Все услуги по заказу одним батчем — устраняет N+1 на странице заказа.
 * Возвращает плоский список, фронт сам группирует по order_item_id.
 */
export const getAllOrderServices = (orderId: number) =>
  client.get<OrderItemService[]>(`/api/orders/${orderId}/services`).then(r => r.data)

export const updateServiceStatus = (
  orderId: number,
  itemId: number,
  serviceId: number,
  data: UpdateStatusRequest,
) =>
  client
    .patch<OrderItemService>(`/api/orders/${orderId}/items/${itemId}/services/${serviceId}/status`, data)
    .then(r => r.data)

export const updateServicePrice = (
  orderId: number,
  itemId: number,
  serviceId: number,
  data: { price: number },
) =>
  client
    .patch<OrderItemService>(`/api/orders/${orderId}/items/${itemId}/services/${serviceId}/price`, data)
    .then(r => r.data)

export const assignServiceEmployees = (
  orderId: number,
  itemId: number,
  serviceId: number,
  data: AssignEmployeesRequest,
) =>
  client
    .post<OrderItemService>(`/api/orders/${orderId}/items/${itemId}/services/${serviceId}/assignees`, data)
    .then(r => r.data)

export const addServiceToItem = (
  orderId: number,
  itemId: number,
  data: { sku_id: number },
) =>
  client
    .post<OrderItemService>(`/api/orders/${orderId}/items/${itemId}/services`, data)
    .then(r => r.data)

export interface ServiceFilterParams {
  employeeId?: number
  status?: ServiceStatus
  itemTypeId?: number
  orderId?: number
  dateFrom?: string
  dateTo?: string
  page?: number
  size?: number
}

export interface ItemFilterParams {
  statuses?: OrderItemStatus[]
  itemTypeIds?: number[]
  orderId?: number
  positionInOrder?: number
  employeeId?: number
  /** V13: поиск по клиенту/legacy ID. Все строковые — case-insensitive подстрока. */
  clientName?: string
  clientPhone?: string
  legacyId?: number
  /** Единый поиск: имя / телефон / legacy ID / номер заказа (частичное совпадение). */
  search?: string
  page?: number
  size?: number
}

export const getFilteredServices = (params: ServiceFilterParams) =>
  client.get<OrderItemService[]>('/api/services', { params }).then(r => r.data)

export const getFilteredItems = (params: ItemFilterParams) => {
  const sp = new URLSearchParams()
  if (params.statuses && params.statuses.length > 0) {
    params.statuses.forEach(s => sp.append('statuses', s))
  }
  if (params.itemTypeIds && params.itemTypeIds.length > 0) {
    params.itemTypeIds.forEach(id => sp.append('itemTypeIds', String(id)))
  }
  if (params.orderId) sp.append('orderId', String(params.orderId))
  if (params.positionInOrder) sp.append('positionInOrder', String(params.positionInOrder))
  if (params.employeeId) sp.append('employeeId', String(params.employeeId))
  if (params.clientName) sp.append('clientName', params.clientName)
  if (params.clientPhone) sp.append('clientPhone', params.clientPhone)
  if (params.legacyId) sp.append('legacyId', String(params.legacyId))
  if (params.search) sp.append('search', params.search)
  if (params.page != null) sp.append('page', String(params.page))
  if (params.size != null) sp.append('size', String(params.size))
  return client.get<OrderItemPositioned[]>(`/api/items?${sp.toString()}`).then(r => r.data)
}
