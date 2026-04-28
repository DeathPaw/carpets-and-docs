import client from './client'
import type {
  OrderItemService,
  UpdateStatusRequest,
  AssignEmployeesRequest,
  ServiceStatus,
  OrderItemStatus,
} from '../types'

export const getItemServices = (orderId: number, itemId: number) =>
  client.get<OrderItemService[]>(`/api/orders/${orderId}/items/${itemId}/services`).then(r => r.data)

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
  data: { service_def_id: number },
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
  status?: OrderItemStatus
  itemTypeId?: number
  orderId?: number
  employeeId?: number
  page?: number
  size?: number
}

export const getFilteredServices = (params: ServiceFilterParams) =>
  client.get<OrderItemService[]>('/api/services', { params }).then(r => r.data)

export const getFilteredItems = (params: ItemFilterParams) =>
  client.get<import('../types').OrderItem[]>('/api/items', { params }).then(r => r.data)
