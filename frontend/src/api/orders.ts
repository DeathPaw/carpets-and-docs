import client from './client'
import type {
  Order, OrderItem, OrderStatusHistory,
  CreateOrderRequest, AddOrderItemRequest, UpdateOrderItemDimensionsRequest,
  UpdateStatusRequest, PayOrderRequest
} from '../types'

// Orders
export const getOrders = (status?: string, page = 0, size = 20, dateFrom?: string, dateTo?: string, legacyId?: number, paymentType?: string, orderId?: number) => {
  const params = new URLSearchParams()
  if (status) params.append('status', status)
  if (dateFrom) params.append('dateFrom', dateFrom)
  if (dateTo) params.append('dateTo', dateTo)
  if (legacyId) params.append('legacyId', legacyId.toString())
  if (paymentType) params.append('paymentType', paymentType)
  if (orderId) params.append('orderId', orderId.toString())
  params.append('page', page.toString())
  params.append('size', size.toString())

  const query = params.toString() ? `?${params.toString()}` : ''
  return client.get<Order[]>(`/api/orders${query}`).then(r => r.data)
}

export const getOrder = (id: number) =>
  client.get<Order>(`/api/orders/${id}`).then(r => r.data)

export const createOrder = (data: CreateOrderRequest) =>
  client.post<Order>('/api/orders', data).then(r => r.data)

export const updateOrderStatus = (id: number, data: UpdateStatusRequest) =>
  client.patch<Order>(`/api/orders/${id}/status`, data).then(r => r.data)

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

export const setOrderItemPrice = (orderId: number, itemId: number, data: { price: number }) =>
  client.patch<OrderItem>(`/api/orders/${orderId}/items/${itemId}/price`, data).then(r => r.data)

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
  legacy_id?: number | null
  pickup_date?: string | null
  pickup_time_slot?: string | null
  delivery_date?: string | null
  delivery_time_slot?: string | null
  pickup_district?: string | null
  delivery_district?: string | null
}) =>
  client.patch<Order>(`/api/orders/${id}/details`, data).then(r => r.data)

export const updateActualDates = (id: number, data: {
  actual_pickup_date?: string | null
  actual_pickup_time_slot?: string | null
  actual_delivery_date?: string | null
  actual_delivery_time_slot?: string | null
}) =>
  client.patch<Order>(`/api/orders/${id}/actual-dates`, data).then(r => r.data)

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
export const getEmployeeEarnings = (employeeId: number, status?: string, dateFrom?: string, dateTo?: string) => {
  const params = new URLSearchParams()
  if (status) params.append('status', status)
  if (dateFrom) params.append('dateFrom', dateFrom)
  if (dateTo) params.append('dateTo', dateTo)
  
  const query = params.toString() ? `?${params.toString()}` : ''
  return client.get<number>(`/api/employees/${employeeId}/earnings${query}`).then(r => r.data)
}