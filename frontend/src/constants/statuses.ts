// Единые подписи и порядок статусов для всего фронта.
// Раньше дублировались в OrdersPage / OrderDetailPage / ItemsPage / ProductionPage —
// при добавлении нового статуса (COMPLETED) приходилось править в 4 местах.
import type { OrderStatus, OrderItemStatus, ServiceStatus, PaymentType, PreliminaryPaymentType } from '../types'

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  LEAD: 'Лид',
  CREATED: 'Создан',
  FOR_PICKUP: 'К забору',
  IN_PROGRESS: 'В работе',
  PARTIALLY_DONE: 'Частично готов',
  DONE: 'Готов',
  DELIVERED: 'Доставлен',
  PARTIALLY_DELIVERED: 'Частично доставлен',
  COMPLETED: 'Завершён',
  CANCELLED: 'Отменен',
}

/** Все статусы заказа в естественном порядке прогресса. */
export const ALL_ORDER_STATUSES: OrderStatus[] = [
  'LEAD', 'CREATED', 'FOR_PICKUP', 'IN_PROGRESS', 'PARTIALLY_DONE',
  'DONE', 'DELIVERED', 'PARTIALLY_DELIVERED', 'COMPLETED', 'CANCELLED',
]

/** Заказ считается «активным» если он не в финальных статусах. */
export const ACTIVE_ORDER_STATUSES: OrderStatus[] = [
  'LEAD', 'CREATED', 'FOR_PICKUP', 'IN_PROGRESS', 'PARTIALLY_DONE', 'DONE', 'PARTIALLY_DELIVERED',
]

export const ITEM_STATUS_LABELS: Record<OrderItemStatus, string> = {
  CREATED: 'Создана',
  IN_PROGRESS: 'В работе',
  PARTIALLY_DONE: 'Частично готова',
  DONE: 'Готова',
  CANCELLED: 'Отменена',
}

export const ALL_ITEM_STATUSES: OrderItemStatus[] = [
  'CREATED', 'IN_PROGRESS', 'PARTIALLY_DONE', 'DONE', 'CANCELLED',
]

export const SERVICE_STATUS_LABELS: Record<ServiceStatus, string> = {
  CREATED: 'Создана',
  IN_PROGRESS: 'В работе',
  DONE: 'Готова',
  CANCELLED: 'Отменена',
}

export const ALL_SERVICE_STATUSES: ServiceStatus[] = [
  'CREATED', 'IN_PROGRESS', 'DONE', 'CANCELLED',
]

export const PAYMENT_LABELS: Record<PaymentType, string> = {
  CARD: 'Карта',
  CASH: 'Наличные',
  TRANSFER: 'Перевод',
}

/** V30: предварительный способ расчёта — то, что видит водитель в маршрутном листе. */
export const PRELIMINARY_PAYMENT_LABELS: Record<PreliminaryPaymentType, string> = {
  CASH: 'Наличные',
  CARD: 'Карта',
  TRANSFER: 'Перевод',
  PAID: 'Оплачено',
  FREE: 'Бесплатно / гарантия',
}

export const ALL_PRELIMINARY_PAYMENTS: PreliminaryPaymentType[] = [
  'CASH', 'CARD', 'TRANSFER', 'PAID', 'FREE',
]
