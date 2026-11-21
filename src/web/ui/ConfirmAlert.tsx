import * as AlertDialog from '@radix-ui/react-alert-dialog'
import type { ReactNode } from 'react'

export function ConfirmAlert({
  title,
  body,
  confirmLabel,
  cancelLabel = 'Cancel',
  destructive,
  onConfirm,
  onCancel,
}: {
  title: string
  body?: ReactNode
  confirmLabel: string
  cancelLabel?: string | null
  destructive?: boolean
  onConfirm(): void
  onCancel(): void
}) {
  return (
    <AlertDialog.Root open onOpenChange={(open) => !open && onCancel()}>
      <AlertDialog.Portal>
        <AlertDialog.Overlay className="dim alert-dim" />
        <AlertDialog.Content className="alert">
          <AlertDialog.Title>{title}</AlertDialog.Title>
          <AlertDialog.Description asChild>
            <div className="alert-body">{body}</div>
          </AlertDialog.Description>
          <div className="btns">
            {cancelLabel !== null && (
              <AlertDialog.Cancel className="btn" onClick={onCancel}>
                {cancelLabel}
              </AlertDialog.Cancel>
            )}
            <AlertDialog.Action
              className={destructive ? 'btn destructive' : 'btn suggested'}
              onClick={(e) => {
                e.preventDefault()
                onConfirm()
              }}
            >
              {confirmLabel}
            </AlertDialog.Action>
          </div>
        </AlertDialog.Content>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  )
}
