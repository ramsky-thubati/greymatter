import { describe, expect, test } from 'vitest'
import {
  ADD_GAP,
  CARD_H,
  CARD_W,
  CP_PILL_H,
  checkpointPath,
  computeLayout,
  cpPillWidth,
  forkPath,
  LABEL_GAP,
  LANE_H,
  labelWidth,
  type Layout,
  STEP,
  STUCK_W,
  TOP,
} from '../../src/web/layout.js'
import { demoGraph, makeGraph } from './fixtures.js'

const card = (L: Layout, num: number) => L.cards.find((c) => c.num === num)!
const lane = (L: Layout, id: number) => L.lanes.find((l) => l.branchId === id)!

const three = () =>
  makeGraph(
    [
      { id: 1, name: 'main' },
      { id: 2, name: 'Lighting', root: 2 },
      { id: 3, name: 'Docs' },
    ],
    [
      { num: 1, branchId: 1, seq: 1 },
      { num: 2, branchId: 1, seq: 2 },
      { num: 3, branchId: 2, seq: 3 },
      { num: 4, branchId: 1, seq: 4 },
      { num: 5, branchId: 3, seq: 5 },
      { num: 6, branchId: 2, seq: 6 },
      { num: 7, branchId: 3, seq: 7 },
      { num: 8, branchId: 1, seq: 8 },
      { num: 9, branchId: 2, seq: 9 },
    ],
  )

describe('computeLayout', () => {
  test('labelWidth', () => {
    expect(labelWidth('main')).toBeCloseTo(1.8 + 0.55 * 4)
  })

  test('lanes follow tree order', () => {
    const g = makeGraph(
      [
        { id: 1, name: 'main' },
        { id: 2, name: 'Docs' },
        { id: 3, name: 'fork', root: 1 },
      ],
      [{ num: 1, branchId: 1, seq: 1 }],
    )
    const L = computeLayout(g)
    expect(L.lanes.map((l) => l.branchId)).toEqual([1, 3, 2])
    expect(L.lanes.map((l) => l.y)).toEqual([TOP, TOP + LANE_H, TOP + 2 * LANE_H])
  })

  test('lane colour comes from the branch', () => {
    const g = three()
    const L = computeLayout(g)
    for (const l of L.lanes) expect(l.color).toBe(g.branches.find((b) => b.id === l.branchId)!.color)
  })

  test('cards never overlap', () => {
    const L = computeLayout(three())
    for (const a of L.cards)
      for (const b of L.cards) if (a !== b && a.y === b.y) expect(Math.abs(a.x - b.x)).toBeGreaterThanOrEqual(CARD_W)
  })

  test('label sits left of the first card', () => {
    const g = three()
    const L = computeLayout(g)
    for (const b of g.branches) {
      const l = lane(L, b.id)
      expect(l.labelW).toBeCloseTo(labelWidth(b.name))
      expect(l.labelX + l.labelW + LABEL_GAP).toBeLessThanOrEqual(card(L, b.taskNums[0]!).x + 1e-9)
    }
  })

  test('forked label starts after the fork point', () => {
    const L = computeLayout(three())
    expect(lane(L, 2).labelX).toBeGreaterThan(card(L, 2).x + CARD_W / 2)
    const fork = L.forks.find((f) => f.branchId === 2)!
    expect(fork.from.x).toBeCloseTo(card(L, 2).x + CARD_W / 2)
    expect(fork.to).toEqual({ x: lane(L, 2).labelX, y: lane(L, 2).y })
  })

  test('long branch name pushes cards right', () => {
    const long = 'x'.repeat(60)
    const g = makeGraph(
      [
        { id: 1, name: 'main' },
        { id: 2, name: long, root: 1 },
      ],
      [
        { num: 1, branchId: 1, seq: 1 },
        { num: 2, branchId: 2, seq: 2 },
        { num: 3, branchId: 1, seq: 3 },
      ],
    )
    const L = computeLayout(g)
    const l = lane(L, 2)
    expect(l.labelX).toBeGreaterThan(card(L, 1).x + CARD_W / 2)
    expect(l.labelX + labelWidth(long) + LABEL_GAP).toBeLessThanOrEqual(card(L, 2).x + 1e-9)
    expect(card(L, 3).x).toBeCloseTo(card(L, 1).x + STEP)
  })

  test('empty branch', () => {
    const L = computeLayout(makeGraph([{ id: 1, name: 'main' }], []))
    expect(L.cards).toHaveLength(0)
    expect(L.lanes).toHaveLength(1)
    expect(L.lanes[0]!.addX).toBeGreaterThan(L.lanes[0]!.labelX + L.lanes[0]!.labelW)
    expect(Number.isFinite(L.width) && L.width > 0).toBe(true)
  })

  test('empty forked branch sits after its fork point', () => {
    const g = makeGraph(
      [
        { id: 1, name: 'main' },
        { id: 2, name: 'idea', root: 1 },
      ],
      [{ num: 1, branchId: 1, seq: 1 }],
    )
    const L = computeLayout(g)
    expect(lane(L, 2).labelX).toBeGreaterThan(card(L, 1).x + CARD_W / 2)
    expect(L.forks.find((f) => f.branchId === 2)).toBeTruthy()
  })

  test('add circle after last card', () => {
    const L = computeLayout(three())
    expect(lane(L, 1).addX).toBeCloseTo(card(L, 8).x + CARD_W + ADD_GAP)
    expect(lane(L, 1).lineEndX).toBeCloseTo(card(L, 8).x + CARD_W / 2)
  })

  test('first main card leaves room for the label', () => {
    const L = computeLayout(three())
    expect(lane(L, 1).labelX).toBe(0.5)
    expect(card(L, 1).x).toBeCloseTo(0.5 + labelWidth('main') + LABEL_GAP)
    expect(L.width).toBeGreaterThan(Math.max(...L.lanes.map((l) => l.addX)))
    expect(L.height).toBe(TOP + 3 * LANE_H)
  })

  test('stuck flag carries through and leaves room for its pill', () => {
    const g = makeGraph([{ id: 1, name: 'main', stuck: true }], [{ num: 1, branchId: 1, seq: 1 }])
    const L = computeLayout(g)
    expect(L.lanes[0]!.stuck).toBe(true)
    expect(L.lanes[0]!.labelX + labelWidth('main') + STUCK_W + LABEL_GAP).toBeLessThanOrEqual(card(L, 1).x + 1e-9)
  })
})

