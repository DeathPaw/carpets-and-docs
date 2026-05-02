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
  client.get<{name: string, client_type: string, orders_count: number, total_spent: number}[]>('/api/analytics/top-clients').then(r => r.data)

export const getDashboard = () =>
  client.get<Record<string, number>>('/api/analytics/dashboard').then(r => r.data)

export const getProductionQueue = () =>
  client.get<{order_id: number, client_name: string, status: string, created_at: string, total_amount: number, pickup_district: string, items_count: number, services_count: number, services_done: number}[]>('/api/analytics/production-queue').then(r => r.data)

export const getWarrantyStats = () =>
  client.get<{client_name: string, total_orders: number, warranty_orders: number, warranty_percent: number}[]>('/api/analytics/warranty-stats').then(r => r.data)

export const getMarginAnalysis = () =>
  client.get<{service_name: string, count: number, revenue: number, cost: number}[]>('/api/analytics/margin').then(r => r.data)
