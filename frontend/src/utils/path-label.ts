/**
 * Расшифровка пути страницы в человекочитаемое название.
 * Используется в списке «Обращения» — вместо «/orders/123» показываем «Заказ #00123».
 */
import { formatOrderId } from './format'

interface RouteRule {
  pattern: RegExp
  label: (m: RegExpMatchArray) => string
}

// Порядок важен: сначала более специфичные пути.
const RULES: RouteRule[] = [
  { pattern: /^\/orders\/(\d+)$/,             label: m => `Заказ ${formatOrderId(Number(m[1]))}` },
  { pattern: /^\/orders$/,                    label: () => 'Список заказов' },
  { pattern: /^\/items\/(\d+)$/,              label: m => `Позиция #${m[1]}` },
  { pattern: /^\/items$/,                     label: () => 'Список позиций' },
  { pattern: /^\/clients\/(\d+)$/,            label: m => `Клиент #${m[1]}` },
  { pattern: /^\/clients$/,                   label: () => 'Клиенты' },
  { pattern: /^\/dashboard$/,                 label: () => 'Главная' },
  { pattern: /^\/logistics$/,                 label: () => 'Логистика' },
  { pattern: /^\/production$/,                label: () => 'Производство' },
  { pattern: /^\/analytics$/,                 label: () => 'Аналитика' },
  { pattern: /^\/profitability$/,             label: () => 'Доходность' },
  { pattern: /^\/employees$/,                 label: () => 'Сотрудники' },
  { pattern: /^\/references$/,                label: () => 'Справочники' },
  { pattern: /^\/error-log$/,                 label: () => 'Лог ошибок' },
  { pattern: /^\/audit-log$/,                 label: () => 'Лог' },
  { pattern: /^\/feedback$/,                  label: () => 'Обращения' },
]

export interface PathInfo {
  /** Человекочитаемое имя страницы. */
  label: string
  /** Параметры запроса (например, фильтры) — если были. */
  params: Record<string, string>
  /** Исходный полный путь — полезно для прямой навигации. */
  raw: string
}

export function describePath(fullPath: string): PathInfo {
  // Отделяем pathname от search.
  const qIdx = fullPath.indexOf('?')
  const pathname = qIdx >= 0 ? fullPath.slice(0, qIdx) : fullPath
  const search = qIdx >= 0 ? fullPath.slice(qIdx + 1) : ''
  const params: Record<string, string> = {}
  if (search) {
    new URLSearchParams(search).forEach((v, k) => { params[k] = v })
  }
  for (const rule of RULES) {
    const m = pathname.match(rule.pattern)
    if (m) return { label: rule.label(m), params, raw: fullPath }
  }
  // Не распознали — показываем сам путь.
  return { label: pathname, params, raw: fullPath }
}
