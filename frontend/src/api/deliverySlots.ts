import client from './client'

export interface DeliverySlot {
  id: number
  /** 0=Вс, 1=Пн, ..., 6=Сб. */
  day_of_week: number
  /** Формат HH:MM. */
  start_time: string
  end_time: string
  label: string | null
  is_active: boolean
  sort_order: number
}

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
