import client from './client'
import type { OrderItemService } from '../types'

export async function getEmployeeServices(employeeId: number, status?: string): Promise<OrderItemService[]> {
  const params: Record<string, string> = {}
  if (status) params.status = status

  const response = await client.get<OrderItemService[]>(`/api/employees/${employeeId}/services`, { params })
  return response.data
}
