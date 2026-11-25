import React, { useCallback, useEffect, useRef } from 'react'

type DialogKind = 'alert' | 'confirm'
type DialogTone = 'default' | 'danger'

interface ModalDialogProps {
  kind: DialogKind
  title: string
  message: string
  confirmText: string
  cancelText: string
  tone: DialogTone
  onConfirm: () => void
  onCancel: () => void
}

const ModalDialog: React.FC<ModalDialogProps> = ({
  kind,
  title,
  message,
  confirmText,
  cancelText,
  tone,
  onConfirm,
  onCancel,
}) => {
  const confirmButtonRef = useRef<HTMLButtonElement | null>(null)

  // Focus the primary action on open (and whenever a queued dialog replaces this one).
  useEffect(() => {
    confirmButtonRef.current?.focus()
  }, [kind, title, message])

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onCancel()
      }
      // Enter is left to the focused button's native activation: confirming on
      // Enter regardless of focus made "Cancel" trigger the destructive action.
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onCancel])

  // Only dismiss when the backdrop itself is clicked, not the dialog body.
  const handleOverlayClick = useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      if (event.target === event.currentTarget) {
        onCancel()
      }
    },
    [onCancel]
  )

  const confirmClassName =
    tone === 'danger' ? 'btn-danger modal-action' : 'btn-primary modal-action'

  return (
    <div
      className="modal-overlay"
      role="presentation"
      onClick={handleOverlayClick}
    >
      <div
        className="modal-dialog"
        role={kind === 'confirm' ? 'alertdialog' : 'dialog'}
        aria-modal="true"
        aria-labelledby="modal-title"
        aria-describedby="modal-message"
      >
        <h2 id="modal-title" className="modal-title">
          {title}
        </h2>
        <p id="modal-message" className="modal-message">
          {message}
        </p>
        <div className="modal-actions">
          {kind === 'confirm' && (
            <button
              type="button"
              className="btn-secondary modal-action"
              onClick={onCancel}
            >
              {cancelText}
            </button>
          )}
          <button
            ref={confirmButtonRef}
            type="button"
            className={confirmClassName}
            onClick={onConfirm}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  )
}

export default ModalDialog
