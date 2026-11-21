import type { Graph } from '../core/graph.js'

export interface Layout {
  width: number
  height: number
  lanes: { branchId: number; y: number; label: string; color: string; stuck: boolean }[]
  stops: { num: number; x: number; y: number }[]
  forks: { branchId: number; from: { x: number; y: number }; to: { x: number; y: number } }[]
  checkpoints: { x: number; label: string }[]
}

export const LANE_COLORS = ['#5c7cfa', '#cc5de8', '#20c997', '#ff922b', '#f06595', '#339af0']
const LEFT = 190
const STEP = 110
const TOP = 40
const LANE_H = 90

export function computeLayout(graph: Graph): Layout {
  const taskBranch = new Map(graph.tasks.map((t) => [t.num, t.branchId]))
  const children = new Map<number, number[]>()
  const roots: number[] = []
  for (const b of graph.branches) {
    const parent = b.rootTaskNum === null ? undefined : taskBranch.get(b.rootTaskNum)
    if (parent === undefined) roots.push(b.id)
    else children.set(parent, [...(children.get(parent) ?? []), b.id])
  }
  const order: number[] = []
  const visit = (id: number) => {
    order.push(id)
    for (const c of children.get(id) ?? []) visit(c)
  }
  roots.forEach(visit)

  const byId = new Map(graph.branches.map((b) => [b.id, b]))
  const laneY = new Map(order.map((id, i) => [id, TOP + i * LANE_H]))
  const lanes = order.map((id, i) => ({
    branchId: id,
    y: TOP + i * LANE_H,
    label: byId.get(id)!.name,
    color: LANE_COLORS[i % LANE_COLORS.length]!,
    stuck: byId.get(id)!.stuck,
  }))

  const columns = [
    ...graph.tasks.map((t) => ({ seq: t.seq, task: t.num })),
    ...graph.checkpoints.map((c) => ({ seq: c.seq, cp: c })),
  ].sort((a, b) => a.seq - b.seq)

  const stops: Layout['stops'] = []
  const checkpoints: Layout['checkpoints'] = []
  columns.forEach((col, i) => {
    const x = LEFT + i * STEP
    if ('task' in col) stops.push({ num: col.task, x, y: laneY.get(taskBranch.get(col.task)!)! })
    else checkpoints.push({ x, label: `v${col.cp.fromVersion} → v${col.cp.toVersion}` })
  })

  const stopOf = new Map(stops.map((s) => [s.num, s]))
  const forks: Layout['forks'] = []
  for (const b of graph.branches) {
    const from = b.rootTaskNum === null ? undefined : stopOf.get(b.rootTaskNum)
    const first = b.taskNums[0] === undefined ? undefined : stopOf.get(b.taskNums[0])
    if (from && first) forks.push({ branchId: b.id, from: { x: from.x, y: from.y }, to: { x: first.x, y: first.y } })
  }

  return {
    width: LEFT + Math.max(columns.length - 1, 0) * STEP + 90,
    height: TOP + Math.max(order.length, 1) * LANE_H - 10,
    lanes,
    stops,
    forks,
    checkpoints,
  }
}
