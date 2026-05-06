import client from './client'
import type { District, CreateDistrictRequest } from '../types'

export const getDistricts = (activeOnly = false) =>
  client.get<District[]>('/api/districts', { params: { active_only: activeOnly } }).then(r => r.data)

export const createDistrict = (data: CreateDistrictRequest) =>
  client.post<District>('/api/districts', data).then(r => r.data)

export const updateDistrict = (id: number, data: CreateDistrictRequest) =>
  client.put<District>(`/api/districts/${id}`, data).then(r => r.data)

export const deleteDistrict = (id: number) =>
  client.delete(`/api/districts/${id}`)
