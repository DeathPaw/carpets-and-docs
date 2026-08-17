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
    // Слотов в справочнике на этот день нет (выходной либо их удалили).
    // Если у заказа уже проставлено время — обязательно показываем его, иначе
    // оператор видит пустой disabled-селект и не понимает, что время назначено.
    return (
      <select value={value} onChange={e => onChange(e.target.value)} disabled={disabled || !value}>
        <option value="">— в этот день доставки нет —</option>
        {value && <option value={value}>{value} · вне графика</option>}
      </select>
    )
  }

  const options: { value: string, label: string }[] = []
  for (const slot of daySlots) {
    // V28: слот с фиксированным временем (end_time = null) — «доставка строго к 15:00».
    // Дробить его на часовые подинтервалы нечего, это одна точка во времени.
    if (!slot.end_time) {
      options.push({
        value: slot.start_time,
        label: `к ${slot.start_time}${slot.label ? ' · ' + slot.label : ''}`,
      })
      continue
    }
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

  // Если у заказа уже сохранён слот, которого нет среди options (старые
  // захардкоженные 08:00-12:00 / 12:00-18:00 / 18:00-22:00 или удалённый из
  // справочника слот) — добавляем первой опцией, чтобы выбор отобразился и
  // не потерялся при сохранении формы. Формулировка та же, что в Логистике.
  if (value && !options.some(o => o.value === value)) {
    options.unshift({ value, label: `${value} · вне графика` })
  }

  return (
    <select value={value} onChange={e => onChange(e.target.value)} disabled={disabled}>
      <option value="">— не указан —</option>
      {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  )
}
