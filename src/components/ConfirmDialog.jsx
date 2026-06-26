import './ConfirmDialog.css'

/**
 * Modal de confirmação genérico, usado para exclusões e outras ações destrutivas.
 * Mostra uma prévia formatada do item afetado em vez de um window.confirm() genérico.
 */
export default function ConfirmDialog({
  title = 'Confirmar exclusão',
  message,
  preview, // { label, value, tone? } ou array delas
  confirmLabel = 'Excluir',
  danger = true,
  onConfirm,
  onCancel,
}) {
  const previews = Array.isArray(preview) ? preview : preview ? [preview] : []

  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal-card confirm-dialog-card" onClick={(e) => e.stopPropagation()}>
        <h2>{title}</h2>
        {message && <p className="modal-context">{message}</p>}

        {previews.length > 0 && (
          <div className="confirm-preview-box">
            {previews.map((p, i) => (
              <div key={i} className="confirm-preview-row">
                <span className="confirm-preview-label">{p.label}</span>
                <span className={'confirm-preview-value' + (p.tone ? ` confirm-preview-${p.tone}` : '')}>
                  {p.value}
                </span>
              </div>
            ))}
          </div>
        )}

        <div className="modal-actions">
          <button type="button" className="btn-secondary" onClick={onCancel}>Cancelar</button>
          <button
            type="button"
            className={danger ? 'btn-primary btn-danger' : 'btn-primary'}
            onClick={onConfirm}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
