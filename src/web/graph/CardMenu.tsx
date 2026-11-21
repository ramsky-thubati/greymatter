import * as CM from '@radix-ui/react-context-menu'
import type { ReactNode } from 'react'
import type { TaskState } from '../../core/types.js'
import type { DeleteTarget } from '../impact.js'
import { CheckIcon, ChevronRightIcon } from '../ui/icons.js'
import { STATE_LABEL, STATES, StatusDot } from '../ui/StatusDot.js'

export function CardMenu({
  num,
  state,
  onState,
  onNewBranch,
  onDelete,
  children,
}: {
  num: number
  state: TaskState
  onState(num: number, s: TaskState): void
  onNewBranch(fromTask: number): void
  onDelete(target: DeleteTarget): void
  children: ReactNode
}) {
  return (
    <CM.Root modal={false}>
      <CM.Trigger asChild>{children}</CM.Trigger>
      <CM.Portal>
        <CM.Content className="menu">
          <CM.Sub>
            <CM.SubTrigger className="menu-item">
              Status
              <span className="end">
                <ChevronRightIcon />
              </span>
            </CM.SubTrigger>
            <CM.Portal>
              <CM.SubContent className="menu" sideOffset={6}>
                <CM.RadioGroup value={state} onValueChange={(v) => onState(num, v as TaskState)}>
                  {STATES.map((s) => (
                    <CM.RadioItem key={s} value={s} className="menu-item">
                      <StatusDot state={s} />
                      {STATE_LABEL[s]}
                      <CM.ItemIndicator className="end">
                        <CheckIcon />
                      </CM.ItemIndicator>
                    </CM.RadioItem>
                  ))}
                </CM.RadioGroup>
              </CM.SubContent>
            </CM.Portal>
          </CM.Sub>
          <CM.Item className="menu-item" onSelect={() => onNewBranch(num)}>
            Branch from here
          </CM.Item>
          <CM.Separator className="menu-sep" />
          <CM.Item className="menu-item danger" onSelect={() => onDelete({ kind: 'task', num })}>
            Delete
          </CM.Item>
        </CM.Content>
      </CM.Portal>
    </CM.Root>
  )
}

export function CanvasMenu({ onNewBranch, children }: { onNewBranch(): void; children: ReactNode }) {
  return (
    <CM.Root modal={false}>
      <CM.Trigger asChild>{children}</CM.Trigger>
      <CM.Portal>
        <CM.Content className="menu">
          <CM.Item className="menu-item" onSelect={onNewBranch}>
            New branch
          </CM.Item>
        </CM.Content>
      </CM.Portal>
    </CM.Root>
  )
}
