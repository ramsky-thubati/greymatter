import type { TaskState } from '../../core/types.js'

export const STATES: readonly TaskState[] = ['todo', 'in_progress', 'later', 'done', 'cancelled']

export const STATE_LABEL: Record<TaskState, string> = {
  todo: 'To do',
  in_progress: 'In progress',
  later: 'Later',
  done: 'Done',
  cancelled: 'Cancelled',
}

export function StatusDot({ state }: { state: TaskState }) {
  return <i className={`dot dot-${state}`} role="img" aria-label={STATE_LABEL[state]} />
}
