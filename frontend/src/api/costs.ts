import client from './client'

/**
 * Реестры затрат и себестоимость на метр (ТЗ v2, блок 2).
 *
 * Два реестра — материальные закупки (`MATERIAL`) и прочие затраты (`OTHER`) —
 * это одна сущность с разным смыслом: у закупки есть количество и единица.
 * Способ учёта в себестоимости выбирается отдельно у каждой записи.
 */
export type CostKind = 'MATERIAL' | 'OTHER'
export type CostAllocation = 'MONTH' | 'PERIOD' | 'ORDER'

export interface CostEntry {
  id: number
  kind: CostKind
  entry_date: string
  category_id: number | null
  category_name: string | null
  title: string
  quantity: number | null
  unit: string | null
  amount: number
  counterparty: string | null
  comment: string | null
  allocation: CostAllocation
  alloc_month: string | null
  alloc_from: string | null
  alloc_to: string | null
  alloc_order_id: number | null
  created_by: string | null
  created_at: string
  updated_at: string
  files_count: number
}

export interface CostEntryFilters {
  kind?: CostKind
  from?: string
  to?: string
  categoryId?: number
  counterparty?: string
  allocation?: CostAllocation
  search?: string
}

export interface CostEntryList {
  totals: { entries: number; total: number }
  rows: CostEntry[]
}

/** Строка отчёта «сколько затрат приходится на метр» за месяц. */
export interface MonthCost {
  month: string
  meters: number
  allocated: number
  per_meter: number
  /** Часть суммы, которую не на что распределить — метров в месяце не было. */
  unallocated: number
}

export interface OrderCost {
  cost: {
    order_id: number
    direct: number
    allocated: number
    total: number
    detail: { month: string; meters: number; per_meter: number; amount: number }[]
  }
  direct_entries: CostEntry[]
}

export const getCostEntries = (f: CostEntryFilters = {}) => {
  const params = new URLSearchParams()
  if (f.kind) params.append('kind', f.kind)
  if (f.from) params.append('from', f.from)
  if (f.to) params.append('to', f.to)
  if (f.categoryId) params.append('categoryId', String(f.categoryId))
  if (f.counterparty) params.append('counterparty', f.counterparty)
  if (f.allocation) params.append('allocation', f.allocation)
  if (f.search) params.append('search', f.search)
  return client.get<CostEntryList>(`/api/cost-entries?${params.toString()}`).then(r => r.data)
}

export interface CostEntryPayload {
  kind: CostKind
  entry_date: string
  category_id?: number | null
  title: string
  quantity?: number | null
  unit?: string | null
  amount: number
  counterparty?: string | null
  comment?: string | null
  allocation: CostAllocation
  alloc_month?: string | null
  alloc_from?: string | null
  alloc_to?: string | null
  alloc_order_id?: number | null
}

export const createCostEntry = (data: CostEntryPayload) =>
  client.post<CostEntry>('/api/cost-entries', data).then(r => r.data)

export const updateCostEntry = (id: number, data: CostEntryPayload) =>
  client.put<CostEntry>(`/api/cost-entries/${id}`, data).then(r => r.data)

/** Кнопка «Учёт в себестоимости» в строке реестра. */
export const setCostAllocation = (id: number, data: {
  allocation: CostAllocation
  alloc_month?: string | null
  alloc_from?: string | null
  alloc_to?: string | null
  alloc_order_id?: number | null
}) => client.patch<CostEntry>(`/api/cost-entries/${id}/allocation`, data).then(r => r.data)

export const deleteCostEntry = (id: number) =>
  client.delete(`/api/cost-entries/${id}`).then(r => r.data)

/** Вложения к затрате: счета, акты, фото чека. Мета без самих файлов. */
export interface CostEntryFile {
  id: number
  filename: string | null
  content_type: string | null
  created_at: string
}

export const getCostEntryFiles = (id: number) =>
  client.get<CostEntryFile[]>(`/api/cost-entries/${id}/files`).then(r => r.data)

export const addCostEntryFile = (id: number, data: {
  filename: string; content_type: string; data: string
}) => client.post<{ id: number }>(`/api/cost-entries/${id}/files`, data).then(r => r.data)

export const deleteCostEntryFile = (id: number, fileId: number) =>
  client.delete(`/api/cost-entries/${id}/files/${fileId}`).then(r => r.data)

/** Ссылка на сам файл — открывается в новой вкладке, как обычный документ. */
export const costEntryFileUrl = (id: number, fileId: number) =>
  `/api/cost-entries/${id}/files/${fileId}`

export const getCostPerMeter = () =>
  client.get<MonthCost[]>('/api/cost-entries/cost-per-meter').then(r => r.data)

export const getOrderCost = (orderId: number) =>
  client.get<OrderCost>(`/api/cost-entries/order/${orderId}`).then(r => r.data)
