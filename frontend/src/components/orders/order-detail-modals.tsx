import { useState } from 'react'
import { addOrderItem } from '../../api/orders'
import type { OrderItem, ItemType, AddOrderItemRequest, PaymentType } from '../../types'

/**
 * Модалки страницы заказа, вынесенные из OrderDetailPage.tsx (1700+ строк).
 * Все они независимые, без общего state — поэтому удобно собрать в один файл,
 * чтобы не плодить мелкие файлы по 30 строк.
 */

// ---- Гарантийный возврат: оператор выбирает позиции и пишет причину ----
export function WarrantyModal({
  items, onClose, onConfirm,
}: {
  items: OrderItem[]
  onClose: () => void
  onConfirm: (itemIds: number[], comment: string) => void
}) {
  const [selectedIds, setSelectedIds] = useState<number[]>(items.map(i => i.id))
  const [comment, setComment] = useState('')
  const [error, setError] = useState('')

  const toggle = (id: number) => {
    setSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])
  }

  const submit = () => {
    if (selectedIds.length === 0) { setError('Выберите хотя бы одну позицию'); return }
    if (!comment.trim()) { setError('Укажите причину гарантийного возврата'); return }
    onConfirm(selectedIds, comment.trim())
  }

  return (
    <div className="modal-overlay" onClick={() => { if (confirm('Отменить создание гарантийного возврата?')) onClose() }}>
      <div className="modal" onClick={e => e.stopPropagation()} style={{ maxHeight: '85vh', overflowY: 'auto' }}>
        <h2>Гарантийный возврат</h2>
        <p style={{ color: '#666', marginBottom: 12 }}>Выберите позиции для возврата:</p>
        <div style={{ maxHeight: 200, overflowY: 'auto', marginBottom: 12 }}>
          {items.map(item => (
            <label key={item.id} style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '4px 0', cursor: 'pointer' }}>
              <input
                type="checkbox"
                style={{ width: 'auto' }}
                checked={selectedIds.includes(item.id)}
                onChange={() => toggle(item.id)}
              />
              {item.item_type_name ?? `Позиция #${item.id}`}
              {item.description ? ` — ${item.description}` : ''}
            </label>
          ))}
        </div>
        <div className="form-group">
          <label>Причина гарантийного возврата *</label>
          <textarea
            rows={3}
            value={comment}
            onChange={e => setComment(e.target.value)}
            placeholder="Опишите причину возврата..."
          />
        </div>
        {error && <div className="error-msg">{error}</div>}
        <div className="modal-actions">
          <button className="btn-secondary" onClick={onClose}>Отмена</button>
          <button className="btn-warning" onClick={submit}>Создать гарантийный заказ</button>
        </div>
      </div>
    </div>
  )
}

// ---- Добавление позиции в заказ ----
export function AddItemModal({
  orderId, itemTypes, onClose, onAdded,
}: {
  orderId: number
  itemTypes: ItemType[]
  onClose: () => void
  onAdded: (item: OrderItem) => void
}) {
  // Исключаем типы "по умолчанию" — они добавляются автоматически
  const selectableTypes = itemTypes.filter(t => !t.is_default)
  const [form, setForm] = useState<AddOrderItemRequest>({ item_type_id: selectableTypes[0]?.id ?? 0, description: '' })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const submit = async () => {
    if (!form.item_type_id) { setError('Выберите тип позиции'); return }
    setLoading(true)
    try {
      const item = await addOrderItem(orderId, form)
      onAdded(item)
    } catch {
      setError('Ошибка при добавлении позиции')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={() => { if (confirm('Отменить добавление позиции?')) onClose() }}>
      <div className="modal" onClick={e => e.stopPropagation()} style={{ maxHeight: '85vh', overflowY: 'auto' }}>
        <h2>Добавить позицию</h2>
        <div className="form-group">
          <label>Тип позиции *</label>
          <select value={form.item_type_id} onChange={e => setForm(f => ({ ...f, item_type_id: Number(e.target.value) }))}>
            {selectableTypes.length === 0
              ? <option value="">Нет доступных типов</option>
              : selectableTypes.map(t => <option key={t.id} value={t.id}>{t.name}</option>)
            }
          </select>
        </div>
        <div className="form-group">
          <label>Описание</label>
          <textarea rows={2} value={form.description ?? ''} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
        </div>
        {error && <div className="error-msg">{error}</div>}
        <div className="modal-actions">
          <button className="btn-secondary" onClick={onClose}>Отмена</button>
          <button className="btn-primary" onClick={submit} disabled={loading || selectableTypes.length === 0}>
            {loading ? 'Добавление...' : 'Добавить'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ---- Простое окно «Оплатить» (на странице DELIVERED) ----
export function PayModal({ onClose, onPay }: { onClose: () => void; onPay: (pt: PaymentType) => void }) {
  const [paymentType, setPaymentType] = useState<PaymentType>('CARD')
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <h2>Оплата заказа</h2>
        <div className="form-group">
          <label>Тип оплаты</label>
          <select value={paymentType} onChange={e => setPaymentType(e.target.value as PaymentType)}>
            <option value="CARD">Карта</option>
            <option value="CASH">Наличные</option>
            <option value="TRANSFER">Перевод</option>
          </select>
        </div>
        <div className="modal-actions">
          <button className="btn-secondary" onClick={onClose}>Отмена</button>
          <button className="btn-success" onClick={() => onPay(paymentType)}>Оплатить</button>
        </div>
      </div>
    </div>
  )
}

// ---- «Принять оплату»: оплата + переход в DELIVERED одним действием (статус DONE) ----
export function DeliverAndPayModal({
  onClose, onSubmit,
}: {
  onClose: () => void
  onSubmit: (data: { date: string; slot: string; paymentType: PaymentType }) => void
}) {
  const today = new Date().toISOString().slice(0, 10)
  const [date, setDate] = useState(today)
  const [slot, setSlot] = useState('')
  const [paymentType, setPaymentType] = useState<PaymentType>('CARD')
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 460 }}>
        <h2>Принять оплату</h2>
        <p style={{ color: '#666', marginTop: 0 }}>
          Заказ переведём в «Доставлен» (с указанной датой) и сразу оплатим.
        </p>
        <div className="form-group">
          <label>Дата доставки (факт) *</label>
          <input type="date" value={date} onChange={e => setDate(e.target.value)} />
        </div>
        <div className="form-group">
          <label>Временной слот</label>
          <select value={slot} onChange={e => setSlot(e.target.value)}>
            <option value="">— не указан —</option>
            <option value="08:00-12:00">8:00–12:00</option>
            <option value="12:00-18:00">12:00–18:00</option>
            <option value="18:00-22:00">18:00–22:00</option>
          </select>
        </div>
        <div className="form-group">
          <label>Тип оплаты *</label>
          <select value={paymentType} onChange={e => setPaymentType(e.target.value as PaymentType)}>
            <option value="CARD">Карта</option>
            <option value="CASH">Наличные</option>
            <option value="TRANSFER">Перевод</option>
          </select>
        </div>
        <div className="modal-actions">
          <button className="btn-secondary" onClick={onClose}>Отмена</button>
          <button
            className="btn-success"
            disabled={!date}
            onClick={() => onSubmit({ date, slot, paymentType })}
          >
            Принять оплату
          </button>
        </div>
      </div>
    </div>
  )
}
