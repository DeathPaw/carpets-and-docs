import client from './client'

/**
 * Контракты юрлиц (ТЗ v2, блок 6).
 *
 * Договор фиксирует цену за м² и плановый объём. Факт растёт только по сдаче:
 * выстиранный, но не отданный ковёр в план-факт не идёт.
 */
export type ContractKind = 'COMMERCIAL' | 'GOVERNMENT'

export const CONTRACT_KIND_LABELS: Record<ContractKind, string> = {
  COMMERCIAL: 'Коммерческий',
  GOVERNMENT: 'Государственный',
}

export interface Contract {
  id: number
  client_id: number
  client_name: string
  client_inn: string | null
  number: string
  kind: ContractKind
  signed_on: string
  expires_on: string | null
  planned_sqm: number | null
  price_per_sqm: number
  comment: string | null
  is_active: boolean
  files_count?: number
  files?: ContractFile[]
  plan_fact?: PlanFact
}

export interface ContractFile {
  id: number
  filename: string
  content_type: string | null
  created_at: string
}

export interface ContractWork {
  kind: 'ORDER' | 'ONSITE'
  id: number
  client_name: string
  work_date: string
  /** Учтён ли в факте: заказ сдан / выезд выполнен. */
  counted: boolean
  sqm: number
}

export interface ContractDelivery {
  id: number
  order_id: number | null
  cleaning_id: number | null
  sqm: number
  action: 'DELIVERED' | 'CANCELLED'
  reason: string | null
  created_by: string | null
  created_at: string
}

export interface PlanFact {
  planned_sqm: number
  fact_sqm: number
  remaining_sqm: number
  over_sqm: number
  completion_percent: number | null
  planned_amount: number
  fact_amount: number
  works: ContractWork[]
  deliveries: ContractDelivery[]
}

export const contractsApi = {
  list: (params?: { clientId?: number; activeOnly?: boolean }) =>
    client.get<Contract[]>('/api/contracts', { params }).then(r => r.data),

  get: (id: number) => client.get<Contract>(`/api/contracts/${id}`).then(r => r.data),

  create: (body: Partial<Contract>) =>
    client.post<Contract>('/api/contracts', body).then(r => r.data),

  update: (id: number, body: Partial<Contract>) =>
    client.put<Contract>(`/api/contracts/${id}`, body).then(r => r.data),

  remove: (id: number) => client.delete(`/api/contracts/${id}`).then(r => r.data),

  planFact: (id: number) => client.get<PlanFact>(`/api/contracts/${id}/plan-fact`).then(r => r.data),

  linkOrder: (id: number, orderId: number) =>
    client.post<{ ok: boolean; price_per_sqm: number; warning?: string }>(
      `/api/contracts/${id}/orders/${orderId}`).then(r => r.data),

  unlinkOrder: (orderId: number) =>
    client.delete(`/api/contracts/orders/${orderId}`).then(r => r.data),

  /** Отметить сдачу заказа по контракту или отменить ошибочную отметку. */
  deliverOrder: (id: number, orderId: number, delivered: boolean, reason?: string) =>
    client.post<PlanFact>(`/api/contracts/${id}/orders/${orderId}/deliver`,
      { delivered, reason }).then(r => r.data),

  addFile: (id: number, file: { filename: string; content_type: string; data: string }) =>
    client.post<{ id: number }>(`/api/contracts/${id}/files`, file).then(r => r.data),

  deleteFile: (id: number, fileId: number) =>
    client.delete(`/api/contracts/${id}/files/${fileId}`).then(r => r.data),

  fileUrl: (id: number, fileId: number) => `/api/contracts/${id}/files/${fileId}`,
}

export default contractsApi
