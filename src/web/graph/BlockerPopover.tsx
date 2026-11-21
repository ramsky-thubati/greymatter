import * as Popover from '@radix-ui/react-popover'
import { useEffect, useMemo, useState } from 'react'
import type { Graph, GraphTask } from '../../core/graph.js'
import { api } from '../api.js'
import { blocks, findTask, taskLabel } from '../blockers.js'
import { errorText } from '../errors.js'
import { ConfirmAlert } from '../ui/ConfirmAlert.js'
import { CloseIcon } from '../ui/icons.js'
import { STATE_LABEL, StatusDot } from '../ui/StatusDot.js'
import { useToast } from '../ui/Toast.js'

interface Link {
  task: GraphTask
  blocker: GraphTask
  other: GraphTask
}

export function BlockerPopover({
  projectId,
  graph,
  num,
  anchor,
  onOpenTask,
  onClose,
}: {
  projectId: number
  graph: Graph
  num: number
  anchor: HTMLElement
  onOpenTask(num: number): void
  onClose(): void
}) {
  const toast = useToast()
  const [confirm, setConfirm] = useState<Link | null>(null)
  const anchorRef = useMemo(() => ({ current: anchor }), [anchor])
  const self = findTask(graph, num)
  const empty = !self || (self.blockedBy.length === 0 && blocks(graph, num).length === 0)

  useEffect(() => {
    if (empty || !anchor.isConnected) onClose()
  })

  if (!self) return null

  const blockedBy = self.blockedBy.flatMap((n) => {
    const other = findTask(graph, n)
    return other ? [{ task: self, blocker: other, other }] : []
  })
  const blocking = blocks(graph, num).map((other) => ({ task: other, blocker: self, other }))

  const remove = async (l: Link) => {
    setConfirm(null)
    try {
      await api.removeBlocker(projectId, taskLabel(l.task.num), taskLabel(l.blocker.num))
    } catch (e) {
      toast.error(errorText(e))
    }
  }

  const section = (title: string, links: Link[]) =>
    links.length > 0 && (
      <section>
        <h3 className="dep-title">{title}</h3>
        <ul className="dep-list">
          {links.map((l) => (
            <li key={l.other.num} className="dep-row">
              <button
                type="button"
                className="dep-name"
                onClick={() => {
                  onClose()
                  onOpenTask(l.other.num)
                }}
              >
                <StatusDot state={l.other.state} />
                <span className="dep-title-text">{l.other.title}</span>
                <span className="dep-st">{STATE_LABEL[l.other.state]}</span>
              </button>
              <button
                type="button"
                className="btn flat circular"
                aria-label={`Remove dependency on ${l.other.title}`}
                title="Remove dependency"
                onClick={() => setConfirm(l)}
              >
                <CloseIcon />
              </button>
            </li>
          ))}
        </ul>
      </section>
    )

  return (
    <>
      <Popover.Root open onOpenChange={(open) => !open && !confirm && onClose()}>
        <Popover.Anchor virtualRef={anchorRef} />
        <Popover.Portal>
          <Popover.Content
            className="popover dep-pop"
            side="bottom"
            align="start"
            sideOffset={6}
            collisionPadding={16}
            aria-label={`Dependencies of ${taskLabel(num)}`}
          >
            {section('Blocked by', blockedBy)}
            {section('Blocks', blocking)}
          </Popover.Content>
        </Popover.Portal>
      </Popover.Root>
      {confirm && (
        <ConfirmAlert
          title="Remove dependency?"
          body={`“${confirm.task.title}” will no longer be blocked by “${confirm.blocker.title}”.`}
          confirmLabel="Remove"
          destructive
          onConfirm={() => void remove(confirm)}
          onCancel={() => setConfirm(null)}
        />
      )}
    </>
  )
}
