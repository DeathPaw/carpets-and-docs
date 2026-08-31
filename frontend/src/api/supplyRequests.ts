import client from './client'

/**
 * Статусы заявки: рабочий путь NEW → ORDERED → RECEIVED, отмена — с любого шага.
 * Ровно четыре значения, по одному на столбец доски (V36): промежуточная
 * «Согласована» не различалась оператором и была убрана.
 */
export type SupplyStatus = 'NEW' | 'ORDERED' | 'RECEIVED' | 'CANCELLED'

/** V33: заявка на закупку расходных материалов. */
export interface SupplyRequest {
  id: number
  title: string
  quantity: number | null
  unit: string | null
  /** К какой дате нужно (YYYY-MM-DD). null — без срока. */
  needed_by: string | null
  comment: string | null
  status: SupplyStatus
  created_by_employee_id: number | null
  created_by_name: string | null
  /** День закупки — в его месяц ложится расход. */
  received_on: string | null
  actual_quantity: number | null
  actual_amount: number | null
  /** Ожидаемая цена — план, вносится на любом этапе. В расходы не идёт. */
  expected_amount: number | null
  cancel_reason: string | null
  created_at: string
  updated_at: string
}

export const SUPPLY_STATUS_LABELS: Record<SupplyStatus, string> = {
  NEW: 'Создана',
  ORDERED: 'В работе',
  RECEIVED: 'Готова',
  CANCELLED: 'Отменена',
}

/** Цвета статусов — те же роли, что у бейджей заказов. */
export const SUPPLY_STATUS_COLORS: Record<SupplyStatus, { bg: string; fg: string }> = {
  NEW: { bg: '#eaf4fd', fg: '#1b4f72' },
  ORDERED: { bg: '#fef5e7', fg: '#7d6608' },
  RECEIVED: { bg: '#e8f8f5', fg: '#0e6251' },
  CANCELLED: { bg: '#fdedec', fg: '#922b21' },
}

export interface SupplyRequestInput {
  title: string
  quantity?: number | null
  unit?: string | null
  needed_by?: string | null
  comment?: string | null
  expected_amount?: number | null
  created_by_employee_id?: number | null
  created_by_name?: string | null
  /**
   * Данные закупки — только для уже полученной заявки: оператор мог ошибиться
   * при вводе. Смена даты переносит расход в другой месяц, бэк пересчитывает оба.
   */
  received_on?: string | null
  actual_quantity?: number | null
  actual_amount?: number | null
}

export const getSupplyRequests = (opts?: { openOnly?: boolean }) => {
  const sp = new URLSearchParams()
  if (opts?.openOnly) sp.append('openOnly', 'true')
  return client.get<SupplyRequest[]>(`/api/supply-requests?${sp.toString()}`).then(r => r.data)
}

/** Открытые заявки со сроком в ближайшие `days` дней — блок на Главной. */
export const getUpcomingSupplyRequests = (days = 7) =>
  client.get<SupplyRequest[]>(`/api/supply-requests/upcoming?days=${days}`).then(r => r.data)

export const createSupplyRequest = (data: SupplyRequestInput) =>
  client.post<SupplyRequest>('/api/supply-requests', data).then(r => r.data)

export const updateSupplyRequest = (id: number, data: SupplyRequestInput) =>
  client.put<SupplyRequest>(`/api/supply-requests/${id}`, data).then(r => r.data)

/**
 * Смена статуса. Для CANCELLED обязателен cancel_reason (≥10 символов),
 * для RECEIVED — received_on и actual_amount.
 */
export const changeSupplyStatus = (id: number, data: {
  status: SupplyStatus
  cancel_reason?: string
  received_on?: string
  actual_quantity?: number | null
  actual_amount?: number | null
}) => client.patch<SupplyRequest>(`/api/supply-requests/${id}/status`, data).then(r => r.data)

export const deleteSupplyRequest = (id: number) =>
  client.delete(`/api/supply-requests/${id}`)
