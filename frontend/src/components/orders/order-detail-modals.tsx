import { useState } from 'react'
import { addOrderItem } from '../../api/orders'
import type { OrderItem, ItemType, PaymentType } from '../../types'
import Tiles, { hashColor } from '../Tiles'

/**
 * Опции для выбора типа оплаты — 3 варианта, дроп-даун заменён на плитки
 * (Спринт A, замечание Миши: «дропдауны на ≤5 значений бесят непрерывно
 * кликающих операторов»). Используется в PayModal и DeliverAndPayModal.
 */
const PAYMENT_OPTIONS: { value: PaymentType; label: string }[] = [
    { value: 'CARD',     label: 'Карта' },
    { value: 'CASH',     label: 'Наличные' },
    { value: 'TRANSFER', label: 'Перевод' },
]

/** Стандартные слоты доставки. Тоже плитки — раньше был обычный select. */
const TIME_SLOT_OPTIONS: { value: string; label: string }[] = [
    { value: '08:00-12:00', label: '8:00–12:00' },
    { value: '12:00-18:00', label: '12:00–18:00' },
    { value: '18:00-22:00', label: '18:00–22:00' },
]

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

// ---- Добавление позиций в заказ ----
//
// Раньше — обычная модалка с одиночным `<select>` + textarea. После встречи с
// Мишей (11 мая) переделано на iiko-style: плитки типов с цветным фоном
// (хэш названия), оператор кликает несколько раз — формируется «корзина»
// позиций внизу. Один клик «Добавить N позиций» добавляет все разом
// (последовательные API-вызовы). Описание дописывается уже в раскрытых
// строках заказа (см. Спринт A.4 — позиции после добавления раскрываются).
export function AddItemModal({
  orderId, itemTypes, onClose, onAdded,
}: {
  orderId: number
  itemTypes: ItemType[]
  onClose: () => void
  /** Вызывается ОДИН раз после успешного добавления всей корзины. */
  onAdded: (newItemIds: number[]) => void
}) {
  // V10: все типы выбираемые — авто-добавление вынесено на уровень SKU (is_auto_add).
  const selectableTypes = itemTypes

  // «Корзина» — список item_type_id, по одному на каждый клик. Если оператор
  // нажал «Ковёр» три раза — в корзине три отдельных ID (дальше создаются
  // три позиции, каждой можно дать своё описание).
  const [cart, setCart] = useState<number[]>([])
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const addToCart = (typeId: number) => {
    setCart(c => [...c, typeId])
  }

  const removeFromCart = (idx: number) => {
    setCart(c => c.filter((_, i) => i !== idx))
  }

  const submit = async () => {
    if (cart.length === 0) { setError('Кликните по типу позиции, чтобы добавить'); return }
    setLoading(true)
    try {
      const createdIds: number[] = []
      for (const typeId of cart) {
        // Описание не заполняем здесь — Миша рекомендовал дописывать в раскрытой
        // строке заказа после добавления. Поле опциональное.
        const item: OrderItem = await addOrderItem(orderId, { item_type_id: typeId, description: '' })
        createdIds.push(item.id)
      }
      onAdded(createdIds)
    } catch {
      setError('Ошибка при добавлении одной из позиций — попробуйте ещё раз')
    } finally {
      setLoading(false)
    }
  }

  // Счётчики по типам — отображаем рядом с плиткой, чтобы оператор видел,
  // сколько он уже накликал каждого типа без скролла к «корзине» внизу.
  const countByType: Record<number, number> = {}
  for (const id of cart) countByType[id] = (countByType[id] || 0) + 1

  return (
    <div className="modal-overlay" onClick={() => {
      if (cart.length > 0 && !confirm('Отменить добавление? Накопленные позиции пропадут.')) return
      onClose()
    }}>
      {/* Крупнее: maxWidth 720 + увеличенные плитки. Фидбэк пользователя 11 мая
          «сам pop up давай крупнее». */}
      <div className="modal" onClick={e => e.stopPropagation()} style={{ maxHeight: '90vh', overflowY: 'auto', maxWidth: 720, width: '90%' }}>
        <h2 style={{ marginTop: 0 }}>Добавить позиции</h2>
        <p style={{ margin: '0 0 14px', color: '#7f8c8d', fontSize: '0.9em' }}>
          Кликайте по типам — формируется список. Описание, дефекты и размеры заполните в раскрытой строке заказа.
        </p>

        {/* Сетка плиток-типов. Цвет каждой — мягкий пастельный HSL по хэшу названия,
            чтобы операторы тыкали по цвету, не вчитываясь в текст. */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))',
          gap: 10,
          marginBottom: 16,
        }}>
          {selectableTypes.length === 0 ? (
            <div style={{ gridColumn: '1 / -1', color: '#7f8c8d' }}>Нет доступных типов</div>
          ) : selectableTypes.map(t => {
            const c = hashColor(t.name)
            const count = countByType[t.id] || 0
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => addToCart(t.id)}
                style={{
                  position: 'relative',
                  padding: '20px 12px',
                  minWidth: 120,
                  minHeight: 70,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  textAlign: 'center' as const,
                  borderRadius: 10,
                  border: count > 0 ? `2px solid ${c.text}` : '1px solid #d6dbdf',
                  background: c.bg,
                  color: c.text,
                  cursor: 'pointer',
                  fontSize: 16,
                  fontWeight: 600,
                  transition: 'transform 0.08s, box-shadow 0.15s',
                  boxShadow: count > 0 ? `0 0 0 3px ${c.bg}` : 'none',
                }}
                onMouseDown={e => (e.currentTarget.style.transform = 'scale(0.97)')}
                onMouseUp={e => (e.currentTarget.style.transform = 'scale(1)')}
                onMouseLeave={e => (e.currentTarget.style.transform = 'scale(1)')}
              >
                {t.name}
                {count > 0 && (
                  <span style={{
                    position: 'absolute', top: 4, right: 6,
                    background: c.text, color: '#fff',
                    borderRadius: 10, padding: '0 7px',
                    fontSize: 12, fontWeight: 700,
                  }}>
                    ×{count}
                  </span>
                )}
              </button>
            )
          })}
        </div>

        {/* Корзина выбранных позиций. Видно каждую отдельно, чтобы оператор
            мог одну удалить (если ошибочно кликнул). */}
        {cart.length > 0 && (
          <div style={{
            background: '#f8f9fa', borderRadius: 6, padding: '10px 12px',
            marginBottom: 12, maxHeight: 200, overflowY: 'auto',
          }}>
            <div style={{ fontSize: '0.85em', color: '#7f8c8d', marginBottom: 6 }}>
              Будут добавлены ({cart.length}):
            </div>
            {cart.map((typeId, idx) => {
              const t = selectableTypes.find(x => x.id === typeId)
              return (
                <div key={idx} style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '4px 0',
                }}>
                  <span>{idx + 1}. {t?.name || `Тип #${typeId}`}</span>
                  <button
                    type="button"
                    onClick={() => removeFromCart(idx)}
                    title="Убрать"
                    // tabIndex=-1: при Tab оператор сразу попадает на «Завершить»,
                    // не пробегая через крестики у каждой строки.
                    tabIndex={-1}
                    style={{
                      background: 'none', border: 'none', color: '#e74c3c',
                      cursor: 'pointer', fontSize: 18, lineHeight: 1, padding: '0 4px',
                    }}
                  >×</button>
                </div>
              )
            })}
          </div>
        )}

        {error && <div className="error-msg">{error}</div>}
        {/* Фидбэк 11 мая: «кнопки на второй строке другого размера». Задаём явный
            размер шрифта, padding и flex — чтобы btn-secondary и btn-primary
            (у них немного разный padding в index.css) выровнялись. */}
        <div className="modal-actions" style={{ display: 'flex', gap: 10 }}>
          <button
            className="btn-secondary"
            onClick={onClose}
            style={{ flex: 1, padding: '12px 16px', fontSize: 15 }}
          >Отмена</button>
          <button
            className="btn-primary"
            onClick={submit}
            disabled={loading || cart.length === 0}
            style={{ flex: 2, padding: '12px 16px', fontSize: 15 }}
          >
            {loading
              ? 'Добавление...'
              : cart.length === 0
                ? 'Завершить'
                : `Добавить ${cart.length} ${cart.length === 1 ? 'позицию' : pluralPositions(cart.length)}`}
          </button>
        </div>
      </div>
    </div>
  )
}

/** Склонение «позиции/позиций». Маленький хелпер чтобы кнопка читалась по-русски. */
function pluralPositions(n: number): string {
  const mod10 = n % 10
  const mod100 = n % 100
  if (mod10 === 1 && mod100 !== 11) return 'позицию'
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return 'позиции'
  return 'позиций'
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
          <Tiles<PaymentType>
            options={PAYMENT_OPTIONS}
            value={paymentType}
            onChange={setPaymentType}
          />
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
          <Tiles<string>
            options={TIME_SLOT_OPTIONS}
            value={slot || null}
            onChange={setSlot}
            nullLabel="— не указан —"
            onNull={() => setSlot('')}
          />
        </div>
        <div className="form-group">
          <label>Тип оплаты *</label>
          <Tiles<PaymentType>
            options={PAYMENT_OPTIONS}
            value={paymentType}
            onChange={setPaymentType}
          />
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
