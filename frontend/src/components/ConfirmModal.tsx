interface ConfirmModalProps {
  title: string
  message: string
  onConfirm: () => void
  onCancel: () => void
  confirmText?: string
  cancelText?: string
  danger?: boolean
}

export default function ConfirmModal({ title, message, onConfirm, onCancel, confirmText = 'Подтвердить', cancelText = 'Отмена', danger }: ConfirmModalProps) {
  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 400 }}>
        <h2>{title}</h2>
        <p style={{ color: '#555', marginBottom: 16 }}>{message}</p>
        <div className="modal-actions">
          <button className="btn-secondary" onClick={onCancel}>{cancelText}</button>
          <button className={danger ? 'btn-danger' : 'btn-primary'} onClick={onConfirm}>{confirmText}</button>
        </div>
      </div>
    </div>
  )
}
