import client from './client'

export const getOrdersByDistrict = () =>
  client.get<{district: string, count: number, total: number}[]>('/api/analytics/orders-by-district').then(r => r.data)

export const getOrdersByStatus = () =>
  client.get<{status: string, count: number}[]>('/api/analytics/orders-by-status').then(r => r.data)

export const getItemsByType = () =>
  client.get<{type_name: string, count: number}[]>('/api/analytics/items-by-type').then(r => r.data)

export const getEmployeeStats = () =>
  client.get<{name: string, services_done: number, total_earned: number}[]>('/api/analytics/employee-stats').then(r => r.data)

export const getRevenueByMonth = () =>
  client.get<{month: string, orders_count: number, revenue: number}[]>('/api/analytics/revenue-by-month').then(r => r.data)

export const getTopClients = () =>
  client.get<{client_id: number, name: string, client_type: string, orders_count: number, total_spent: number}[]>('/api/analytics/top-clients').then(r => r.data)

export const getDashboard = () =>
  client.get<Record<string, number>>('/api/analytics/dashboard').then(r => r.data)

export const getProductionQueue = () =>
  client.get<{order_id: number, client_name: string, status: string, created_at: string, total_amount: number, pickup_district: string, items_count: number, services_count: number, services_done: number}[]>('/api/analytics/production-queue').then(r => r.data)

export interface ProductionQueueItem {
  item_id: number
  order_id: number
  status: string
  description: string | null
  length: number | null
  width: number | null
  weight: number | null
  area: number | null
  item_type_name: string | null
  client_name: string
  order_created_at: string
  pickup_district: string | null
  services_count: number
  services_done: number
}

export const getProductionQueueItems = () =>
  client.get<ProductionQueueItem[]>('/api/analytics/production-queue-items').then(r => r.data)

export interface ProductionQueueService {
  service_id: number
  status: string                // CREATED / IN_PROGRESS / DONE
  price: number
  service_name: string
  pricing_type: string | null   // FIXED / BY_WEIGHT / BY_AREA / BY_PERIMETER
  item_id: number
  item_description: string | null
  item_status: string
  item_type_id: number
  item_type_name: string | null
  order_id: number
  client_name: string
  order_created_at: string
  pickup_district: string | null
  position_in_order: number
  employee_names: string         // "Иванов, Петров" или ''
  employee_ids: number[]
}

export const getProductionQueueServices = () =>
  client.get<ProductionQueueService[]>('/api/analytics/production-queue-services').then(r => r.data)

export const getWarrantyStats = () =>
  client.get<{client_id: number, client_name: string, total_orders: number, warranty_orders: number, warranty_percent: number}[]>('/api/analytics/warranty-stats').then(r => r.data)

export const getMarginAnalysis = () =>
  client.get<{service_name: string, count: number, revenue: number, cost: number}[]>('/api/analytics/margin').then(r => r.data)

// ─────────── Доходность ───────────
export interface ProfitRow { revenue: number; cost: number; profit: number }
export interface ProfitByItemType extends ProfitRow { id: number; name: string; items_count: number }
export interface ProfitByClient extends ProfitRow { client_id: number; name: string; client_type: string; orders_count: number }
export interface ProfitByEmployee { employee_id: number; name: string; services_count: number; revenue: number; cost: number }
export interface ProfitByEmployeeService { service_id: number; service_name: string; count: number; revenue: number }
export interface ProfitByDistrict extends ProfitRow { district: string; orders_count: number }
export interface ProfitByOrder extends ProfitRow { id: number; client_name: string; status: string; created_at: string }

const dateQuery = (df?: string, dt?: string) => {
  const p = new URLSearchParams()
  if (df) p.append('dateFrom', df)
  if (dt) p.append('dateTo', dt)
  return p.toString() ? `?${p.toString()}` : ''
}

export const getProfitByItemType = (df?: string, dt?: string) =>
  client.get<ProfitByItemType[]>(`/api/analytics/profit/by-item-type${dateQuery(df, dt)}`).then(r => r.data)

export const getProfitByClient = (df?: string, dt?: string) =>
  client.get<ProfitByClient[]>(`/api/analytics/profit/by-client${dateQuery(df, dt)}`).then(r => r.data)

export const getProfitByEmployee = (df?: string, dt?: string) =>
  client.get<ProfitByEmployee[]>(`/api/analytics/profit/by-employee${dateQuery(df, dt)}`).then(r => r.data)

export const getProfitByEmployeeServices = (employeeId: number, df?: string, dt?: string) =>
  client.get<ProfitByEmployeeService[]>(`/api/analytics/profit/by-employee/${employeeId}/services${dateQuery(df, dt)}`).then(r => r.data)

export const getProfitByDistrict = (df?: string, dt?: string) =>
  client.get<ProfitByDistrict[]>(`/api/analytics/profit/by-district${dateQuery(df, dt)}`).then(r => r.data)

export const getProfitByOrder = (df?: string, dt?: string, clientId?: number) => {
  const p = new URLSearchParams()
  if (df) p.append('dateFrom', df)
  if (dt) p.append('dateTo', dt)
  if (clientId) p.append('clientId', String(clientId))
  return client.get<ProfitByOrder[]>(`/api/analytics/profit/by-order${p.toString() ? '?' + p.toString() : ''}`).then(r => r.data)
}
