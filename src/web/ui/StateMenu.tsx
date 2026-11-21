import * as Menu from '@radix-ui/react-dropdown-menu'
import type { ReactNode } from 'react'
import type { TaskState } from '../../core/types.js'
import { CheckIcon } from './icons.js'
import { STATE_LABEL, STATES, StatusDot } from './StatusDot.js'

export function StateMenu({
  value,
  onChange,
  trigger,
}: {
  value: TaskState
  onChange(s: TaskState): void
  trigger: ReactNode
}) {
  return (
    <Menu.Root modal={false}>
      <Menu.Trigger asChild>{trigger}</Menu.Trigger>
      <Menu.Portal>
        <Menu.Content className="menu" align="start" sideOffset={4}>
          <Menu.RadioGroup value={value} onValueChange={(v) => onChange(v as TaskState)}>
            {STATES.map((s) => (
              <Menu.RadioItem key={s} value={s} className="menu-item">
                <StatusDot state={s} />
                {STATE_LABEL[s]}
                <Menu.ItemIndicator className="end">
                  <CheckIcon />
                </Menu.ItemIndicator>
              </Menu.RadioItem>
            ))}
          </Menu.RadioGroup>
        </Menu.Content>
      </Menu.Portal>
    </Menu.Root>
  )
}
