import { useState } from 'react'
import { useEscapeClose } from '../hooks/useEscapeClose'

interface Props {
  title?: string
  /** Дополнительный поясняющий текст (что именно отменяем). */
  subject?: string
  /** Текст кнопки подтверждения. По умолчанию «Отменить» (сценарий отмены). */
  confirmLabel?: string
  /** Подсказка в поле причины — своя для каждого сценария. */
  placeholder?: string
  onConfirm: (reason: string) => void
  onCancel: () => void
}

const MIN_LEN = 10

/**
 * Модалка ввода обязательной причины. Используется и для отмены
 * (заказ/позиция/услуга), и для отката статуса — кнопка подтверждения
 * и плейсхолдер настраиваются пропсами.
 * Кнопка неактивна, пока причина короче 10 символов.
 */
export default function CancelReasonModal({
  title = 'Укажите причину отмены',
  subject,
  confirmLabel = 'Отменить',
  placeholder = 'Например: клиент отказался, ковёр уже отдан, ошибка при оформлении…',
  onConfirm,
  onCancel,
}: Props) {
  const [reason, setReason] = useState('')
  useEscapeClose(true, onCancel)

  const trimmed = reason.trim()
  const tooShort = trimmed.length < MIN_LEN

  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 480 }}>
        <h2 style={{ marginTop: 0 }}>{title}</h2>
        {subject && <p style={{ color: '#666', marginTop: 0 }}>{subject}</p>}
        <div className="form-group">
          <label>Причина (минимум {MIN_LEN} символов)</label>
          <textarea
            value={reason}
            onChange={e => setReason(e.target.value)}
            rows={3}
            autoFocus
            placeholder={placeholder}
          />
          <div style={{ fontSize: 'var(--font-sm)', color: tooShort ? '#e67e22' : '#27ae60', marginTop: 2 }}>
            {tooShort
              ? `Ещё минимум ${MIN_LEN - trimmed.length} символ(ов)`
              : 'Причина введена'}
          </div>
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
          <button className="btn-secondary" onClick={onCancel}>Назад</button>
          <button
            className="btn-danger"
            disabled={tooShort}
            onClick={() => onConfirm(trimmed)}
            title={tooShort ? `Введите минимум ${MIN_LEN} символов` : ''}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
