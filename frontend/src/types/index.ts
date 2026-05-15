// Enums
export type OrderStatus = 'LEAD' | 'CREATED' | 'FOR_PICKUP' | 'IN_PROGRESS' | 'PARTIALLY_DONE' | 'DONE' | 'DELIVERED' | 'PARTIALLY_DELIVERED' | 'COMPLETED' | 'CANCELLED'
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
  lat: number | null
  lon: number | null
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
  pickup_lat: number | null
  pickup_lon: number | null
  delivery_lat: number | null
  delivery_lon: number | null
  actual_pickup_date: string | null
  actual_pickup_time_slot: string | null
  actual_delivery_date: string | null
  actual_delivery_time_slot: string | null
  base_amount: number
  discount_percent: number
  cancellation_reason: string | null
  /** Назначенный водитель/логист (Спринт D). NULL — не назначен. */
  assigned_driver_id: number | null
  assigned_driver_name: string | null
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
  cancellation_reason: string | null
  created_at: string
  updated_at: string
}

export interface OrderItemService {
  id: number
  order_item_id: number
  /** V10: ссылка на SKU. Прежнее `service_def_id` удалено вместе со старым каталогом. */
  sku_id: number
  sku_name?: string
  sku_group_name?: string
  pricing_type?: string
  status: ServiceStatus
  price: number
  is_manual_price?: boolean
  assignees: Employee[]
  cancellation_reason?: string | null
  created_at: string
  updated_at: string
}

/** V10: тип ценообразования SKU. */
export type SkuPricingType = 'FIXED' | 'BY_WEIGHT' | 'BY_AREA' | 'BY_PERIMETER'
  | 'BY_LENGTH' | 'BY_WIDTH' | 'BY_RUNNING_METERS'

export interface SkuGroup {
  id: number
  name: string
  sort_order: number
}

export interface AttributeDefinition {
  key: string
  label: string
  /** NUMBER | STRING | REFERENCE_ITEM_TYPE */
  value_type: 'NUMBER' | 'STRING' | 'REFERENCE_ITEM_TYPE'
  unit: string | null
  sort_order: number
}

export interface Sku {
  id: number
  group_id: number
  group_name: string | null
  name: string
  pricing_type: SkuPricingType
  price: number | null
  cost_price: number | null
  is_auto_add: boolean
  free_threshold: number | null
  is_active: boolean
  is_deleted: boolean
  current_version_id: number | null
  /** V11 lifecycle: при каком статусе заказа авто-завершить услугу. */
  auto_complete_on_status: string | null
  /** V11 lifecycle: какой статус заказа выставить когда услуга завершена. */
  triggers_order_status: string | null
  /** V11 lifecycle: не учитывать при вычислении общего статуса заказа. */
  exclude_from_status_calc: boolean
  /** Атрибуты как map key → [values]. Один ключ может иметь несколько значений. */
  attributes: Record<string, string[]>
}

export interface SkuMatchResult {
  sku: Sku
  matches: boolean
}

export interface Employee {
  id: number
  name: string
  contact: string | null
  active: boolean
  /** Привязка к роли (см. EmployeeRole). null = без роли (универсал, может всё). */
  role_id: number | null
  created_at: string
}

/**
 * Роль сотрудника — набор типов позиций, с которыми он умеет работать.
 * При назначении исполнителей к услуге фильтруем по роли:
 * сотрудник видит только те типы позиций, которые входят в его роль.
 */
export interface EmployeeRole {
  id: number
  name: string
  description: string | null
  item_type_ids: number[]
  created_at: string
  updated_at: string
}

export interface CreateEmployeeRoleRequest {
  name: string
  description?: string
  item_type_ids: number[]
}

/** Темы обращения. Лейблы для UI см. FEEDBACK_TOPIC_LABELS в constants/feedback.ts. */
export type FeedbackTopic =
  | 'SUGGESTION_HOW'    // «А можем сделать вот так?»
  | 'FEATURE_REQUEST'   // «Хочу такую функцию»
  | 'LOGIC_BUG'         // «Ошибка в логике/поведении»
  | 'VISUAL_BUG'        // «Визуальная ошибка»
  | 'UNCLEAR'           // «Непонятно что делать»

export type FeedbackStatus =
  | 'NEW'
  | 'REVIEWED'
  | 'IN_PROGRESS'
  | 'DONE'
  | 'REJECTED'
  | 'NEED_INFO'

export interface Feedback {
  id: number
  topic: FeedbackTopic
  body: string
  page_path: string
  screenshot: string | null         // base64
  screenshot_type: string | null    // mime
  submitted_by: string | null
  status: FeedbackStatus
  created_at: string
}

export interface CreateFeedbackRequest {
  topic: FeedbackTopic
  body: string
  page_path: string
  screenshot?: string | null
  screenshot_type?: string | null
}

/** V10: ItemType упрощён — это просто категория вещи клиента. */
export interface ItemType {
  id: number
  name: string
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
  lat?: number | null
  lon?: number | null
}

export interface District {
  id: number
  name: string
  sort_order: number
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface CreateDistrictRequest {
  name: string
  sort_order?: number
  is_active?: boolean
}

export interface AddOrderItemRequest {
  item_type_id: number
  description?: string
}

export interface UpdateStatusRequest {
  status: string
  /** Обязательна при переходе в CANCELLED, минимум 10 символов после trim. */
  cancellation_reason?: string
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

/** V10: CreateItemTypeRequest упрощён — только имя. */
export interface CreateItemTypeRequest {
  name: string
}

export interface UpdateOrderItemDimensionsRequest {
  length?: number
  width?: number
  weight?: number
  area?: number
  running_meters?: number
  /** V10: периметр — отдельная мера для овальных/круглых ковров. */
  perimeter?: number
}

export interface CreateEmployeeRequest {
  name: string
  contact?: string
  role_id?: number | null
}

export interface UpdateEmployeeRequest {
  name: string
  contact?: string
  role_id?: number | null
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

/**
 * Позиция, обогащённая позиционным номером в заказе (ROW_NUMBER OVER PARTITION BY order_id).
 * Возвращается из эндпоинтов "/items" и "/services" (страницы списков и производство).
 * Нужна, чтобы в UI выводить "Заказ #123 / поз. 2" без дополнительных запросов.
 */
export interface OrderItemPositioned extends OrderItem {
  position_in_order: number
}

/** Услуга в плоском виде с привязкой к заказу — используется на странице "Производство" в режиме "По услугам". */
export interface OrderItemServicePositioned extends OrderItemService {
  order_id: number
  position_in_order: number
  item_type_name: string | null
}