test('fork path curves toward a lane that starts left of its root', () => {
  const y0 = 2 + CARD_H / 2
  expect(forkPath({ x: 30, y: 2 }, { x: 10, y: 20 })).toBe(`M 30 ${y0} V ${20 - 1.2} Q 30 20 ${30 - 1.2} 20 H 10`)
})

test('fork path curves right for a lane that starts right of its root', () => {
  const y0 = 2 + CARD_H / 2
  expect(forkPath({ x: 10, y: 2 }, { x: 30, y: 20 })).toBe(`M 10 ${y0} V ${20 - 1.2} Q 10 20 ${10 + 1.2} 20 H 30`)
})

const rooted = () =>
  makeGraph(
    [
      { id: 1, name: 'main' },
      { id: 2, name: 'Lighting', root: 2 },
    ],
    [
      { num: 1, branchId: 1, seq: 1 },
      { num: 2, branchId: 1, seq: 2 },
      { num: 3, branchId: 1, seq: 3 },
      { num: 4, branchId: 1, seq: 4 },
      { num: 5, branchId: 2, seq: 5 },
    ],
  )

const cp = (seq: number) => ({ seq, fromVersion: 1, toVersion: 2 })

describe('packing', () => {
  test('branch starts next to its root', () => {
    const L = computeLayout(rooted())
    expect(lane(L, 2).labelX).toBeCloseTo(card(L, 2).x + CARD_W / 2 + 1.5)
    expect(card(L, 5).x).toBeCloseTo(lane(L, 2).labelX + labelWidth('Lighting') + LABEL_GAP)
    expect(card(L, 5).x).toBeLessThan(card(L, 4).x)
  })

  test('later root sits closer to the parent', () => {
    const g = makeGraph(
      [
        { id: 1, name: 'main' },
        { id: 2, name: 'A', root: 2 },
        { id: 3, name: 'B', root: 3 },
      ],
      [
        { num: 1, branchId: 1, seq: 1 },
        { num: 2, branchId: 1, seq: 2 },
        { num: 3, branchId: 1, seq: 3 },
      ],
    )
    expect(computeLayout(g).lanes.map((l) => l.branchId)).toEqual([1, 3, 2])
  })

  test('fork lines never cross a card', () => {
    for (const g of [demoGraph(), rooted(), three()]) {
      const L = computeLayout(g)
      for (const f of L.forks)
        for (const c of L.cards)
          if (c.y > f.from.y && c.y < f.to.y) {
            const inside = f.from.x >= c.x && f.from.x <= c.x + CARD_W
            expect(inside).toBe(false)
          }
    }
  })
})

