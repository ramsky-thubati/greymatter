import type { Graph } from '../core/graph.js'
import type { TaskState } from '../core/types.js'
import { openBlockers } from './blockers.js'
import { computeLayout } from './layout.js'

const RED = '#e03131'
const FLAG_TIP = 'A blocker was cancelled. Check this task still makes sense.'

const FILL: Record<TaskState, string> = {
  done: '#2f9e44',
  in_progress: '#1c7ed6',
  todo: 'var(--bg)',
  later: '#f59f00',
  cancelled: '#adb5bd',
}

function clip(s: string, n = 18): string {
  return s.length > n ? `${s.slice(0, n - 1)}…` : s
}

export function MetroMap({
  graph,
  onTaskClick,
  onBranchClick,
}: {
  graph: Graph
  onTaskClick: (num: number) => void
  onBranchClick: (branchId: number) => void
}) {
  const L = computeLayout(graph)
  const pos = new Map(L.stops.map((s) => [s.num, s]))
  const tasks = new Map(graph.tasks.map((t) => [t.num, t]))
  const branches = new Map(graph.branches.map((b) => [b.id, b]))

  return (
    <div className="map-scroll">
      <svg className="metro" width={L.width} height={L.height} role="img" aria-label="Task map">
        {L.checkpoints.map((c) => (
          <g key={c.x} className="checkpoint">
            <line x1={c.x} y1={22} x2={c.x} y2={L.height} stroke="var(--accent)" strokeWidth={2} strokeDasharray="6 4" />
            <text x={c.x} y={14} textAnchor="middle" fontSize={11} fontWeight={700} fill="var(--accent)">
              {`◆ checkpoint · ${c.label}`}
            </text>
          </g>
        ))}

        {L.lanes.map((lane) => {
          const stops = (branches.get(lane.branchId)?.taskNums ?? []).map((n) => pos.get(n)).filter((s) => !!s)
          const first = stops[0]
          const last = stops[stops.length - 1]
          return (
            <g key={lane.branchId}>
              {first && last && (
                <line x1={first.x} y1={first.y} x2={last.x} y2={last.y} stroke={lane.color} strokeWidth={4} />
              )}
              <g
                className="lane-label"
                role="button"
                tabIndex={0}
                onClick={() => onBranchClick(lane.branchId)}
                onKeyDown={(e) => e.key === 'Enter' && onBranchClick(lane.branchId)}
              >
                <text x={10} y={lane.y + 4} fontSize={12} fontWeight={600} fill={lane.color}>
                  {`⎇ ${clip(lane.label, 16)}`}
                </text>
                {lane.stuck && (
                  <g>
                    <rect x={10} y={lane.y + 12} width={42} height={16} rx={8} fill={RED} />
                    <text x={31} y={lane.y + 24} textAnchor="middle" fontSize={10} fontWeight={700} fill="#fff">
                      stuck
                    </text>
                  </g>
                )}
              </g>
            </g>
          )
        })}

        {L.forks.map((f) => {
          const color = L.lanes.find((l) => l.branchId === f.branchId)?.color
          return (
            <path
              key={f.branchId}
              className="fork"
              d={`M${f.from.x},${f.from.y} C${f.from.x + 40},${f.from.y} ${f.to.x - 50},${f.to.y} ${f.to.x},${f.to.y}`}
              stroke={color}
              strokeWidth={4}
              fill="none"
            />
          )
        })}

        {graph.tasks.flatMap((t) =>
          t.blockedBy.map((b) => {
            const a = pos.get(b)
            const z = pos.get(t.num)
            if (!a || !z) return null
            return (
              <path
                key={`${b}-${t.num}`}
                className="blocker-curve"
                d={`M${a.x},${a.y + 9} C${a.x},${a.y + 50} ${z.x},${z.y - 50} ${z.x},${z.y - 9}`}
                stroke={RED}
                strokeWidth={1.5}
                strokeDasharray="4 3"
                fill="none"
              />
            )
          }),
        )}

        {L.stops.map((s) => {
          const t = tasks.get(s.num)
          if (!t) return null
          const open = openBlockers(graph, t)
          return (
            <g
              key={s.num}
              className={`stop state-${t.state}`}
              role="button"
              tabIndex={0}
              data-task={`T-${t.num}`}
              onClick={() => onTaskClick(t.num)}
              onKeyDown={(e) => e.key === 'Enter' && onTaskClick(t.num)}
            >
              {t.state === 'in_progress' && <circle cx={s.x} cy={s.y} r={12} fill="rgba(28,126,214,.25)" />}
              <circle
                cx={s.x}
                cy={s.y}
                r={7}
                fill={FILL[t.state]}
                stroke={t.blocked ? RED : t.state === 'todo' ? '#868e96' : FILL[t.state]}
                strokeWidth={t.blocked ? 3 : 2}
              />
              {t.flagged && (
                <g>
                  <title>{FLAG_TIP}</title>
                  <circle cx={s.x + 10} cy={s.y - 10} r={7} fill="#f59f00" />
                  <text x={s.x + 10} y={s.y - 6} textAnchor="middle" fontSize={10} fontWeight={800} fill="#fff">
                    !
                  </text>
                </g>
              )}
              <text x={s.x} y={s.y + 24} textAnchor="middle" fontSize={11} fill="var(--text)">
                <tspan fontWeight={700} fill="var(--muted)">{`T-${t.num} `}</tspan>
                <tspan
                  className={t.state === 'cancelled' ? 'cancelled-title' : undefined}
                  textDecoration={t.state === 'cancelled' ? 'line-through' : undefined}
                >
                  {clip(t.title)}
                </tspan>
              </text>
              {t.blocked && open.length > 0 && (
                <text className="blocked-label" x={s.x} y={s.y + 38} textAnchor="middle" fontSize={11} fill={RED}>
                  {`blocked by ${open.map((n) => `T-${n}`).join(', ')}`}
                </text>
              )}
            </g>
          )
        })}
      </svg>
    </div>
  )
}
