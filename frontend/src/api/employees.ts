import { OrderItemService } from '../types'

const API_BASE = 'http://localhost:8080/api'

export async function getEmployeeServices(employeeId: number, status?: string): Promise<OrderItemService[]> {
  const params = new URLSearchParams()
  if (status) params.set('status', status)
  
  const response = await fetch(`${API_BASE}/employees/${employeeId}/services?${params}`)
  if (!response.ok) throw new Error('Failed to fetch employee services')
  return response.json()
}