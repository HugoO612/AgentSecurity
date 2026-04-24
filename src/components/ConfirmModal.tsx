import type { PropsWithChildren, ReactNode } from 'react'

type ConfirmModalProps = PropsWithChildren<{
  title: string
  body: ReactNode
  confirmLabel: string
  cancelLabel: string
  note?: ReactNode
  confirmDisabled?: boolean
  onConfirm: () => void
  onCancel: () => void
}>

export function ConfirmModal({
  title,
  body,
  confirmLabel,
  cancelLabel,
  note,
  confirmDisabled,
  onConfirm,
  onCancel,
  children,
}: ConfirmModalProps) {
  return (
    <div className="modal-backdrop" role="presentation">
      <div
        aria-modal="true"
        className="modal-card"
        role="dialog"
        aria-labelledby="modal-title"
      >
        <h3 id="modal-title">{title}</h3>
        <p>{body}</p>
        {note ? <div className="modal-note">{note}</div> : null}
        {children}
        <div className="action-row">
          <button type="button" className="ghost-button" onClick={onCancel}>
            {cancelLabel}
          </button>
          <button
            type="button"
            className="primary-button"
            disabled={confirmDisabled}
            onClick={onConfirm}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
