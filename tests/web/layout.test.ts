import { describe, expect, test } from 'vitest'
import type { Graph } from '../../src/core/graph.js'
import { computeLayout } from '../../src/web/layout.js'
import { openBlockers } from '../../src/web/blockers.js'

type TaskSpec = { num: number; branchId: number; seq: number; state?: Graph['tasks'][number]['state']; blockedBy?: number[] }

function graph(
  branches: { id: number; name: string; root?: number | null }[],
  tasks: TaskSpec[],
  checkpoints: Graph['checkpoints'] = [],
): Graph {
  return {
    project: { id: 1, name: 'p' },
    liveVersion: 1,
    checkpoints,
    branches: branches.map((b) => ({
      id: b.id,
      projectId: 1,
      name: b.name,
      purpose: '',
      rootTaskNum: b.root ?? null,
      taskNums: tasks.filter((t) => t.branchId === b.id).map((t) => t.num),
      nextTaskNum: null,
      stuck: false,
      finished: false,
    })),
    tasks: tasks.map((t, i) => ({
      projectId: 1,
      num: t.num,
      branchId: t.branchId,
      title: `Task ${t.num}`,
      details: '',
      state: t.state ?? 'todo',
      branchPos: i,
      seq: t.seq,
      flagged: false,
      blockedBy: t.blockedBy ?? [],
      blocked: false,
    })),
  }
}

const stop = (L: ReturnType<typeof computeLayout>, num: number) => L.stops.find((s) => s.num === num)!

describe('computeLayout', () => {
  test('checkpoint sits between the tasks it separates', () => {
    const g = graph(
      [{ id: 1, name: 'main' }],
      [
        { num: 1, branchId: 1, seq: 1 },
        { num: 2, branchId: 1, seq: 2 },
        { num: 3, branchId: 1, seq: 4 },
      ],
      [{ seq: 3, fromVersion: 1, toVersion: 2 }],
    )
    const L = computeLayout(g)
    expect(L.checkpoints[0]).toEqual({ x: 190 + 2 * 110, label: 'v1 → v2' })
    expect(stop(L, 3).x).toBe(190 + 3 * 110)
  })

  test('forked branch lane comes right after its parent, before the next top-level branch', () => {
    const g = graph(
      [
        { id: 1, name: 'main' },
        { id: 2, name: 'paint' },
        { id: 3, name: 'weld', root: 1 },
      ],
      [
        { num: 1, branchId: 1, seq: 1 },
        { num: 2, branchId: 2, seq: 2 },
        { num: 3, branchId: 3, seq: 3 },
      ],
    )
    const L = computeLayout(g)
    expect(L.lanes.map((l) => l.label)).toEqual(['main', 'weld', 'paint'])
    expect(L.lanes.map((l) => l.y)).toEqual([40, 130, 220])
    expect(L.lanes[0]!.color).toBe('#5c7cfa')
  })

  test('fork curve starts at the root stop', () => {
    const g = graph(
      [
        { id: 1, name: 'main' },
        { id: 2, name: 'weld', root: 1 },
      ],
      [
        { num: 1, branchId: 1, seq: 1 },
        { num: 2, branchId: 2, seq: 2 },
      ],
    )
    const L = computeLayout(g)
    expect(L.forks[0]!.from).toEqual({ x: stop(L, 1).x, y: stop(L, 1).y })
    expect(L.forks[0]!.to).toEqual({ x: stop(L, 2).x, y: stop(L, 2).y })
  })

  test('branch without tasks still gets a lane', () => {
    const L = computeLayout(graph([{ id: 1, name: 'main' }], []))
    expect(L.lanes).toHaveLength(1)
    expect(L.stops).toEqual([])
  })
})

describe('openBlockers', () => {
  test('lists only unfinished blockers', () => {
    const g = graph(
      [{ id: 1, name: 'main' }],
      [
        { num: 1, branchId: 1, seq: 1, state: 'done' },
        { num: 2, branchId: 1, seq: 2, state: 'cancelled' },
        { num: 3, branchId: 1, seq: 3, state: 'in_progress' },
        { num: 4, branchId: 1, seq: 4, blockedBy: [1, 2, 3] },
      ],
    )
    expect(openBlockers(g, g.tasks[3]!)).toEqual([3])
  })
})
