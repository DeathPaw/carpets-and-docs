import client from './client'

/**
 * Правка №9 (09.09): предварительный расчёт стоимости без клиента и заказа.
 *
 * Считает бэкенд — по тем же правилам, что настоящий заказ (цена услуги от
 * размеров, забор и доставка с порогом бесплатности, скидки и надбавки,
 * округление итога вниз до сотни). Так цифра, названная клиенту по телефону,
 * совпадает с заказом, созданным из этого расчёта.
 */
export interface QuoteItemInput {
  item_type_id: number | null
  length: number | null
  width: number | null
  weight: number | null
  /** Только если площадь задана вручную (круглый ковёр). Иначе длина × ширина. */
  area: number | null
  /** null — основную услугу подберёт бэкенд по типу и размерам. */
  main_sku_id: number | null
  extra_sku_ids: number[]
}

export interface QuoteLine {
  sku_id: number
  name: string
  pricing_type: string
  /** Базовая ставка SKU: за м², кг или штуку. */
  unit_price: number
  price: number
  /** Стала бесплатной по порогу суммы. */
  free: boolean
  /** Подходит изделию по типу и размерам. */
  matches: boolean
}

export interface QuoteItemResult {
  item_type_id?: number | null
  item_type_name?: string | null
  area?: number | null
  services: QuoteLine[]
  price: number
}

export interface QuoteModifierLine {
  modifier_id: number
  name: string
  percent: number
  amount: number
}

export interface QuoteResult {
  /** По одному на каждое изделие запроса, в том же порядке. */
  items: QuoteItemResult[]
  /** Обязательные позиции заказа: оформление, забор, доставка. */
  logistics: QuoteLine[]
  modifiers: QuoteModifierLine[]
  goods_amount: number
  base_amount: number
  modifiers_amount: number
  /** Разница от округления итога вниз до сотни, ≤ 0. */
  rounding_amount: number
  total_amount: number
  /** С какой суммы изделий забор и доставка бесплатны. */
  free_threshold?: number | null
  warnings: string[]
}

export const quoteOrder = (items: QuoteItemInput[], modifierIds: number[]) =>
  client.post<QuoteResult>('/api/orders/quote', { items, modifier_ids: modifierIds }).then(r => r.data)
