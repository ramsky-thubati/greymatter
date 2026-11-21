import type { Graph, GraphTask } from '../../core/graph.js'
import { FLAGGED_NOTE, hasFork, showsFlag, showsPadlock, taskLabel } from '../blockers.js'
import { BranchIcon, FlagIcon, PadlockIcon, WarnIcon } from '../ui/icons.js'
import { StatusDot } from '../ui/StatusDot.js'

export function TaskCard({
  task,
  graph,
  x,
  y,
  onOpen,
  onBlockerIcon,
  activeIcon,
}: {
  task: GraphTask
  graph: Graph
  x: number
  y: number
  onOpen(num: number): void
  onBlockerIcon(num: number, anchor: HTMLElement): void
  activeIcon?: boolean
}) {
  const classes = ['card']
  if (task.state === 'in_progress') classes.push('in-progress')
  if (task.state === 'cancelled') classes.push('cancelled')
  const padlock = showsPadlock(graph, task)
  const flag = showsFlag(graph, task)
  const iconClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation()
    onBlockerIcon(task.num, e.currentTarget)
  }

  return (
    <div
      role="button"
      tabIndex={0}
      data-task={taskLabel(task.num)}
      className={classes.join(' ')}
      style={{ left: `${x}rem`, top: `${y}rem` }}
      onClick={() => onOpen(task.num)}
      onKeyDown={(e) => {
        if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) {
          e.preventDefault()
          onOpen(task.num)
        }
      }}
    >
      <div className="top">
        <span className="id">
          <StatusDot state={task.state} />
          {taskLabel(task.num)}
        </span>
        <span className="icons">
          {task.flagged && (
            <span className="warn" title={FLAGGED_NOTE} role="img" aria-label={FLAGGED_NOTE}>
              <WarnIcon />
            </span>
          )}
          {padlock && (
            <button
              type="button"
              className={activeIcon ? 'ico active' : 'ico'}
              aria-label="Blocked"
              title="Blocked"
              onClick={iconClick}
            >
              <PadlockIcon />
            </button>
          )}
          {flag && (
            <button
              type="button"
              className={activeIcon ? 'ico active' : 'ico'}
              aria-label="Blocks another task"
              title="Blocks another task"
              onClick={iconClick}
            >
              <FlagIcon />
            </button>
          )}
        </span>
      </div>
      <div className="title">{task.title}</div>
      {hasFork(graph, task.num) && (
        <span className="branch-ind" role="img" aria-label="Has a branch" title="Has a branch">
          <BranchIcon />
        </span>
      )}
    </div>
  )
}
