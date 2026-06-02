import { useEffect, useState } from 'react'
import { getDeliverySlots, type DeliverySlot } from '../api/deliverySlots'

/**
 * V18 + #4: выбор времени забора/доставки на основе справочника delivery_time_slots.
 * Подгружает активные слоты для дня недели выбранной даты + строит 1-часовые
 * подинтервалы внутри каждого слота — чтобы оператор мог указать более точное время.
 *
 * Если date пустая или для дня нет слотов (например воскресенье) — селект пустой
 * (это сигнал: «в этот день доставка не работает»).
 */
export default function TimeSlotSelect({
  value, onChange, date, disabled,
}: {
  value: string
  onChange: (v: string) => void
  /** ISO YYYY-MM-DD. По нему берётся день недели для фильтрации слотов. */
  date: string | null | undefined
  disabled?: boolean
}) {
  const [slots, setSlots] = useState<DeliverySlot[]>([])

  useEffect(() => {
    getDeliverySlots().then(setSlots).catch(() => setSlots([]))
  }, [])

  if (!date) {
    return (
      <select value={value} onChange={e => onChange(e.target.value)} disabled>
        <option value="">— сначала выберите дату —</option>
      </select>
    )
  }

  const dow = new Date(date).getDay() // 0=Вс
  const daySlots = slots.filter(s => s.day_of_week === dow)

  if (daySlots.length === 0) {
    return (
      <select value={value} onChange={e => onChange(e.target.value)} disabled>
        <option value="">— в этот день доставки нет —</option>
      </select>
    )
  }

  const options: { value: string, label: string }[] = []
  for (const slot of daySlots) {
    // Целиком: «весь слот»
    options.push({
      value: `${slot.start_time}-${slot.end_time}`,
      label: `${slot.start_time}–${slot.end_time}${slot.label ? ' · ' + slot.label : ''}`,
    })
    // Часовые подинтервалы: 17–18, 18–19, …
    const [sh, sm] = slot.start_time.split(':').map(Number)
    const [eh, em] = slot.end_time.split(':').map(Number)
    const startMin = sh * 60 + sm
    const endMin = eh * 60 + em
    const fmt = (m: number) =>
      `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
    let cur = startMin
    while (cur + 60 <= endMin) {
      const next = cur + 60
      options.push({ value: `${fmt(cur)}-${fmt(next)}`, label: `   ${fmt(cur)}–${fmt(next)} (1 ч)` })
      cur = next
    }
    if (cur < endMin) {
      options.push({ value: `${fmt(cur)}-${fmt(endMin)}`, label: `   ${fmt(cur)}–${fmt(endMin)}` })
    }
  }

  // Если у заказа уже сохранён слот, которого нет среди options (например, старый
  // формат "10:00-13:00") — добавляем как первую опцию, чтобы выбор отобразился.
  if (value && !options.some(o => o.value === value)) {
    options.unshift({ value, label: `${value} (нестандартный)` })
  }

  return (
    <select value={value} onChange={e => onChange(e.target.value)} disabled={disabled}>
      <option value="">— не указан —</option>
      {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  )
}
