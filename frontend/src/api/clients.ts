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
