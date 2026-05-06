import client from './client'
import type {
  ItemType,
  ServiceDefinition,
  Employee,
  EmployeeRole,
  CreateEmployeeRoleRequest,
  CreateItemTypeRequest,
  CreateServiceDefinitionRequest,
  CreateEmployeeRequest,
  UpdateEmployeeRequest,
  PriceListEntry,
} from '../types'

// Item Types
export const getItemTypes = () =>
  client.get<ItemType[]>('/api/item-types').then(r => r.data)

export const getItemType = (id: number) =>
  client.get<ItemType>(`/api/item-types/${id}`).then(r => r.data)

export const createItemType = (data: CreateItemTypeRequest) =>
  client.post<ItemType>('/api/item-types', data).then(r => r.data)

export const updateItemType = (id: number, data: CreateItemTypeRequest) =>
  client.put<ItemType>(`/api/item-types/${id}`, data).then(r => r.data)

export const deleteItemType = (id: number) =>
  client.delete(`/api/item-types/${id}`)

// Price List
export const getPriceList = (itemTypeId?: number) => {
  const params = itemTypeId ? { params: { itemTypeId } } : {}
  return client.get<PriceListEntry[]>('/api/price-list', params).then(r => r.data)
}

export const updatePriceListEntry = (id: number, price: number | null, costPrice?: number | null) =>
  client.patch<PriceListEntry>(`/api/price-list/${id}`, { price, cost_price: costPrice }).then(r => r.data)

// Service Definitions
export const getServiceDefinitions = () =>
  client.get<ServiceDefinition[]>('/api/service-definitions').then(r => r.data)

export const createServiceDefinition = (data: CreateServiceDefinitionRequest) =>
  client.post<ServiceDefinition>('/api/service-definitions', data).then(r => r.data)

export const updateServiceDefinition = (id: number, data: CreateServiceDefinitionRequest) =>
  client.put<ServiceDefinition>(`/api/service-definitions/${id}`, data).then(r => r.data)

export const deleteServiceDefinition = (id: number) =>
  client.delete(`/api/service-definitions/${id}`)

// Employees
export const getEmployees = () =>
  client.get<Employee[]>('/api/employees').then(r => r.data)

export const createEmployee = (data: CreateEmployeeRequest) =>
  client.post<Employee>('/api/employees', data).then(r => r.data)

export const updateEmployee = (id: number, data: UpdateEmployeeRequest) =>
  client.put<Employee>(`/api/employees/${id}`, data).then(r => r.data)

export const deactivateEmployee = (id: number) =>
  client.patch(`/api/employees/${id}/deactivate`)

export const activateEmployee = (id: number) =>
  client.patch(`/api/employees/${id}/activate`)

export const getEmployeesAll = (includeInactive?: boolean) =>
  client.get<Employee[]>('/api/employees', { params: includeInactive ? { includeInactive: true } : {} }).then(r => r.data)

/**
 * Сотрудники, способные работать с указанным типом позиции (по их роли).
 * Используется в форме «Назначить исполнителей»: фильтрует так,
 * чтобы оператор не мог поставить «Чистильщика ковров» на стирку тюля.
 */
export const getEmployeesSuitableFor = (itemTypeId: number) =>
  client.get<Employee[]>('/api/employees/suitable-for', { params: { itemTypeId } }).then(r => r.data)

// Employee Roles
export const getEmployeeRoles = () =>
  client.get<EmployeeRole[]>('/api/employee-roles').then(r => r.data)

export const createEmployeeRole = (data: CreateEmployeeRoleRequest) =>
  client.post<EmployeeRole>('/api/employee-roles', data).then(r => r.data)

export const updateEmployeeRole = (id: number, data: CreateEmployeeRoleRequest) =>
  client.put<EmployeeRole>(`/api/employee-roles/${id}`, data).then(r => r.data)

export const deleteEmployeeRole = (id: number) =>
  client.delete(`/api/employee-roles/${id}`)

// Price Modifiers
export const getPriceModifiers = () =>
  client.get<import('../types').PriceModifier[]>('/api/price-modifiers').then(r => r.data)

export const createPriceModifier = (data: { name: string; percent: number }) =>
  client.post<import('../types').PriceModifier>('/api/price-modifiers', data).then(r => r.data)

export const updatePriceModifier = (id: number, data: { name: string; percent: number }) =>
  client.put<import('../types').PriceModifier>(`/api/price-modifiers/${id}`, data).then(r => r.data)

export const deletePriceModifier = (id: number) =>
  client.delete(`/api/price-modifiers/${id}`)
