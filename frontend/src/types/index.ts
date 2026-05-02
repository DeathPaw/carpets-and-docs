// Enums
export type OrderStatus = 'LEAD' | 'CREATED' | 'FOR_PICKUP' | 'IN_PROGRESS' | 'PARTIALLY_DONE' | 'DONE' | 'DELIVERED' | 'CANCELLED'
export type OrderItemStatus = 'CREATED' | 'IN_PROGRESS' | 'PARTIALLY_DONE' | 'DONE' | 'CANCELLED'
export type ServiceStatus = 'CREATED' | 'IN_PROGRESS' | 'DONE' | 'CANCELLED'
export type PaymentType = 'TRANSFER' | 'CARD' | 'CASH'
export type PricingType = 'FIXED' | 'BY_WEIGHT' | 'BY_AREA' | 'BY_PERIMETER'

// Domain models (snake_case from API)
export interface Client {
  id: number
  client_type: 'INDIVIDUAL' | 'LEGAL_ENTITY'
  name: string
  first_name: string | null
  last_name: string | null
  phone: string | null
  extra_phone: string | null
  address: string | null
  district: string | null
  inn: string | null
  contact_person: string | null
  contact_person_phone: string | null
  comment: string | null
  is_pensioner: boolean
  is_problem: boolean
  is_regular: boolean
  created_at: string
  updated_at: string
}

export interface Order {
  id: number
  client_id: number | null
  client_name: string
  client_address: string | null
  comment: string | null
  status: OrderStatus
  is_warranty: boolean
  parent_order_id: number | null
  total_amount: number
  paid: boolean
  payment_type: PaymentType | null
  payment_date: string | null
  pickup_address: string | null
  delivery_address: string | null
  legacy_id: number | null
  pickup_date: string | null
  pickup_time_slot: string | null
  delivery_date: string | null
  delivery_time_slot: string | null
  pickup_district: string | null
  delivery_district: string | null
  actual_pickup_date: string | null
  actual_pickup_time_slot: string | null
  actual_delivery_date: string | null
  actual_delivery_time_slot: string | null
  base_amount: number
  discount_percent: number
  created_at: string
  updated_at: string
}

export interface OrderItem {
  id: number
  order_id: number
  item_type_id: number
  item_type_name?: string
  description: string | null
  defects: string | null
  status: OrderItemStatus
  price: number
  length: number | null
  width: number | null
  weight: number | null
  area: number | null
  running_meters: number | null
  created_at: string
  updated_at: string
}

export interface OrderItemService {
  id: number
  order_item_id: number
  service_def_id: number
  service_def_name?: string
  status: ServiceStatus
  price: number
  is_manual_price?: boolean
  assignees: Employee[]
  created_at: string
  updated_at: string
}

export interface Employee {
  id: number
  name: string
  contact: string | null
  active: boolean
  created_at: string
}

export interface PriceListEntry {
  id: number
  item_type_id: number
  item_type_name: string | null
  service_def_id: number
  service_def_name: string | null
  pricing_type: string | null
  price: number | null
  cost_price: number | null
  is_active: boolean
}

export interface ItemType {
  id: number
  name: string
  is_default: boolean
  default_price: number | null
  free_threshold: number | null
  services: PriceListEntry[]
  created_at: string
}

export interface ServiceDefinition {
  id: number
  name: string
  base_price?: number
  pricing_type?: PricingType
  created_at: string
}

export interface OrderStatusHistory {
  id: number
  order_id: number
  old_status: OrderStatus | null
  new_status: OrderStatus
  changed_at: string
}

export interface ErrorLogEntry {
  id: number
  error_type: string
  message: string
  request_path: string | null
  occurred_at: string
}

export interface AuditLogEntry {
  id: number
  entity_type: string
  entity_id: number | null
  action: string
  description: string
  occurred_at: string
}

export interface DefectDefinition {
  id: number
  name: string
  surcharge_percent: number
  created_at: string
}

// Paginated response
export interface Page<T> {
  content: T[]
  total_elements: number
  total_pages: number
  page: number
  size: number
}

// Request DTOs
export interface CreateOrderRequest {
  client_id?: number | null
  client_name: string
  comment?: string | null
  pickup_address?: string | null
  delivery_address?: string | null
  legacy_id?: number | null
}

export interface CreateClientRequest {
  client_type?: 'INDIVIDUAL' | 'LEGAL_ENTITY'
  name: string
  first_name?: string
  last_name?: string
  phone?: string
  extra_phone?: string
  address?: string
  district?: string
  inn?: string
  contact_person?: string
  contact_person_phone?: string
  comment?: string
  is_pensioner?: boolean
  is_problem?: boolean
  is_regular?: boolean
}

export interface AddOrderItemRequest {
  item_type_id: number
  description?: string
}

export interface UpdateStatusRequest {
  status: string
}

export interface PayOrderRequest {
  payment_type: PaymentType
}

export interface AddServiceRequest {
  service_def_id: number
}

export interface AssignEmployeesRequest {
  employee_ids: number[]
}

export interface CreateItemTypeRequest {
  name: string
  is_default?: boolean
  default_price?: number | null
  free_threshold?: number | null
}

export interface CreateServiceDefinitionRequest {
  name: string
  base_price: number
  pricing_type: PricingType
}

export interface UpdateOrderItemDimensionsRequest {
  length?: number
  width?: number
  weight?: number
  area?: number
  running_meters?: number
}

export interface CreateEmployeeRequest {
  name: string
  contact?: string
}

export interface UpdateEmployeeRequest {
  name: string
  contact?: string
}

export interface SetPriceRequest {
  price: number
}

export interface CreateWarrantyRequest {
  item_ids: number[]
  warranty_comment: string
}

export interface SetServicePriceRequest {
  price: number
}

export interface PriceModifier {
  id: number
  name: string
  percent: number
  created_at: string
}

export interface OrderModifier {
  id: number
  order_id: number
  modifier_id: number
  modifier_name: string
  percent: number
  created_at: string
}
