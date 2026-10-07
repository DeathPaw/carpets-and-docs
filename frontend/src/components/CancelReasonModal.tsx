import { useEffect, useState } from 'react'
import { useEscapeClose } from '../hooks/useEscapeClose'
import { getCancellationReasons } from '../api/references'
import type { CancellationReason } from '../types'

interface Props {
  title?: string
  /** Дополнительный поясняющий текст (что именно отменяем). */
  subject?: string
  /** Текст кнопки подтверждения. По умолчанию «Отменить» (сценарий отмены). */
  confirmLabel?: string
  /** Подсказка в поле причины — своя для каждого сценария. */
  placeholder?: string
  /**
   * Правка №3 (13.09): отмена ЗАКАЗА выбирается из справочника причин —
   * свободный текст не годился для аналитики. Для позиций, услуг и отката
   * статуса остаётся прежний ввод текстом.
   */
  useCatalog?: boolean
  /** code — код причины из справочника (только в режиме справочника). */
  onConfirm: (reason: string, code?: string) => void
  onCancel: () => void
}

const MIN_LEN = 10
/** В режиме справочника основное — выбранная причина, уточнение короче. */
const MIN_NOTE_LEN = 3

/**
 * Модалка ввода обязательной причины. Используется и для отмены
 * (заказ/позиция/услуга), и для отката статуса — кнопка подтверждения
 * и плейсхолдер настраиваются пропсами.
 */
export default function CancelReasonModal({
  title = 'Укажите причину отмены',
  subject,
  confirmLabel = 'Отменить',
  placeholder = 'Например: клиент отказался, ковёр уже отдан, ошибка при оформлении…',
  useCatalog = false,
  onConfirm,
  onCancel,
}: Props) {
  const [reason, setReason] = useState('')
  const [reasons, setReasons] = useState<CancellationReason[]>([])
  const [code, setCode] = useState('')
  useEscapeClose(true, onCancel)

  useEffect(() => {
    if (!useCatalog) return
    getCancellationReasons(true).then(list => {
      setReasons(list)
      // Первую причину не подставляем: оператор должен выбрать осознанно,
      // иначе в статистике окажется «не устроила цена» по умолчанию.
    }).catch(() => setReasons([]))
  }, [useCatalog])

  const trimmed = reason.trim()
  const selected = reasons.find(r => r.code === code)
  const needNote = !!selected?.requires_note
  const blocked = useCatalog
    ? (!selected || (needNote && trimmed.length < MIN_NOTE_LEN))
    : trimmed.length < MIN_LEN

  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 480 }}>
        <h2 style={{ marginTop: 0 }}>{title}</h2>
        {subject && <p style={{ color: '#666', marginTop: 0 }}>{subject}</p>}

        {useCatalog && (
          <div className="form-group">
            <label>Причина *</label>
            <select value={code} onChange={e => setCode(e.target.value)} autoFocus>
              <option value="">— выберите причину —</option>
              {reasons.map(r => (
                <option key={r.code} value={r.code}>{r.name}</option>
              ))}
            </select>
          </div>
        )}

        <div className="form-group">
          <label>
            {useCatalog
              ? (needNote ? 'Уточнение *' : 'Уточнение (необязательно)')
              : `Причина (минимум ${MIN_LEN} символов)`}
          </label>
          <textarea
            value={reason}
            onChange={e => setReason(e.target.value)}
            rows={3}
            autoFocus={!useCatalog}
            placeholder={useCatalog ? 'Подробности, если они есть' : placeholder}
          />
          {!useCatalog && (
            <div style={{ fontSize: 'var(--font-sm)', color: blocked ? '#e67e22' : '#27ae60', marginTop: 2 }}>
              {blocked
                ? `Ещё минимум ${MIN_LEN - trimmed.length} символ(ов)`
                : 'Причина введена'}
            </div>
          )}
          {useCatalog && needNote && trimmed.length < MIN_NOTE_LEN && (
            <div style={{ fontSize: 'var(--font-sm)', color: '#e67e22', marginTop: 2 }}>
              Для этой причины уточнение обязательно
            </div>
          )}
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
          <button className="btn-secondary" onClick={onCancel}>Назад</button>
          <button
            className="btn-danger"
            disabled={blocked}
            onClick={() => onConfirm(trimmed, useCatalog ? code : undefined)}
            title={blocked ? 'Заполните причину' : ''}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
