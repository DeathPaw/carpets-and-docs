import client from './client'

export interface AppUserPublic {
  id: number
  username: string
  display_name: string
  role: string
  employee_id: number
  is_active: boolean
}

export const getUsers = () =>
  client.get<AppUserPublic[]>('/api/users').then(r => r.data)

export const createUser = (data: {
  username: string
  password: string
  display_name: string
  role: string
  employee_id?: number | null
}) => client.post<AppUserPublic>('/api/users', data).then(r => r.data)

export const updateUser = (id: number, data: {
  display_name: string
  role: string
  employee_id?: number | null
  is_active?: boolean
}) => client.put<AppUserPublic>(`/api/users/${id}`, data).then(r => r.data)

export const changeUserPassword = (id: number, password: string) =>
  client.patch(`/api/users/${id}/password`, { password })
