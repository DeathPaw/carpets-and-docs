import type { PriceModifier } from '../types'

/**
 * ПР-004/018: подписи скидок из конструктора. kind: PERCENT — процент (как
 * раньше), FIXED — минус сумма с заказа, FREE_DELIVERY — бесплатная доставка.
 * Старые записи без kind считаем процентными.
 */
export type ModifierKind = 'PERCENT' | 'FIXED' | 'FREE_DELIVERY'

export const MODIFIER_KIND_LABELS: Record<ModifierKind, string> = {
  PERCENT: 'Процент',
  FIXED: 'Фиксированная сумма',
  FREE_DELIVERY: 'Бесплатная доставка',
}

interface ModLike { kind?: string | null; percent: number; amount?: number | null }

export const modifierText = (m: ModLike): string => {
  if (m.kind === 'FIXED') return `−${Number(m.amount ?? 0).toLocaleString('ru-RU')} ₽`
  if (m.kind === 'FREE_DELIVERY') return 'бесплатная доставка'
  const p = Number(m.percent)
  return `${p > 0 ? '+' : p < 0 ? '−' : ''}${Math.abs(p)}%`
}

/** Скидка (зелёная) или надбавка (красная). */
export const isDiscount = (m: ModLike): boolean => m.kind === 'FIXED' || m.kind === 'FREE_DELIVERY' || Number(m.percent) < 0

/** Можно ли применить скидку сегодня: включена, в сроке, лимит не исчерпан. */
export const isApplicableNow = (m: PriceModifier): boolean => {
  if (m.is_active === false) return false
  const today = new Date().toLocaleDateString('sv-SE')
  if (m.valid_from && today < m.valid_from) return false
  if (m.valid_to && today > m.valid_to) return false
  if (m.usage_limit != null && (m.used_count ?? 0) >= m.usage_limit) return false
  return true
}
