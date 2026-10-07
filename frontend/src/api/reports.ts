import client from './client'

/**
 * Отчёты по работам, затратам и ФОТ (ТЗ v2, блок 7).
 *
 * Показатели и строки приходят одним ответом: любая сумма раскрывается в те же
 * записи, из которых она посчитана.
 */
export type DateBasis = 'CREATED' | 'COMPLETED'

export interface ReportFilters {
  from?: string
  to?: string
  /** Основание периода. В одном показателе основания не смешиваются. */
  dateBasis: DateBasis
  workKind?: '' | 'ORDER' | 'ONSITE'
  handover?: '' | 'DELIVERY' | 'SELF_PICKUP' | 'ONSITE'
  clientKind?: '' | 'INDIVIDUAL' | 'LEGAL_ENTITY'
  clientId?: number | null
  contractMode?: '' | 'WITH' | 'WITHOUT'
  contractKind?: '' | 'COMMERCIAL' | 'GOVERNMENT'
  contractId?: number | null
  statuses?: string[]
}

export interface ReportWorkRow {
  kind: 'ORDER' | 'ONSITE'
  id: number
  client_id: number | null
  client_name: string
  client_kind: 'INDIVIDUAL' | 'LEGAL_ENTITY'
  created_on: string
  completed_on?: string
  status: string
  handover: 'DELIVERY' | 'SELF_PICKUP' | 'ONSITE'
  area: number
  amount: number
  contract_id?: number
  contract_number?: string
  contract_kind?: 'COMMERCIAL' | 'GOVERNMENT'
  counted_in_contract?: boolean
}

export interface ReportCostRow {
  id: number
  kind: string
  entry_date: string
  title: string
  amount: number
  allocation: string
  alloc_order_id?: number
  counterparty?: string
  category_name?: string
}

export interface ReportPayrollRow {
  id: number
  year_month: string
  entry_date?: string
  kind: string
  source_type?: string
  source_id?: number
  amount: number
  details?: string
  employee_name: string
}

export interface ReportSummary {
  works_count: number
  orders_count: number
  onsite_count: number
  area_sqm: number
  work_amount: number
  costs_total: number
  direct_costs: number
  payroll_total: number
  cost_per_sqm: number | null
}

export interface ReportResponse {
  summary: ReportSummary
  rows: ReportWorkRow[]
  costs: ReportCostRow[]
  payroll: ReportPayrollRow[]
}

export interface ContractClientRow {
  id: number
  name: string
  inn: string | null
  address: string | null
  phone: string | null
  email: string | null
  contact_person: string | null
  contact_person_phone: string | null
  contracts_count: number
  planned_sqm: number
}

export interface ContractReportRow {
  id: number
  number: string
  kind: 'COMMERCIAL' | 'GOVERNMENT'
  client_name: string
  client_inn: string | null
  signed_on: string
  expires_on: string | null
  planned_sqm: number | null
  price_per_sqm: number
  is_active: boolean
  fact_sqm: number
  remaining_sqm: number
  over_sqm: number
  completion_percent: number | null
  planned_amount: number
  fact_amount: number
}

export const reportsApi = {
  works: (f: ReportFilters) => {
    const params: Record<string, unknown> = { dateBasis: f.dateBasis }
    if (f.from) params.from = f.from
    if (f.to) params.to = f.to
    if (f.workKind) params.workKind = f.workKind
    if (f.handover) params.handover = f.handover
    if (f.clientKind) params.clientKind = f.clientKind
    if (f.clientId) params.clientId = f.clientId
    if (f.contractMode) params.contractMode = f.contractMode
    if (f.contractKind) params.contractKind = f.contractKind
    if (f.contractId) params.contractId = f.contractId
    if (f.statuses?.length) params.statuses = f.statuses
    return client.get<ReportResponse>('/api/reports/works', {
      params,
      paramsSerializer: { indexes: null },
    }).then(r => r.data)
  },

  contractClients: () =>
    client.get<ContractClientRow[]>('/api/reports/contract-clients').then(r => r.data),

  contracts: () =>
    client.get<ContractReportRow[]>('/api/reports/contracts').then(r => r.data),
}

export default reportsApi
