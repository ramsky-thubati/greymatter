import type { Graph } from '../core/graph.js'

export const CARD_W = 10
export const CARD_H = 4.75
export const STEP = 12
export const LANE_H = 8
export const TOP = 3.5
export const LABEL_GAP = 1.25
export const ADD_GAP = 3
const LEFT = 0.5
const FORK_GAP = 1.5

export const labelWidth = (name: string): number => 1.8 + 0.55 * name.length

export interface Layout {
  width: number
  height: number
  lanes: {
    branchId: number
    y: number
    color: string
    stuck: boolean
    labelX: number
    labelW: number
    lineEndX: number
    addX: number
  }[]
  cards: { num: number; x: number; y: number }[]
  forks: { branchId: number; from: { x: number; y: number }; to: { x: number; y: number } }[]
  checkpoints: { x: number; label: string }[]
}

export function computeLayout(graph: Graph): Layout {
  const taskBranch = new Map(graph.tasks.map((t) => [t.num, t.branchId]))
  const children = new Map<number, number[]>()
  const roots: number[] = []
  for (const b of graph.branches) {
    const parent = b.rootTaskNum === null ? undefined : taskBranch.get(b.rootTaskNum)
    if (parent === undefined || parent === b.id) roots.push(b.id)
    else children.set(parent, [...(children.get(parent) ?? []), b.id])
  }
  const order: number[] = []
  const visit = (id: number) => {
    if (order.includes(id)) return
    order.push(id)
    for (const c of children.get(id) ?? []) visit(c)
  }
  roots.forEach(visit)
  for (const b of graph.branches) visit(b.id)

  const byId = new Map(graph.branches.map((b) => [b.id, b]))
  const laneY = new Map(order.map((id, i) => [id, TOP + i * LANE_H]))
  const firstTask = new Set(graph.branches.flatMap((b) => (b.taskNums[0] === undefined ? [] : [b.taskNums[0]])))

  const columns = [
    ...graph.tasks.map((t) => ({ seq: t.seq, task: t.num })),
    ...graph.checkpoints.map((c) => ({ seq: c.seq, cp: c })),
  ].sort((a, b) => a.seq - b.seq)

  const cardAt = new Map<number, { num: number; x: number; y: number }>()
  const labelAt = new Map<number, number>()
  const checkpoints: Layout['checkpoints'] = []

  const minLabelX = (branchId: number) => {
    const root = byId.get(branchId)?.rootTaskNum
    const parent = root === null || root === undefined ? undefined : cardAt.get(root)
    return parent ? parent.x + CARD_W / 2 + FORK_GAP : LEFT
  }

  let prevX = -STEP
  for (const col of columns) {
    let x = prevX + STEP
    if ('task' in col) {
      const branchId = taskBranch.get(col.task)!
      if (firstTask.has(col.task)) {
        const w = labelWidth(byId.get(branchId)!.name)
        x = Math.max(x, minLabelX(branchId) + w + LABEL_GAP)
        labelAt.set(branchId, x - LABEL_GAP - w)
      }
      cardAt.set(col.task, { num: col.task, x, y: laneY.get(branchId)! })
    } else {
      checkpoints.push({ x: x + CARD_W / 2, label: `v${col.cp.fromVersion} → v${col.cp.toVersion}` })
    }
    prevX = x
  }

  const lanes: Layout['lanes'] = order.map((id) => {
    const b = byId.get(id)!
    const labelW = labelWidth(b.name)
    const labelX = labelAt.get(id) ?? minLabelX(id)
    const last = b.taskNums.length ? cardAt.get(b.taskNums[b.taskNums.length - 1]!) : undefined
    return {
      branchId: id,
      y: laneY.get(id)!,
      color: b.color,
      stuck: b.stuck,
      labelX,
      labelW,
      lineEndX: last ? last.x + CARD_W / 2 : labelX + labelW,
      addX: last ? last.x + CARD_W + ADD_GAP : labelX + labelW + ADD_GAP,
    }
  })

  const forks: Layout['forks'] = []
  for (const l of lanes) {
    const root = byId.get(l.branchId)!.rootTaskNum
    const from = root === null ? undefined : cardAt.get(root)
    if (from && from.y !== l.y) {
      forks.push({ branchId: l.branchId, from: { x: from.x + CARD_W / 2, y: from.y }, to: { x: l.labelX, y: l.y } })
    }
  }

  const cards = [...cardAt.values()]
  const right = Math.max(0, ...lanes.map((l) => l.addX), ...cards.map((c) => c.x + CARD_W))
  return {
    width: right + 2,
    height: TOP + Math.max(order.length, 1) * LANE_H,
    lanes,
    cards,
    forks,
    checkpoints,
  }
}
