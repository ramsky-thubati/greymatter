import { describe, expect, test } from 'vitest'
import {
  ADD_GAP,
  CARD_H,
  CARD_W,
  computeLayout,
  forkPath,
  LABEL_GAP,
  LANE_H,
  labelWidth,
  type Layout,
  STUCK_W,
  TOP,
} from '../../src/web/layout.js'
import { makeGraph } from './fixtures.js'

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
    expect(card(L, 3).x).toBeGreaterThan(card(L, 2).x)
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

  test('checkpoint gets its own column', () => {
    const g = makeGraph(
      [{ id: 1, name: 'main' }],
      [
        { num: 1, branchId: 1, seq: 1 },
        { num: 2, branchId: 1, seq: 2 },
        { num: 3, branchId: 1, seq: 4 },
      ],
      [{ seq: 3, fromVersion: 1, toVersion: 2 }],
    )
    const L = computeLayout(g)
    expect(L.checkpoints[0]!.label).toBe('v1 → v2')
    expect(L.checkpoints[0]!.x).toBeGreaterThan(card(L, 2).x + CARD_W)
    expect(L.checkpoints[0]!.x).toBeLessThan(card(L, 3).x)
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
