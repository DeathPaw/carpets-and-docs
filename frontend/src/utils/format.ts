/**
 * Общие форматтеры для чисел, дат и идентификаторов заказов.
 * Раньше функции дублировались в OrdersPage / OrderDetailPage / LogisticsPage / ItemsPage.
 */

/** «00042 от 01.05.2026» — стандартное отображение номера заказа в списках/карточках. */
export function formatOrderNumber(id: number, createdAt: string): string {
  const num = String(id).padStart(5, '0')
  const date = new Date(createdAt).toLocaleDateString('ru')
  return `${num} от ${date}`
}

/** «00042» — короткий вид (без даты). Для компактных списков. */
export function formatOrderId(id: number): string {
  return `#${String(id).padStart(5, '0')}`
}

/** «10 000.00 ₽» — рубли с двумя знаками. */
export function formatRub(amount: number | string | null | undefined): string {
  return Number(amount ?? 0).toLocaleString('ru', {
    minimumFractionDigits: 2, maximumFractionDigits: 2,
  }) + ' ₽'
}

/** Извлечь читаемое сообщение из ошибки axios или другой ошибки. */
export function extractApiError(e: unknown, fallback = 'Произошла ошибка'): string {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const msg = (e as any)?.response?.data?.message
  if (typeof msg === 'string' && msg.trim()) return msg
  if (e instanceof Error && e.message) return e.message
  return fallback
}
