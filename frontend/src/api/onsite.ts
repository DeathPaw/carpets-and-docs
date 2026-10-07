import client from './client'

/**
 * Выездные чистки (ТЗ v2, блок 5): бригада работает у клиента, ковёр никуда
 * не везут. Метры завершённого выезда идут в себестоимость и в ФОТ так же,
 * как метры ковров из цеха.
 */
export type OnsiteStatus = 'PLANNED' | 'DONE' | 'CANCELLED'

export const ONSITE_STATUS_LABELS: Record<OnsiteStatus, string> = {
  PLANNED: 'Запланирована',
  DONE: 'Выполнена',
  CANCELLED: 'Отменена',
}

export interface OnsiteWorker {
  employee_id: number
  employee_name?: string
  percent?: number
}

export interface OnsiteCleaning {
  id: number
  client_id: number | null
  client_name: string
  address: string | null
  district: string | null
  cleaning_date: string
  area: number | null
  price: number
  status: OnsiteStatus
  comment: string | null
  completed_at: string | null
  contract_id: number | null
  contract_number: string | null
  workers?: OnsiteWorker[] | string
}

export const onsiteApi = {
  list: (params?: { from?: string; to?: string; status?: string }) =>
    client.get<OnsiteCleaning[]>('/api/onsite-cleanings', { params }).then(r => r.data),

  get: (id: number) => client.get<OnsiteCleaning>(`/api/onsite-cleanings/${id}`).then(r => r.data),

  create: (body: Partial<OnsiteCleaning> & { workers?: OnsiteWorker[] }) =>
    client.post<OnsiteCleaning>('/api/onsite-cleanings', body).then(r => r.data),

  update: (id: number, body: Partial<OnsiteCleaning> & { workers?: OnsiteWorker[] }) =>
    client.put<OnsiteCleaning>(`/api/onsite-cleanings/${id}`, body).then(r => r.data),

  setStatus: (id: number, status: OnsiteStatus) =>
    client.patch<OnsiteCleaning>(`/api/onsite-cleanings/${id}/status`, { status }).then(r => r.data),

  remove: (id: number) => client.delete(`/api/onsite-cleanings/${id}`).then(r => r.data),
}

export default onsiteApi
