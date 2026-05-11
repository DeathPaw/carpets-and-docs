import client from './client'
import type { Sku, SkuGroup, AttributeDefinition, SkuMatchResult, SkuPricingType } from '../types'

/**
 * V10: API SKU-каталога. Заменяет старые services/price-list.
 *
 * <p>Группа («Стирка», «Чистка», «Доставка») — просто справочник для UI.
 * Атрибут SKU (EAV) — `attribute_definitions` + `sku_attributes`. SKU имеет
 * `price`, `cost_price`, `pricing_type`, `is_auto_add`, `free_threshold`
 * на самом мастере; история изменений — через `/skus/{id}/history`.
 */

// SKU
export const getSkus = () =>
  client.get<Sku[]>('/api/skus').then(r => r.data)

export const getSku = (id: number) =>
  client.get<Sku>(`/api/skus/${id}`).then(r => r.data)

export interface SkuRequest {
  groupId: number
  name: string
  pricingType: SkuPricingType
  price: number | null
  costPrice: number | null
  isAutoAdd: boolean
  freeThreshold: number | null
  attributes: Record<string, string[]>
}

export const createSku = (data: SkuRequest) =>
  client.post<Sku>('/api/skus', data).then(r => r.data)

export const updateSku = (id: number, data: SkuRequest) =>
  client.put<Sku>(`/api/skus/${id}`, data).then(r => r.data)

export const deleteSku = (id: number) =>
  client.delete(`/api/skus/${id}`)

/** История версий SKU — popover на ячейке прайса (Спринт V10, аудит). */
export interface SkuVersion {
  id: number
  version_num: number
  name: string
  group_id: number | null
  pricing_type: string
  price: number | null
  cost_price: number | null
  is_auto_add: boolean
  free_threshold: number | null
  attributes_snapshot: Record<string, string[]> | null
  valid_from: string
  valid_to: string | null
  changed_by: string | null
}
export const getSkuHistory = (id: number) =>
  client.get<SkuVersion[]>(`/api/skus/${id}/history`).then(r => r.data)

/**
 * Подбор подходящих SKU для конкретной позиции заказа.
 * Возвращает все SKU группы (если задана) + флаг `matches` — соответствует ли
 * SKU параметрам позиции. На UI «matches=true» подсвечиваем как «✓ подходит».
 */
export const getMatchingSkus = (params: {
  groupId?: number
  itemTypeId?: number | null
  weight?: number | null
  area?: number | null
  perimeter?: number | null
  length?: number | null
  width?: number | null
  runningMeters?: number | null
}) => client.get<SkuMatchResult[]>('/api/skus/matching', { params }).then(r => r.data)

// SKU groups
export const getSkuGroups = () =>
  client.get<SkuGroup[]>('/api/sku-groups').then(r => r.data)

export const createSkuGroup = (data: { name: string; sort_order?: number }) =>
  client.post<SkuGroup>('/api/sku-groups', data).then(r => r.data)

export const updateSkuGroup = (id: number, data: { name: string; sort_order?: number }) =>
  client.put<SkuGroup>(`/api/sku-groups/${id}`, data).then(r => r.data)

export const deleteSkuGroup = (id: number) =>
  client.delete(`/api/sku-groups/${id}`)

// Attribute definitions
export const getAttributeDefinitions = () =>
  client.get<AttributeDefinition[]>('/api/attribute-definitions').then(r => r.data)

export const createAttributeDefinition = (data: {
  key: string
  label: string
  value_type: 'NUMBER' | 'STRING' | 'REFERENCE_ITEM_TYPE'
  unit?: string | null
  sort_order?: number
}) => client.post<AttributeDefinition>('/api/attribute-definitions', data).then(r => r.data)

export const deleteAttributeDefinition = (key: string) =>
  client.delete(`/api/attribute-definitions/${key}`)
