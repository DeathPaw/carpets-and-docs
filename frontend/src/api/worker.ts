import client from './client'

/**
 * Клиент API для личного кабинета работника. Эндпоинты под `/api/worker/**`
 * пропущены в SecurityConfig — Basic Auth не нужна. Идентификатор работника
 * (после успешного логина по PIN) кладём в sessionStorage и передаём в URL.
 */

export interface WorkerListItem {
    id: number
    name: string
    role_name: string | null
    has_pin: boolean
}

export interface WorkerService {
    service_id: number
    service_status: 'CREATED' | 'IN_PROGRESS' | 'DONE' | 'CANCELLED'
    service_price: number
    service_name: string
    pricing_type: 'FIXED' | 'BY_WEIGHT' | 'BY_AREA' | 'BY_PERIMETER' | null
    item_id: number
    item_description: string | null
    item_defects: string | null
    item_status: string
    item_length: number | null
    item_width: number | null
    item_area: number | null
    item_weight: number | null
    item_type_id: number
    item_type_name: string | null
    order_id: number
    client_name: string
    pickup_address: string | null
    delivery_address: string | null
    pickup_date: string | null
    delivery_date: string | null
}

/** Список сотрудников для экрана входа (плитки). Без PIN — только id, имя, роль. */
export const listWorkers = () =>
    client.get<WorkerListItem[]>('/api/worker/employees').then(r => r.data)

/** Логин по PIN. На успехе возвращает имя работника, фронт сохраняет в sessionStorage. */
export const workerLogin = (employeeId: number, pin: string) =>
    client.post<{ employee_id: number; name: string }>('/api/worker/login',
        { employee_id: employeeId, pin }).then(r => r.data)

/** Первая настройка PIN. Доступно только когда PIN ещё null. */
export const workerSetPin = (employeeId: number, pin: string) =>
    client.post('/api/worker/set-pin', { employee_id: employeeId, pin }).then(r => r.data)

/** Список услуг, назначенных мне. */
export const myServices = (employeeId: number) =>
    client.get<WorkerService[]>(`/api/worker/${employeeId}/services`).then(r => r.data)

/** Сменить статус услуги (только если я в её assignees). */
export const changeServiceStatus = (employeeId: number, serviceId: number, status: 'CREATED' | 'IN_PROGRESS' | 'DONE') =>
    client.patch(`/api/worker/${employeeId}/services/${serviceId}/status`, { status }).then(r => r.data)

/** Обновить размеры позиции (только если я назначен хотя бы на одну её услугу). */
export const updateItemDimensions = (
    employeeId: number,
    itemId: number,
    dims: { length?: number | null; width?: number | null; area?: number | null; weight?: number | null }
) =>
    client.patch(`/api/worker/${employeeId}/items/${itemId}/dimensions`, dims).then(r => r.data)

/** Обновить описание/дефекты позиции. */
export const updateItemDescription = (
    employeeId: number,
    itemId: number,
    body: { description?: string; defects?: string }
) =>
    client.patch(`/api/worker/${employeeId}/items/${itemId}/description`, body).then(r => r.data)

/** Загрузить фото к позиции. data — base64 без префикса `data:image/...;base64,`. */
export const uploadItemPhoto = (
    employeeId: number,
    itemId: number,
    body: { filename: string; content_type: string; data: string }
) =>
    client.post(`/api/worker/${employeeId}/items/${itemId}/photos`, body).then(r => r.data)

/** Точка маршрута (забор или доставка) — для водителя/логиста. */
export interface RoutePoint {
    point_type: 'pickup' | 'delivery'
    order_id: number
    client_name: string
    address: string | null
    district: string | null
    plan_date: string | null
    time_slot: string | null
    total_amount: number
    paid: boolean
    payment_type: 'CARD' | 'CASH' | 'TRANSFER' | null
    client_phone: string | null
}

/** Маршрут на сегодня (или диапазон). */
export const myRoute = (employeeId: number, from?: string, to?: string) => {
    const p = new URLSearchParams()
    if (from) p.append('dateFrom', from)
    if (to)   p.append('dateTo', to)
    return client.get<RoutePoint[]>(
        `/api/worker/${employeeId}/route${p.toString() ? '?' + p.toString() : ''}`
    ).then(r => r.data)
}

/** Позиции заказа для экрана отметки доставки (Спринт V9). Только не-default. */
export interface DeliveryItem {
    item_id: number
    description: string | null
    item_status: string
    delivery_state: 'PENDING' | 'DELIVERED' | 'LOST'
    item_type_name: string | null
    is_default: boolean
}
export const getItemsForDelivery = (employeeId: number, orderId: number) =>
    client.get<DeliveryItem[]>(`/api/worker/${employeeId}/orders/${orderId}/items-for-delivery`).then(r => r.data)

/** Меняем delivery_state позиции (Спринт V9). */
export const setItemDeliveryState = (employeeId: number, itemId: number, state: 'PENDING' | 'DELIVERED' | 'LOST') =>
    client.patch(`/api/worker/${employeeId}/items/${itemId}/delivery-state`, { state }).then(r => r.data)
