import type { Order } from '../types'

/**
 * ПР-010: прозвон по этапам. Забор — колонки client_confirmed* (V43),
 * отвоз — delivery_confirmed* (V59). Последний звонок берётся из журнала и
 * не пропадает, когда отметку снимают из-за переноса дня.
 */
export type CallLeg = 'PICKUP' | 'DELIVERY'

export const legConfirmed = (o: Order, leg: CallLeg): boolean =>
  leg === 'DELIVERY' ? !!o.delivery_confirmed : o.client_confirmed

export const legConfirmedBy = (o: Order, leg: CallLeg): string | null =>
  (leg === 'DELIVERY' ? o.delivery_confirmed_by : o.client_confirmed_by) ?? null

export const lastCall = (o: Order, leg: CallLeg): { at: string; by: string | null } | null => {
  const at = leg === 'DELIVERY' ? o.last_delivery_call_at : o.last_pickup_call_at
  if (!at) return null
  return { at, by: (leg === 'DELIVERY' ? o.last_delivery_call_by : o.last_pickup_call_by) ?? null }
}

export const formatCall = (c: { at: string; by: string | null }): string =>
  new Date(c.at).toLocaleString('ru', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
  + (c.by ? ` · ${c.by}` : '')

/** Поля прозвона из ответа сервера — чтобы обновить заказ в списке без перезагрузки. */
export const callFields = (u: Order): Partial<Order> => ({
  client_confirmed: u.client_confirmed,
  client_confirmed_by: u.client_confirmed_by,
  client_confirmed_at: u.client_confirmed_at,
  delivery_confirmed: u.delivery_confirmed,
  delivery_confirmed_by: u.delivery_confirmed_by,
  delivery_confirmed_at: u.delivery_confirmed_at,
  last_pickup_call_at: u.last_pickup_call_at,
  last_pickup_call_by: u.last_pickup_call_by,
  last_delivery_call_at: u.last_delivery_call_at,
  last_delivery_call_by: u.last_delivery_call_by,
})
