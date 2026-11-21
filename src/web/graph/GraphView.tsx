import { useMemo, useState } from 'react'
import type { Graph } from '../../core/graph.js'
import type { TaskState } from '../../core/types.js'
import { api } from '../api.js'
import { taskLabel } from '../blockers.js'
import { errorText } from '../errors.js'
import type { DeleteTarget } from '../impact.js'
import { computeLayout, forkPath } from '../layout.js'
import { PlusIcon } from '../ui/icons.js'
import { useToast } from '../ui/Toast.js'
import { BlockerPopover } from './BlockerPopover.js'
import { CanvasMenu, CardMenu } from './CardMenu.js'
import { Legend } from './Legend.js'
import { TaskCard } from './TaskCard.js'

export type { DeleteTarget }

const INTERACTIVE = '.card, .lane-label, .add-task, .stuck-pill, .cp-pill, button'

export interface GraphViewProps {
  projectId: number
  graph: Graph
  onOpenTask(num: number): void
  onOpenBranch(branchId: number): void
  onAddTask(branchId: number): void
  onNewBranch(fromTask?: number): void
  onDelete(target: DeleteTarget): void
}

const LINE = 0.3
const ADD_R = 1

export function GraphView(props: GraphViewProps) {
  const { graph } = props
  const L = useMemo(() => computeLayout(graph), [graph])
  const [popover, setPopover] = useState<{ num: number; anchor: HTMLElement } | null>(null)
  const byId = new Map(graph.branches.map((b) => [b.id, b]))
  const taskOf = new Map(graph.tasks.map((t) => [t.num, t]))
  const toast = useToast()

  const setState = (num: number, state: TaskState) => {
    api.updateTask(props.projectId, taskLabel(num), { state }).catch((e) => toast.error(errorText(e)))
  }

  return (
    <div className="graph-area">
      <CanvasMenu onNewBranch={() => props.onNewBranch(undefined)}>
      <div
        className="graph-wrap"
        onDoubleClick={(e) => {
          if (!(e.target as HTMLElement).closest(INTERACTIVE)) props.onNewBranch(undefined)
        }}
      >
        <div className="graph" style={{ width: `${L.width}rem`, height: `${L.height}rem` }}>
          <svg
            viewBox={`0 0 ${L.width} ${L.height}`}
            style={{ width: `${L.width}rem`, height: `${L.height}rem` }}
            aria-hidden="true"
          >
            {L.checkpoints.map((c) => (
              <line
                key={`cp${c.x}`}
                className="cp-line"
                x1={c.x}
                x2={c.x}
                y1={1.6}
                y2={L.height}
                strokeWidth={0.12}
                strokeDasharray="0.5 0.4"
              />
            ))}
            {L.forks.map((f) => {
              const color = byId.get(f.branchId)!.color
              return <path key={f.branchId} d={forkPath(f.from, f.to)} fill="none" stroke={color} strokeWidth={LINE} />
            })}
            {L.lanes.map((l) => (
              <g key={l.branchId}>
                <line x1={l.labelX} x2={l.lineEndX} y1={l.y} y2={l.y} stroke={l.color} strokeWidth={LINE} />
                <line
                  x1={l.lineEndX}
                  x2={l.addX - ADD_R}
                  y1={l.y}
                  y2={l.y}
                  stroke={l.color}
                  strokeWidth={LINE * 0.7}
                  strokeDasharray="0.2 0.45"
                  strokeLinecap="round"
                />
              </g>
            ))}
          </svg>

          {L.checkpoints.map((c) => (
            <span key={`cpl${c.x}`} className="cp-pill" style={{ left: `${c.x}rem` }}>
              {c.label}
            </span>
          ))}

          {L.lanes.map((l) => {
            const b = byId.get(l.branchId)!
            return (
              <div key={l.branchId}>
                <button
                  type="button"
                  className="lane-label"
                  style={{
                    left: `${l.labelX + l.labelW}rem`,
                    top: `${l.y}rem`,
                    maxWidth: `${l.labelW}rem`,
                    background: l.color,
                  }}
                  onClick={() => props.onOpenBranch(b.id)}
                  title={b.purpose ? `${b.name} — ${b.purpose}` : b.name}
                >
                  {b.name}
                </button>
                {l.stuck && (
                  <span className="stuck-pill" style={{ left: `${l.labelX + l.labelW + 0.35}rem`, top: `${l.y}rem` }}>
                    stuck
                  </span>
                )}
                <button
                  type="button"
                  className="add-task"
                  aria-label={`Add task to ${b.name}`}
                  title="Add task"
                  style={{ left: `${l.addX}rem`, top: `${l.y}rem`, ['--lc' as string]: l.color }}
                  onClick={() => props.onAddTask(b.id)}
                >
                  <PlusIcon />
                </button>
              </div>
            )
          })}

          {L.cards.map((c) => {
            const t = taskOf.get(c.num)!
            return (
              <CardMenu
                key={c.num}
                num={c.num}
                state={t.state}
                onState={setState}
                onNewBranch={(n) => props.onNewBranch(n)}
                onDelete={props.onDelete}
              >
                <TaskCard
                  task={t}
                  graph={graph}
                  x={c.x}
                  y={c.y}
                  onOpen={props.onOpenTask}
                  onBlockerIcon={(num, anchor) => setPopover({ num, anchor })}
                  activeIcon={popover?.num === c.num}
                />
              </CardMenu>
            )
          })}
        </div>
      </div>
      </CanvasMenu>
      {popover && (
        <BlockerPopover
          projectId={props.projectId}
          graph={graph}
          num={popover.num}
          anchor={popover.anchor}
          onOpenTask={props.onOpenTask}
          onClose={() => setPopover(null)}
        />
      )}
      <Legend />
    </div>
  )
}
