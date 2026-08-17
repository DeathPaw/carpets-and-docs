import { useState } from 'react'
import { payOrder, updateOrderStatus, updateActualDates } from '../../api/orders'
import { useEscapeClose } from '../../hooks/useEscapeClose'
import { formatOrderNumber } from '../../utils/format'
import type { Order, PaymentType } from '../../types'

const PAYMENT_OPTIONS: { value: PaymentType; label: string }[] = [
  { value: 'CASH',     label: 'Наличные' },
  { value: 'CARD',     label: 'Карта' },
  { value: 'TRANSFER', label: 'Перевод' },
]

/** Что показываем в строке — минимум, который нужен оператору для решения. */
export interface DeliveryRow {
  order: Order
  address: string | null
  timeSlot: string | null
}

type RowState =
  | { kind: 'idle' }
  | { kind: 'saving' }
  | { kind: 'done'; status: string }
  | { kind: 'error'; message: string }

/**
 * Массовое завершение развозки за день — правка №2.
 *
 * <p>Раньше после маршрута оператор на каждый заказ открывал карточку, жал
 * «Оплатить и завершить», выбирал тип оплаты и возвращался в список. При 10–15
 * заказах это десятки переходов. Здесь весь список дня на одном экране:
 * один клик по типу оплаты = заказ завершён.
 *
 * <p>Под капотом та же цепочка, что в карточке заказа:
 * фактическая дата доставки (если не проставлена) → DELIVERED → оплата (бэк
 * сам переводит в COMPLETED). Строки обрабатываются независимо: ошибка на одной
 * не мешает завершить остальные.
 */
export default function CompleteDeliveriesModal({
  date, rows, onClose, onFinished,
}: {
  date: string
  rows: DeliveryRow[]
  onClose: () => void
  /** Дёргается при закрытии, если хоть один заказ завершён — родитель перезагружает список. */
  onFinished: (changed: boolean) => void
}) {
  const [states, setStates] = useState<Record<number, RowState>>({})
  const [changed, setChanged] = useState(false)

  const close = () => { onFinished(changed); onClose() }
  useEscapeClose(true, close)

  const formattedDate = new Date(date).toLocaleDateString('ru', {
    weekday: 'long', day: 'numeric', month: 'long',
  })

  const complete = async (row: DeliveryRow, paymentType: PaymentType) => {
    const id = row.order.id
    setStates(s => ({ ...s, [id]: { kind: 'saving' } }))
    try {
      // Дата доставки обязательна для перехода в DELIVERED. В логистике карточка
      // уже стоит на дне, но actual_delivery_date мог остаться пустым — проставим.
      if (!row.order.actual_delivery_date) {
        await updateActualDates(id, {
          actual_delivery_date: date,
          actual_delivery_time_slot: row.timeSlot || null,
        })
      }
      if (row.order.status !== 'DELIVERED') {
        await updateOrderStatus(id, { status: 'DELIVERED' })
      }
      const updated = await payOrder(id, { payment_type: paymentType })
      setStates(s => ({ ...s, [id]: { kind: 'done', status: updated.status } }))
      setChanged(true)
    } catch (e: unknown) {
      const message = (e as any)?.response?.data?.message || 'Не удалось завершить заказ'
      setStates(s => ({ ...s, [id]: { kind: 'error', message } }))
    }
  }

  const pending = rows.filter(r => {
    const st = states[r.order.id]
    return !r.order.paid && st?.kind !== 'done'
  })

  return (
    <div className="modal-overlay" onClick={close}>
      <div
        className="modal"
        onClick={e => e.stopPropagation()}
        style={{ maxWidth: 860, width: '92vw', maxHeight: '86vh', overflowY: 'auto' }}
      >
        <h2 style={{ marginTop: 0 }}>Завершение развозки</h2>
        <div style={{ color: '#7f8c8d', marginBottom: 12 }}>
          {formattedDate} · осталось завершить: {pending.length} из {rows.length}
        </div>

        {rows.length === 0 ? (
          <div className="empty" style={{ padding: 24, textAlign: 'center', color: '#999' }}>
            На эту дату доставок нет
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={th}>Заказ</th>
                <th style={th}>Клиент</th>
                <th style={th}>Адрес</th>
                <th style={{ ...th, textAlign: 'right' }}>Сумма</th>
                <th style={th}>Оплата и завершение</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(row => {
                const st: RowState = states[row.order.id] ?? { kind: 'idle' }
                const alreadyPaid = row.order.paid
                const finished = alreadyPaid || st.kind === 'done'
                return (
                  <tr key={row.order.id} style={{ opacity: finished ? 0.6 : 1 }}>
                    <td style={td}>
                      {formatOrderNumber(row.order.id, row.order.created_at)}
                      {row.timeSlot && (
                        <div style={{ fontSize: '0.82em', color: '#95a5a6' }}>{row.timeSlot}</div>
                      )}
                    </td>
                    <td style={td}>{row.order.client_name}</td>
                    <td style={{ ...td, fontSize: '0.88em', color: '#666' }}>{row.address || '—'}</td>
                    <td style={{ ...td, textAlign: 'right', whiteSpace: 'nowrap', fontWeight: 600 }}>
                      {Number(row.order.total_amount).toFixed(0)} &#8381;
                    </td>
                    <td style={td}>
                      {finished ? (
                        <span style={{ color: '#27ae60', fontWeight: 600 }}>✓ Завершён</span>
                      ) : st.kind === 'saving' ? (
                        <span style={{ color: '#7f8c8d' }}>Сохраняем…</span>
                      ) : (
                        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', alignItems: 'center' }}>
                          {PAYMENT_OPTIONS.map(p => (
                            <button
                              key={p.value}
                              className="btn-success btn-sm"
                              title={`Завершить с оплатой «${p.label}»`}
                              onClick={() => void complete(row, p.value)}
                            >{p.label}</button>
                          ))}
                          {st.kind === 'error' && (
                            <span style={{ color: '#c0392b', fontSize: '0.82em' }}>{st.message}</span>
                          )}
                        </div>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}>
          <button className="btn-secondary" onClick={close}>Закрыть</button>
        </div>
      </div>
    </div>
  )
}

const th: React.CSSProperties = {
  textAlign: 'left', padding: '6px 8px', borderBottom: '2px solid #ecf0f1',
  fontSize: '0.82em', color: '#7f8c8d', textTransform: 'uppercase', letterSpacing: 0.4,
}
const td: React.CSSProperties = { padding: '8px', borderBottom: '1px solid #f0f0f0', verticalAlign: 'top' }
