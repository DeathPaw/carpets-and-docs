import client from './client'

/**
 * ФОТ (ТЗ v2, блоки 3 и 4): схемы оплаты, табель, точки, ведомость.
 *
 * Автоматика считает начисления из фактов — завершённых ковров, назначенных
 * точек и смен. Оператор правит руками, и его правки переживают пересчёт:
 * рядом с исправленной суммой хранится пересчитанное автоматическое значение.
 */
export type PaySchemeKind = 'PIECEWORK' | 'SALARY' | 'DRIVER_POINTS' | 'DRIVER_SHIFT'

export const PAY_SCHEME_LABELS: Record<PaySchemeKind, string> = {
  PIECEWORK: 'Сделка за метры',
  SALARY: 'Оклад',
  DRIVER_POINTS: 'Водитель: за точки',
  DRIVER_SHIFT: 'Водитель: смена + доплата',
}

export interface PayScheme {
  id: number
  employee_id: number
  employee_name: string | null
  scheme: PaySchemeKind
  valid_from: string
  valid_to: string | null
  rate_per_sqm: number | null
  salary: number | null
  point_rate: number | null
  shift_hours: number | null
  shift_fix: number | null
  points_included: number | null
  extra_point_rate: number | null
  comment: string | null
}

export interface SheetRow {
  employee_id: number
  employee_name: string
  scheme: PaySchemeKind | null
  norm_days: number | null
  shifts: number
  points: number
  meters: number
  auto_amount: number
  corrections: number
  before_rounding: number
  rounded: number
  rounding_diff: number
}

export interface PayrollSheet {
  year_month: string
  norm_days: number | null
  closed: boolean
  rows: SheetRow[]
  total_payroll: number
  rounding_diff: number
}

export interface PayrollEntry {
  id: number
  employee_id: number
  employee_name: string
  year_month: string
  entry_date: string
  kind: string
  source_type: string
  source_id: number | null
  amount: number
  auto_amount: number | null
  details: string | null
  corrected_by: string | null
  corrected_at: string | null
  correction_reason: string | null
}

export interface WorkShift {
  id: number
  employee_id: number
  employee_name: string
  shift_date: string
  source: 'AUTO' | 'MANUAL'
  reason: string | null
}

export interface DriverPoint {
  id: number
  employee_id: number
  employee_name: string
  point_date: string
  order_id: number | null
  leg: 'PICKUP' | 'DELIVERY'
}

export const getPaySchemes = (employeeId?: number) =>
  client.get<PayScheme[]>('/api/payroll/schemes', { params: employeeId ? { employeeId } : {} })
    .then(r => r.data)

export const createPayScheme = (data: Record<string, unknown>) =>
  client.post<PayScheme>('/api/payroll/schemes', data).then(r => r.data)

export const deletePayScheme = (id: number) =>
  client.delete(`/api/payroll/schemes/${id}`).then(r => r.data)

export const getPayrollSheet = (yearMonth: string) =>
  client.get<PayrollSheet>('/api/payroll/sheet', { params: { yearMonth } }).then(r => r.data)

export const getPayrollEntries = (yearMonth: string, employeeId?: number) =>
  client.get<PayrollEntry[]>('/api/payroll/entries', {
    params: employeeId ? { yearMonth, employeeId } : { yearMonth },
  }).then(r => r.data)

export const recalculatePayroll = (yearMonth: string) =>
  client.post<{ items: number; warnings: string[] }>('/api/payroll/recalculate', null, { params: { yearMonth } })
    .then(r => r.data)

export const setPayrollMonth = (yearMonth: string, normDays: number | null) =>
  client.put('/api/payroll/month', { year_month: yearMonth, norm_days: normDays }).then(r => r.data)

export const closePayrollMonth = (yearMonth: string) =>
  client.post('/api/payroll/month/close', null, { params: { yearMonth } }).then(r => r.data)

export const openPayrollMonth = (yearMonth: string) =>
  client.post('/api/payroll/month/open', null, { params: { yearMonth } }).then(r => r.data)

export const getShifts = (yearMonth: string, employeeId?: number) =>
  client.get<WorkShift[]>('/api/payroll/shifts', {
    params: employeeId ? { yearMonth, employeeId } : { yearMonth },
  }).then(r => r.data)

export const addShift = (employeeId: number, shiftDate: string, reason: string) =>
  client.post('/api/payroll/shifts', { employee_id: employeeId, shift_date: shiftDate, reason }).then(r => r.data)

export const deleteShift = (id: number) =>
  client.delete(`/api/payroll/shifts/${id}`).then(r => r.data)

export const getDriverPoints = (yearMonth: string) =>
  client.get<DriverPoint[]>('/api/payroll/points', { params: { yearMonth } }).then(r => r.data)

export const addPayrollEntry = (data: {
  employee_id: number; year_month: string; entry_date: string; amount: number; details: string
}) => client.post<{ id: number }>('/api/payroll/entries', data).then(r => r.data)

/** Ручная правка суммы: причина обязательна, авто-значение сохраняется для сравнения. */
export const correctPayrollEntry = (id: number, amount: number, reason: string) =>
  client.patch(`/api/payroll/entries/${id}`, { amount, reason }).then(r => r.data)

export const resetPayrollEntry = (id: number) =>
  client.post(`/api/payroll/entries/${id}/reset`).then(r => r.data)

export const deletePayrollEntry = (id: number) =>
  client.delete(`/api/payroll/entries/${id}`).then(r => r.data)

/** Правило распределения долей за ковёр на месяц. */
export const getShareRule = (yearMonth: string) =>
  client.get<{ year_month: string; mode: 'EQUAL' | 'PERCENT'; members: { employee_id: number; employee_name: string; percent: number }[] }>(
    '/api/payroll/share-rule', { params: { yearMonth } }).then(r => r.data)

export const saveShareRule = (data: {
  year_month: string; mode: 'EQUAL' | 'PERCENT'; members: { employee_id: number; percent: number }[]
}) => client.put('/api/payroll/share-rule', data).then(r => r.data)
