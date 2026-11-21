import * as D from '@radix-ui/react-dialog'
import { type ReactNode, useState } from 'react'
import { ConfirmAlert } from './ConfirmAlert.js'
import { CloseIcon } from './icons.js'

export function Dialog({
  title,
  headerStart,
  dirty,
  onClose,
  footerStart,
  footerEnd,
  children,
}: {
  title?: ReactNode
  headerStart?: ReactNode
  dirty: boolean
  onClose(): void
  footerStart?: ReactNode
  footerEnd?: ReactNode
  children: ReactNode
}) {
  const [asking, setAsking] = useState(false)
  const requestClose = () => (dirty ? setAsking(true) : onClose())
  const guard = (e: Event) => {
    e.preventDefault()
    requestClose()
  }
  return (
    <D.Root open onOpenChange={(open) => !open && requestClose()}>
      <D.Portal>
        <D.Overlay className="dim" />
        <D.Content
          className="dlg"
          aria-describedby={undefined}
          onEscapeKeyDown={guard}
          onPointerDownOutside={guard}
          onInteractOutside={(e) => e.preventDefault()}
        >
          <div className="headerbar">
            <div className="hb-start">
              {headerStart}
              {title !== undefined ? (
                <D.Title className="dlg-heading">{title}</D.Title>
              ) : (
                <D.Title className="sr-only">Dialog</D.Title>
              )}
            </div>
            <span />
            <button type="button" className="btn flat circular" aria-label="Close" onClick={requestClose}>
              <CloseIcon />
            </button>
          </div>
          <div className="dlg-body">
            {children}
            {(footerStart || footerEnd) && (
              <div className="dlg-footer">
                {footerStart ?? <span />}
                {footerEnd}
              </div>
            )}
          </div>
        </D.Content>
      </D.Portal>
      {asking && (
        <ConfirmAlert
          title="Discard changes?"
          body="Your edits haven't been saved."
          confirmLabel="Discard"
          cancelLabel="Keep editing"
          destructive
          onConfirm={() => {
            setAsking(false)
            onClose()
          }}
          onCancel={() => setAsking(false)}
        />
      )}
    </D.Root>
  )
}
