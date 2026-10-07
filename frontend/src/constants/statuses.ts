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

/**
 * V46 (правка №3 от 13.09): маркетинговые справочники.
 *
 * Списки заданы договорённостью с владельцем и меняются релизом — в отличие
 * от причин отмены, которые он правит сам в Справочниках. Порядок в объектах
 * = порядок в выпадающих списках, поэтому «Неизвестно» стоит последним.
 */
export const RESTART_STATUS_LABELS: Record<string, string> = {
  REVIVAL_BEFORE: 'Клиент «Возрождения» до перезапуска',
  NEW_AFTER:      'Впервые обратился после перезапуска',
  UNKNOWN:        'Неизвестно',
}

export const CLIENT_SOURCE_LABELS: Record<string, string> = {
  REVIVAL_BASE:   'Историческая база «Возрождения»',
  RECOMMENDATION: 'Рекомендация',
  OLD_SITE:       'Старый сайт himchist.spb.ru',
  KOVROKOT_SITE:  'Сайт «Коврокот»',
  YANDEX_DIRECT:  'Яндекс.Директ',
  YANDEX_SEARCH:  'Поиск Яндекса',
  YANDEX_MAPS:    'Яндекс Карты',
  OTHER:          'Другой источник',
  UNKNOWN:        'Неизвестно',
}

/** V47 (правка №1 от 13.09): пол клиента. */
export const GENDER_LABELS: Record<string, string> = {
  MALE:    'Мужчина',
  FEMALE:  'Женщина',
  UNKNOWN: 'Не указан',
}

export const ORDER_REASON_LABELS: Record<string, string> = {
  SEASONAL:   'Плановая сезонная чистка',
  PET:        'Моча или запах от животного',
  STAIN:      'Пятно или локальное загрязнение',
  WET:        'Мокрый или залитый ковёр',
  GENERAL:    'Общее загрязнение',
  RENOVATION: 'После ремонта или переезда',
  EVENT:      'Подготовка к событию',
  OTHER:      'Другой повод',
  NOT_TOLD:   'Клиент не сообщил',
}

/** V45: типы событий по претензиям (правка №3 от 19.09). */
export const REFUND_KIND_LABELS: Record<string, string> = {
  FULL_REFUND:       'Полный возврат',
  PARTIAL_REFUND:    'Частичный возврат',
  ITEM_COMPENSATION: 'Компенсация за ковёр',
  OTHER:             'Другое',
}

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