describe('curved checkpoint lines', () => {
  const bent = () =>
    makeGraph(
      [
        { id: 1, name: 'main' },
        { id: 2, name: 'Lighting', root: 2 },
        { id: 3, name: 'Fix', root: 3 },
      ],
      [
        { num: 1, branchId: 1, seq: 1, state: 'done' },
        { num: 2, branchId: 1, seq: 2, state: 'done' },
        { num: 3, branchId: 1, seq: 3, state: 'done' },
        { num: 5, branchId: 2, seq: 4, state: 'done' },
        { num: 6, branchId: 2, seq: 5, state: 'done' },
        { num: 4, branchId: 1, seq: 7 },
        { num: 7, branchId: 3, seq: 8 },
      ],
      [cp(6)],
    )

  test('checkpoint line bends per lane', () => {
    const g = bent()
    const L = computeLayout(g)
    const seqOf = new Map(g.tasks.map((t) => [t.num, t.seq]))
    const points = L.checkpoints[0]!.points
    expect(points.map((p) => p.y)).toEqual(L.lanes.map((l) => l.y))
    points.forEach((p) => {
      for (const c of L.cards.filter((c) => c.y === p.y)) {
        if (seqOf.get(c.num)! < 6) expect(c.x + CARD_W).toBeLessThan(p.x)
        else expect(c.x).toBeGreaterThan(p.x)
      }
    })
    expect(card(L, 4).x).toBeCloseTo(card(L, 3).x + STEP)
    const at = (id: number) => points[L.lanes.findIndex((l) => l.branchId === id)]!.x
    expect(at(2)).toBeGreaterThan(at(1))
  })

  test('lines never cross', () => {
    const g = makeGraph(
      [{ id: 1, name: 'main' }],
      [
        { num: 1, branchId: 1, seq: 1 },
        { num: 2, branchId: 1, seq: 4 },
      ],
      [cp(2), { seq: 3, fromVersion: 2, toVersion: 3 }],
    )
    const [a, b] = computeLayout(g).checkpoints
    a!.points.forEach((p, i) => expect(b!.points[i]!.x).toBeGreaterThan(p.x))
  })

  test('back-to-back checkpoint pills never overlap', () => {
    const g = makeGraph(
      [{ id: 1, name: 'main' }],
      [
        { num: 1, branchId: 1, seq: 1 },
        { num: 2, branchId: 1, seq: 4 },
      ],
      [cp(2), { seq: 3, fromVersion: 2, toVersion: 3 }],
    )
    const [a, b] = computeLayout(g).checkpoints
    expect(b!.labelX - a!.labelX).toBeGreaterThanOrEqual((cpPillWidth(a!.label) + cpPillWidth(b!.label)) / 2)
  })

  test('line misses a label pill it passes', () => {
    const g = makeGraph(
      [
        { id: 1, name: 'main' },
        { id: 2, name: 'side', root: 1 },
      ],
      [
        { num: 1, branchId: 1, seq: 1, state: 'done' },
        { num: 2, branchId: 2, seq: 3 },
      ],
      [cp(2)],
    )
    const L = computeLayout(g)
    expect(lane(L, 2).labelX).toBeGreaterThanOrEqual(L.checkpoints[0]!.points[1]!.x)
  })

  test('empty lane takes the line from above', () => {
    const g = makeGraph(
      [
        { id: 1, name: 'main' },
        { id: 2, name: 'Docs' },
      ],
      [
        { num: 1, branchId: 1, seq: 1 },
        { num: 2, branchId: 1, seq: 3 },
      ],
      [cp(2)],
    )
    const L = computeLayout(g)
    const [main, docs] = L.checkpoints[0]!.points
    expect(docs!.x).toBe(main!.x)
    expect(lane(L, 2).labelX).toBeGreaterThanOrEqual(docs!.x)
  })
})

test('checkpointPath', () => {
  expect(checkpointPath([{ x: 5, y: 10 }, { x: 9, y: 18 }], 1, 30, 3)).toBe('M 5 1 V 13 C 5 14 9 14 9 15 V 21 V 30')
})

test('checkpointPath straight run', () => {
  expect(checkpointPath([{ x: 5, y: 10 }, { x: 5, y: 18 }], 1, 30, 3)).toBe('M 5 1 V 13 V 21 V 30')
})

test('checkpoint pill clears the top cards', () => {
  expect(TOP - CARD_H / 2).toBeGreaterThanOrEqual(CP_PILL_H + 0.25)
})
