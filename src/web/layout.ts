import type { Graph } from '../core/graph.js'

export const CARD_W = 10
export const CARD_H = 4.75
export const STEP = 12
export const LANE_H = 8
export const TOP = 4.25
export const CP_PILL_H = 1.4
export const LABEL_GAP = 1.25
export const ADD_GAP = 3
export const ADD_R = 1
export const STUCK_W = 3.6
const LEFT = 0.5
const FORK_GAP = 1.5
const GAP = (STEP - CARD_W) / 2
const PILL_GAP = 0.25

type Point = { x: number; y: number }

export const labelWidth = (name: string): number => 1.8 + 0.55 * name.length
export const cpPillWidth = (label: string): number => 1.2 + 0.45 * label.length

const labelRoom = (b: { name: string; stuck: boolean }) => labelWidth(b.name) + (b.stuck ? STUCK_W : 0)

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
  checkpoints: { label: string; labelX: number; points: Point[] }[]
}

export function computeLayout(graph: Graph): Layout {
  const taskOf = new Map(graph.tasks.map((t) => [t.num, t]))
  const byId = new Map(graph.branches.map((b) => [b.id, b]))
  const rootSeq = (id: number) => taskOf.get(byId.get(id)?.rootTaskNum ?? -1)?.seq ?? 0
  const children = new Map<number, number[]>()
  const roots: number[] = []
  for (const b of graph.branches) {
    const parent = b.rootTaskNum === null ? undefined : taskOf.get(b.rootTaskNum)?.branchId
    if (parent === undefined || parent === b.id) roots.push(b.id)
    else children.set(parent, [...(children.get(parent) ?? []), b.id])
  }
  const order: number[] = []
  const visit = (id: number) => {
    if (order.includes(id)) return
    order.push(id)
    for (const c of [...(children.get(id) ?? [])].sort((a, b) => rootSeq(b) - rootSeq(a))) visit(c)
  }
  roots.forEach(visit)
  for (const b of graph.branches) visit(b.id)

  const laneY = order.map((_, i) => TOP + i * LANE_H)
  const cps = [...graph.checkpoints].sort((a, b) => a.seq - b.seq)
  const segOf = (seq: number) => cps.filter((c) => c.seq < seq).length
  const cpLabel = cps.map((c) => `v${c.fromVersion} → v${c.toVersion}`)
  const pillW = cpLabel.map(cpPillWidth)
  const lineX: number[][] = cps.map(() => [])
  const cardAt = new Map<number, { num: number; x: number; y: number }>()

  const lanes: Layout['lanes'] = order.map((id, li) => {
    const b = byId.get(id)!
    const y = laneY[li]!
    const room = labelRoom(b)
    const parent = b.rootTaskNum === null ? undefined : cardAt.get(b.rootTaskNum)
    let labelX = parent ? parent.x + CARD_W / 2 + FORK_GAP : LEFT
    let prev: number | undefined
    let floor = -Infinity
    let k = 0
    const placeLine = () => {
      let x = prev !== undefined ? prev + CARD_W + GAP : li > 0 ? lineX[k]![li - 1]! : Math.max(LEFT, pillW[k]! / 2)
      if (k > 0) x = Math.max(x, lineX[k - 1]![li]! + (li === 0 ? (pillW[k - 1]! + pillW[k]!) / 2 + PILL_GAP : GAP))
      lineX[k]![li] = x
      if (prev === undefined && x >= labelX) labelX = x + GAP
      floor = x + GAP
      k++
    }
    for (const num of b.taskNums) {
      const seg = segOf(taskOf.get(num)!.seq)
      while (k < seg) placeLine()
      const x = Math.max(prev === undefined ? labelX + room + LABEL_GAP : prev + STEP, floor)
      if (prev === undefined) labelX = x - LABEL_GAP - room
      cardAt.set(num, { num, x, y })
      prev = x
    }
    while (k < cps.length) placeLine()
    const last = prev
    const lastLine = cps.length > 0 ? lineX[cps.length - 1]![li]! + GAP + ADD_R : -Infinity
    return {
      branchId: id,
      y,
      color: b.color,
      stuck: b.stuck,
      labelX,
      labelW: labelWidth(b.name),
      lineEndX: last !== undefined ? last + CARD_W / 2 : labelX + room,
      addX: Math.max(last !== undefined ? last + CARD_W + ADD_GAP : labelX + room + ADD_GAP, lastLine),
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

  const checkpoints: Layout['checkpoints'] = cps.map((_, k) => ({
    label: cpLabel[k]!,
    labelX: lineX[k]![0] ?? LEFT,
    points: lanes.map((l, li) => ({ x: lineX[k]![li]!, y: l.y })),
  }))

  const cards = [...cardAt.values()]
  const right = Math.max(
    0,
    ...lanes.map((l) => l.addX),
    ...cards.map((c) => c.x + CARD_W),
    ...lineX.flat().map((x) => x + GAP),
  )
  return {
    width: right + 2,
    height: TOP + Math.max(order.length, 1) * LANE_H,
    lanes,
    cards,
    forks,
    checkpoints,
  }
}

export function checkpointPath(points: Point[], top: number, bottom: number, band: number): string {
  if (points.length === 0) return ''
  const [first, ...rest] = points
  const parts = [`M ${first!.x} ${top} V ${first!.y + band}`]
  let a = first!
  for (const b of rest) {
    if (a.x === b.x) parts.push(`V ${b.y + band}`)
    else {
      const m = (a.y + band + b.y - band) / 2
      parts.push(`C ${a.x} ${m} ${b.x} ${m} ${b.x} ${b.y - band} V ${b.y + band}`)
    }
    a = b
  }
  parts.push(`V ${bottom}`)
  return parts.join(' ')
}

const CURVE = 1.2


export function forkPath(from: Point, to: Point): string {
  const y0 = from.y + CARD_H / 2
  const dx = to.x - from.x
  const r = Math.max(0, Math.min(CURVE, to.y - y0, Math.abs(dx)))
  const bend = from.x + Math.sign(dx) * r
  return `M ${from.x} ${y0} V ${to.y - r} Q ${from.x} ${to.y} ${bend} ${to.y} H ${to.x}`
}
