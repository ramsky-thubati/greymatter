import * as Menu from '@radix-ui/react-dropdown-menu'
import type { ProjectStatus } from '../core/types.js'
import { MoreIcon } from './ui/icons.js'

export function ProjectMenu({
  status,
  onStatus,
  onDelete,
}: {
  status: ProjectStatus
  onStatus(s: ProjectStatus): void
  onDelete(): void
}) {
  return (
    <Menu.Root modal={false}>
      <Menu.Trigger asChild>
        <button type="button" className="btn flat" aria-label="Project menu">
          <MoreIcon />
        </button>
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Content className="menu" align="end" sideOffset={4}>
          {status === 'complete' ? (
            <Menu.Item className="menu-item" onSelect={() => onStatus('in_progress')}>
              Mark as In Progress
            </Menu.Item>
          ) : (
            <Menu.Item className="menu-item" onSelect={() => onStatus('complete')}>
              Mark as Complete
            </Menu.Item>
          )}
          <Menu.Separator className="menu-sep" />
          <Menu.Item className="menu-item danger" onSelect={onDelete}>
            Delete Project
          </Menu.Item>
        </Menu.Content>
      </Menu.Portal>
    </Menu.Root>
  )
}
