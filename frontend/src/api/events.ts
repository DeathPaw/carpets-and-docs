/**
 * Шина событий API. Подписчики (главный потребитель — челлендж-панель тренажёра)
 * получают уведомление о каждом успешном ответе бэка с методом, URL и данными.
 *
 * Реализация — простой массив листенеров без зависимостей. Нет смысла тащить
 * EventEmitter / RxJS ради одного подписчика.
 */

export interface ApiSuccessEvent {
    /** HTTP-метод в верхнем регистре: GET, POST, PUT, PATCH, DELETE. */
    method: string
    /** URL без origin: `/api/orders`, `/api/orders/42/status`. */
    url: string
    /** HTTP-статус ответа (200, 201, ...). */
    status: number
    /** Тело запроса (если было). */
    requestData?: unknown
    /** Тело ответа. */
    responseData?: unknown
}

type Listener = (e: ApiSuccessEvent) => void

const listeners = new Set<Listener>()

/** Подписаться. Возвращает функцию отписки — кидайте в useEffect cleanup. */
export function onApiSuccess(fn: Listener): () => void {
    listeners.add(fn)
    return () => { listeners.delete(fn) }
}

/** Внутреннее — вызывается из axios response-интерсептора. */
export function emitApiSuccess(e: ApiSuccessEvent): void {
    for (const fn of listeners) {
        try { fn(e) } catch { /* swallow — один битый листенер не должен ломать другие */ }
    }
}
