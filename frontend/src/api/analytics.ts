import client from './client'

// V8 аналитика: переключатель периода. Все endpoint'ы умеют dateFrom/dateTo (YYYY-MM-DD).
export interface AnalyticsPeriod { dateFrom?: string; dateTo?: string }
const periodParams = (p?: AnalyticsPeriod) => {
  const params: Record<string, string> = {}
  if (p?.dateFrom) params.dateFrom = p.dateFrom
  if (p?.dateTo) params.dateTo = p.dateTo
  return { params }
}

export const getOrdersByDistrict = (p?: AnalyticsPeriod) =>
  client.get<{district: string, count: number, total: number}[]>('/api/analytics/orders-by-district', periodParams(p)).then(r => r.data)

export const getOrdersByStatus = (p?: AnalyticsPeriod) =>
  client.get<{status: string, count: number}[]>('/api/analytics/orders-by-status', periodParams(p)).then(r => r.data)

export const getItemsByType = (p?: AnalyticsPeriod) =>
  client.get<{type_name: string, count: number}[]>('/api/analytics/items-by-type', periodParams(p)).then(r => r.data)

export const getEmployeeStats = (p?: AnalyticsPeriod) =>
  client.get<{employee_id: number, name: string, services_done: number, total_earned: number}[]>('/api/analytics/employee-stats', periodParams(p)).then(r => r.data)

export const getRevenueByMonth = (p?: AnalyticsPeriod) =>
  client.get<{month: string, orders_count: number, revenue: number}[]>('/api/analytics/revenue-by-month', periodParams(p)).then(r => r.data)

export const getTopClients = (p?: AnalyticsPeriod) =>
  client.get<{client_id: number, name: string, client_type: string, orders_count: number, total_spent: number}[]>('/api/analytics/top-clients', periodParams(p)).then(r => r.data)

export const getDashboard = () =>
  client.get<Record<string, number>>('/api/analytics/dashboard').then(r => r.data)

/**
 * Карточки проблемных заказов для главной (Спринт B). Возвращает три категории
 * по топ-N заказов в каждой. На фронте отображаются вместо «голых счётчиков».
 */
export interface ProblemOrderCard {
  id: number
  client_name: string
  status: string
  problem_reason: string
  problem_date: string | null
  address: string | null
}
export interface ProblemOrdersResponse {
  overdue_actual: ProblemOrderCard[]
  unassigned_logistics: ProblemOrderCard[]
  bad_address: ProblemOrderCard[]
  /** Спринт V9: позиции с delivery_state=LOST в незакрытых заказах. */
  lost_in_delivery: ProblemOrderCard[]
}

export const getProblemOrders = () =>
  client.get<ProblemOrdersResponse>('/api/analytics/dashboard/problems').then(r => r.data)

export const getProductionQueue = () =>
  client.get<{order_id: number, client_name: string, status: string, created_at: string, total_amount: number, pickup_district: string, items_count: number, services_count: number, services_done: number, client_phone?: string | null, legacy_id?: number | null}[]>('/api/analytics/production-queue').then(r => r.data)

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
  client_phone?: string | null
  legacy_id?: number | null
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
  client_phone?: string | null
  legacy_id?: number | null
}

export const getProductionQueueServices = () =>
  client.get<ProductionQueueService[]>('/api/analytics/production-queue-services').then(r => r.data)

export const getWarrantyStats = (p?: AnalyticsPeriod) =>
  client.get<{client_id: number, client_name: string, total_orders: number, warranty_orders: number, warranty_percent: number}[]>('/api/analytics/warranty-stats', periodParams(p)).then(r => r.data)

export const getMarginAnalysis = (p?: AnalyticsPeriod) =>
  client.get<{service_name: string, count: number, revenue: number, cost: number}[]>('/api/analytics/margin', periodParams(p)).then(r => r.data)

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
