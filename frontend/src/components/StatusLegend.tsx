import { useState } from 'react'

/**
 * Раскрывающаяся «памятка» по статусам — что означает каждый статус
 * и когда он ставится автоматически. Висит рядом с бейджем статуса.
 *
 * Закрыта по умолчанию. По клику разворачивается прямо под собой.
 */

interface StatusInfo {
  status: string
  label: string
  color: string
  description: string
  /** Как переходит в этот статус: вручную / автоматически. */
  trigger: 'manual' | 'auto' | 'payment'
}

const ORDER_STATUSES: StatusInfo[] = [
  { status: 'LEAD',           label: 'Лид',             color: '#7f8c8d',
    description: 'Первичное обращение клиента. Цены ещё не зафиксированы.',
    trigger: 'manual' },
  { status: 'CREATED',        label: 'Создан',          color: '#27ae60',
    description: 'Заказ оформлен и принят. Пора назначать забор.',
    trigger: 'manual' },
  { status: 'FOR_PICKUP',     label: 'К забору',        color: '#17a2b8',
    description: 'Заказ ожидает забора (дата назначена).',
    trigger: 'manual' },
  { status: 'IN_PROGRESS',    label: 'В работе',        color: '#2980b9',
    description: 'Хотя бы одна услуга в работе. Ставится автоматически.',
    trigger: 'auto' },
  { status: 'PARTIALLY_DONE', label: 'Частично готов',  color: '#856404',
    description: 'Часть услуг готова, остальные ещё в работе. Авто.',
    trigger: 'auto' },
  { status: 'DONE',           label: 'Готов',           color: '#155724',
    description: 'Все услуги выполнены. Можно везти клиенту. Авто.',
    trigger: 'auto' },
  { status: 'DELIVERED',      label: 'Доставлен',       color: '#004085',
    description: 'Заказ доставлен клиенту. Можно оплачивать.',
    trigger: 'manual' },
  { status: 'COMPLETED',      label: 'Завершён',        color: '#2c3e50',
    description: 'Оплачен и закрыт. Изменения запрещены, можно только дубль или гарантию.',
    trigger: 'payment' },
  { status: 'CANCELLED',      label: 'Отменён',         color: '#721c24',
    description: 'Заказ отменён с указанием причины.',
    trigger: 'manual' },
]

const TRIGGER_LABELS: Record<string, string> = {
  manual:  'вручную',
  auto:    'автоматически',
  payment: 'после оплаты',
}

export default function StatusLegend() {
  const [open, setOpen] = useState(false)
  return (
    <div style={{ display: 'inline-block', position: 'relative' }}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        title="Памятка: что означает каждый статус"
        style={{
          background: 'none', border: '1px solid #bdc3c7', borderRadius: 4,
          color: '#7f8c8d', cursor: 'pointer', padding: '2px 8px', fontSize: '0.78em',
          marginLeft: 8,
        }}
      >
        ? памятка
      </button>
      {open && (
        <div
          onMouseLeave={() => setOpen(false)}
          style={{
            position: 'absolute', top: '100%', left: 0, marginTop: 4, zIndex: 50,
            background: '#fff', border: '1px solid #ddd', borderRadius: 6,
            boxShadow: '0 4px 16px rgba(0,0,0,0.12)', padding: 12,
            minWidth: 380, maxWidth: 480,
          }}
        >
          <div style={{ fontSize: '0.85em', color: '#555', marginBottom: 8 }}>
            Какой статус что значит и как ставится:
          </div>
          {ORDER_STATUSES.map(s => (
            <div key={s.status} style={{ display: 'flex', gap: 8, marginBottom: 6, alignItems: 'flex-start' }}>
              <span className={`badge badge-${s.status.toLowerCase()}`} style={{ flexShrink: 0, minWidth: 110, textAlign: 'center' }}>
                {s.label}
              </span>
              <div style={{ fontSize: '0.85em' }}>
                <span style={{ color: '#333' }}>{s.description}</span>
                <span style={{ color: '#95a5a6', marginLeft: 4 }}>· {TRIGGER_LABELS[s.trigger]}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
