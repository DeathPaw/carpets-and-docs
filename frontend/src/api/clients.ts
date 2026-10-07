import apiClient from './client'
import { Client, CreateClientRequest } from '../types'

export const getClients = () =>
  apiClient.get<Client[]>('/api/clients').then(r => r.data)

export const getClient = (id: number) =>
  apiClient.get<Client>(`/api/clients/${id}`).then(r => r.data)

export const createClient = (data: CreateClientRequest) =>
  apiClient.post<Client>('/api/clients', data).then(r => r.data)

export const updateClient = (id: number, data: CreateClientRequest) =>
  apiClient.put<Client>(`/api/clients/${id}`, data).then(r => r.data)

/**
 * V47 (правки №1 и №2 от 13.09): портрет клиентской базы.
 *
 * Бэкенд отдаёт готовые строки с агрегатами по заказам и скидками — те же,
 * что уходят в Excel. Фильтры общие, чтобы выгружался ровно отобранный сегмент.
 */
export interface ClientAnalyticsFilters {
  search?: string
  districts?: string[]
  source?: string
  restartStatus?: string
  gender?: string
  clientType?: string
  onlyRegular?: boolean
  withDiscount?: boolean
  minOrders?: number
  sortBy?: string
  sortDir?: 'asc' | 'desc'
  limit?: number
}

export interface ClientAnalyticsRow {
  id: number
  client_type: string
  name: string
  first_name: string | null
  last_name: string | null
  phone: string | null
  extra_phone: string | null
  address: string | null
  apartment: string | null
  district: string | null
  comment: string | null
  is_pensioner: boolean
  is_regular: boolean
  is_problem: boolean
  gender: string | null
  age: number | null
  restart_status: string | null
  source: string | null
  source_note: string | null
  created_at: string
  orders_count: number
  total_spent: number
  first_order: string | null
  last_order: string | null
  discounts: string | null
  discount_percent: number
}

export interface ClientAnalyticsResponse {
  summary: {
    clients: number
    regular: number
    with_discount: number
    orders: number
    revenue: number
    avg_order: number
  }
  rows: ClientAnalyticsRow[]
}

export const getClientAnalytics = (f: ClientAnalyticsFilters = {}) => {
  const params = new URLSearchParams()
  if (f.search) params.append('search', f.search)
  if (f.districts) f.districts.forEach(d => params.append('districts', d))
  if (f.source) params.append('source', f.source)
  if (f.restartStatus) params.append('restartStatus', f.restartStatus)
  if (f.gender) params.append('gender', f.gender)
  if (f.clientType) params.append('clientType', f.clientType)
  if (f.onlyRegular) params.append('onlyRegular', 'true')
  if (f.withDiscount) params.append('withDiscount', 'true')
  if (f.minOrders) params.append('minOrders', String(f.minOrders))
  if (f.sortBy) params.append('sortBy', f.sortBy)
  if (f.sortDir) params.append('sortDir', f.sortDir)
  if (f.limit) params.append('limit', String(f.limit))
  return apiClient.get<ClientAnalyticsResponse>(`/api/clients/analytics?${params.toString()}`).then(r => r.data)
}

export const getClientOrders = (id: number) =>
  apiClient.get<import('../types').Order[]>(`/api/clients/${id}/orders`).then(r => r.data)

export const searchClients = (q: string) =>
  apiClient.get<Client[]>(`/api/clients/search`, { params: { q } }).then(r => r.data)

export const getClientModifiers = (id: number) =>
  apiClient.get<import('../types').PriceModifier[]>(`/api/clients/${id}/modifiers`).then(r => r.data)

export const addClientModifier = (clientId: number, modifierId: number) =>
  apiClient.post(`/api/clients/${clientId}/modifiers`, { modifier_id: modifierId })

export const removeClientModifier = (clientId: number, modifierId: number) =>
  apiClient.delete(`/api/clients/${clientId}/modifiers/${modifierId}`)

export const getClientEvents = (clientId: number) =>
  apiClient.get<{id: number, client_id: number, event_type: string, description: string, created_at: string}[]>(`/api/clients/${clientId}/events`).then(r => r.data)

export const addClientEvent = (clientId: number, eventType: string, description: string) =>
  apiClient.post(`/api/clients/${clientId}/events`, { event_type: eventType, description })
