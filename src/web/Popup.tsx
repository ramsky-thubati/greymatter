import { useEffect, useId, useRef, type ReactNode } from 'react'

export function Popup({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  const titleId = useId()
  const dialog = useRef<HTMLDivElement>(null)

  useEffect(() => {
    dialog.current?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div
      className="backdrop"
      data-testid="popup-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div ref={dialog} className="popup" role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1}>
        <h2 id={titleId}>{title}</h2>
        {children}
      </div>
    </div>
  )
}

export function errorText(e: unknown): string {
  if (e && typeof e === 'object' && 'message' in e && typeof e.message === 'string' && e.message) return e.message
  return String(e)
}

export function ErrorLine({ message }: { message: string | null }) {
  return message ? (
    <p className="popup-error" role="alert">
      {message}
    </p>
  ) : null
}

interface Conflict {
  status?: number
  details?: { dependents?: number[]; forkedBranches?: number[] }
}

export type DeleteOutcome = { kind: 'dependents'; message: string } | { kind: 'error'; message: string }

export function deleteOutcome(e: unknown, branchName: (id: number) => string): DeleteOutcome {
  const c = e as Conflict | null
  if (c?.status === 409 && c.details?.forkedBranches?.length) {
    const lines = c.details.forkedBranches.map(
      (id) => `Branch ${branchName(id)} forks from this task. Move or delete it first.`,
    )
    return { kind: 'error', message: lines.join('\n') }
  }
  if (c?.status === 409 && c.details?.dependents?.length) {
    const ids = c.details.dependents.map((n) => `T-${n}`).join(', ')
    const verb = c.details.dependents.length === 1 ? 'waits' : 'wait'
    return { kind: 'dependents', message: `${ids} ${verb} on this task. Delete anyway?` }
  }
  return { kind: 'error', message: errorText(e) }
}
