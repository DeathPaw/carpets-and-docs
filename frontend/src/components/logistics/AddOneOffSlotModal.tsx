import { useState } from 'react'
import { useEscapeClose } from '../../hooks/useEscapeClose'

/** Быстрые пресеты — большинство разовых слотов это утро/день. */
const PRESETS: { start: string; end: string; label: string }[] = [
  { start: '08:00', end: '12:00', label: 'Утро' },
  { start: '12:00', end: '17:00', label: 'День' },
  { start: '10:00', end: '20:30', label: 'Весь день' },
]

/**
 * V31: добавление временного слота ТОЛЬКО на выбранную дату.
 *
 * Обычные слоты справочника привязаны к дню недели и повторяются каждую неделю.
 * Здесь оператор заводит интервал разово — например «в эту среду ещё и утро», —
 * не меняя постоянное расписание. Слот появится только в этот день; в другие
 * среды и в другие недели он не попадёт.
 *
 * Можно завести и точное время («доставка строго к 15:00») — для этого нужно
 * снять галку «интервал», тогда конец не указывается.
 */
export default function AddOneOffSlotModal({ date, onClose, onSave }: {
  date: string
  onClose: () => void
  onSave: (start: string, end: string, label: string) => void | Promise<void>
}) {
  const [isRange, setIsRange] = useState(true)
  const [start, setStart] = useState('08:00')
  const [end, setEnd] = useState('12:00')
  const [label, setLabel] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  useEscapeClose(true, onClose)

  const humanDate = new Date(date).toLocaleDateString('ru', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  })

  const submit = async () => {
    if (!start) { setError('Укажите время начала'); return }
    if (isRange) {
      if (!end) { setError('Укажите время окончания'); return }
      if (end <= start) { setError('Окончание должно быть позже начала'); return }
    }
    setSaving(true)
    setError('')
    try {
      await onSave(start, isRange ? end : '', label)
    } catch (e: unknown) {
      setError((e as any)?.response?.data?.message || 'Не удалось добавить слот')
      setSaving(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 420 }}>
        <h2 style={{ marginTop: 0 }}>Новый слот на день</h2>
        <p style={{ color: '#666', marginTop: 0, fontSize: '0.92em' }}>
          {humanDate}. Слот появится только в этот день — постоянное расписание
          и другие недели не изменятся.
        </p>

        <div className="form-group">
          <label>Быстрый выбор</label>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {PRESETS.map(p => (
              <button
                key={p.label}
                type="button"
                className="btn-secondary btn-sm"
                onClick={() => { setIsRange(true); setStart(p.start); setEnd(p.end); setLabel(p.label) }}
              >{p.label} · {p.start}–{p.end}</button>
            ))}
          </div>
        </div>

        <div className="form-group">
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={isRange}
              onChange={e => setIsRange(e.target.checked)}
              style={{ width: 'auto' }}
            />
            Интервал времени (снимите — доставка строго ко времени)
          </label>
        </div>

        <div style={{ display: 'flex', gap: 10 }}>
          <div className="form-group" style={{ flex: 1 }}>
            <label>{isRange ? 'Начало *' : 'Время *'}</label>
            <input type="time" value={start} onChange={e => setStart(e.target.value)} />
          </div>
          {isRange && (
            <div className="form-group" style={{ flex: 1 }}>
              <label>Окончание *</label>
              <input type="time" value={end} onChange={e => setEnd(e.target.value)} />
            </div>
          )}
        </div>

        <div className="form-group">
          <label>Название (необязательно)</label>
          <input
            value={label}
            onChange={e => setLabel(e.target.value)}
            placeholder="Например: Утро"
          />
        </div>

        {error && <div className="error-msg">{error}</div>}

        <div className="modal-actions">
          <button className="btn-secondary" onClick={onClose}>Отмена</button>
          <button className="btn-primary" onClick={() => void submit()} disabled={saving}>
            {saving ? 'Добавление…' : 'Добавить слот'}
          </button>
        </div>
      </div>
    </div>
  )
}
