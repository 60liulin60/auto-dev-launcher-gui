import React, {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  ReactNode,
} from 'react'
import ModalDialog from '../components/ModalDialog'

type DialogKind = 'alert' | 'confirm'
type DialogTone = 'default' | 'danger'

interface DialogOptions {
  title?: string
  confirmText?: string
  cancelText?: string
  tone?: DialogTone
}

interface DialogState {
  kind: DialogKind
  message: string
  title: string
  confirmText: string
  cancelText: string
  tone: DialogTone
}

interface DialogContextType {
  showAlert: (message: string, options?: DialogOptions) => Promise<void>
  showConfirm: (message: string, options?: DialogOptions) => Promise<boolean>
}

const DialogContext = createContext<DialogContextType | undefined>(undefined)

const DEFAULT_ALERT_TITLE = '提示'
const DEFAULT_CONFIRM_TITLE = '确认操作'
const DEFAULT_CONFIRM_TEXT = '确定'
const DEFAULT_CANCEL_TEXT = '取消'

interface DialogProviderProps {
  children: ReactNode
}

export const DialogProvider: React.FC<DialogProviderProps> = ({ children }) => {
  const [dialog, setDialog] = useState<DialogState | null>(null)

  // Resolve the pending promise when the user closes the dialog.
  const resolverRef = useRef<((confirmed: boolean) => void) | null>(null)

  const closeWith = useCallback((confirmed: boolean) => {
    const resolver = resolverRef.current
    resolverRef.current = null
    setDialog(null)
    resolver?.(confirmed)
  }, [])

  const showAlert = useCallback((message: string, options?: DialogOptions) => {
    return new Promise<void>((resolve) => {
      resolverRef.current = () => resolve()
      setDialog({
        kind: 'alert',
        message,
        title: options?.title ?? DEFAULT_ALERT_TITLE,
        confirmText: options?.confirmText ?? '知道了',
        cancelText: options?.cancelText ?? DEFAULT_CANCEL_TEXT,
        tone: options?.tone ?? 'default',
      })
    })
  }, [])

  const showConfirm = useCallback((message: string, options?: DialogOptions) => {
    return new Promise<boolean>((resolve) => {
      resolverRef.current = (confirmed) => resolve(confirmed)
      setDialog({
        kind: 'confirm',
        message,
        title: options?.title ?? DEFAULT_CONFIRM_TITLE,
        confirmText: options?.confirmText ?? DEFAULT_CONFIRM_TEXT,
        cancelText: options?.cancelText ?? DEFAULT_CANCEL_TEXT,
        tone: options?.tone ?? 'default',
      })
    })
  }, [])

  const contextValue = useMemo<DialogContextType>(
    () => ({ showAlert, showConfirm }),
    [showAlert, showConfirm]
  )

  return (
    <DialogContext.Provider value={contextValue}>
      {children}
      {dialog && (
        <ModalDialog
          kind={dialog.kind}
          title={dialog.title}
          message={dialog.message}
          confirmText={dialog.confirmText}
          cancelText={dialog.cancelText}
          tone={dialog.tone}
          onConfirm={() => closeWith(true)}
          onCancel={() => closeWith(false)}
        />
      )}
    </DialogContext.Provider>
  )
}

export const useDialog = (): DialogContextType => {
  const context = useContext(DialogContext)
  if (context === undefined) {
    throw new Error('useDialog must be used within a DialogProvider')
  }
  return context
}
