import client from './client'
import type { OrderItemService } from '../types'

export async function getEmployeeServices(
  employeeId: number,
  status?: string,
  dateFrom?: string,
  dateTo?: string,
): Promise<OrderItemService[]> {
  const params: Record<string, string> = {}
  if (status) params.status = status
  if (dateFrom) params.dateFrom = dateFrom
  if (dateTo) params.dateTo = dateTo

  const response = await client.get<OrderItemService[]>(`/api/employees/${employeeId}/services`, { params })
  return response.data
}
