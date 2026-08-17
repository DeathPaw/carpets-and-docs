import client from './client'

export interface DeliverySlot {
  id: number
  /** 0=Вс, 1=Пн, ..., 6=Сб. */
  day_of_week: number
  /** Формат HH:MM. */
  start_time: string
  /** HH:MM или null — null означает слот с фиксированным временем («к 15:00»). */
  end_time: string | null
  label: string | null
  is_active: boolean
  sort_order: number
}

/**
 * Строковый ключ слота — то, что лежит в orders.actual_*_time_slot.
 * Интервал: "17:00-20:30". Фиксированное время: "15:00".
 */
export const slotValue = (s: Pick<DeliverySlot, 'start_time' | 'end_time'>): string =>
  s.end_time ? `${s.start_time}-${s.end_time}` : s.start_time

/** Человекочитаемая подпись: "17:00–20:30" либо "к 15:00". */
export const slotLabel = (s: Pick<DeliverySlot, 'start_time' | 'end_time'>): string =>
  s.end_time ? `${s.start_time}–${s.end_time}` : `к ${s.start_time}`

/** Активные слоты (для пользовательских выпадающих). */
export const getDeliverySlots = () =>
  client.get<DeliverySlot[]>('/api/delivery-slots').then(r => r.data)

/** Все слоты — для админ-страницы Справочников. */
export const getAllDeliverySlots = () =>
  client.get<DeliverySlot[]>('/api/delivery-slots/all').then(r => r.data)

export const createDeliverySlot = (data: Omit<DeliverySlot, 'id'>) =>
  client.post<DeliverySlot>('/api/delivery-slots', data).then(r => r.data)

export const updateDeliverySlot = (id: number, data: Omit<DeliverySlot, 'id'>) =>
  client.put<DeliverySlot>(`/api/delivery-slots/${id}`, data).then(r => r.data)

export const deleteDeliverySlot = (id: number) =>
  client.delete(`/api/delivery-slots/${id}`)
