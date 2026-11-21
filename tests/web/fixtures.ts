import type { Graph } from '../../src/core/graph.js'
import type { TaskState } from '../../src/core/types.js'

export interface BranchSpec {
  id: number
  name: string
  root?: number | null
  color?: string
  purpose?: string
  stuck?: boolean
}

export interface TaskSpec {
  num: number
  branchId: number
  seq: number
  title?: string
  details?: string
  state?: TaskState
  blockedBy?: number[]
  flagged?: boolean
}

export function makeGraph(
  branches: BranchSpec[],
  tasks: TaskSpec[],
  checkpoints: Graph['checkpoints'] = [],
  liveVersion = 1,
): Graph {
  const finished = (s: TaskState) => s === 'done' || s === 'cancelled'
  const stateOf = new Map(tasks.map((t) => [t.num, t.state ?? 'todo']))
  return {
    project: { id: 1, name: 'demo' },
    liveVersion,
    checkpoints,
    branches: branches.map((b, i) => ({
      id: b.id,
      projectId: 1,
      name: b.name,
      purpose: b.purpose ?? '',
      rootTaskNum: b.root ?? null,
      color: b.color ?? ['#613583', '#c061cb', '#865e3c'][i % 3]!,
      taskNums: tasks.filter((t) => t.branchId === b.id).map((t) => t.num),
      nextTaskNum: null,
      stuck: b.stuck ?? false,
      finished: false,
    })),
    tasks: tasks.map((t, i) => ({
      projectId: 1,
      num: t.num,
      branchId: t.branchId,
      title: t.title ?? `Task ${t.num}`,
      details: t.details ?? '',
      state: t.state ?? 'todo',
      branchPos: i,
      seq: t.seq,
      flagged: t.flagged ?? false,
      blockedBy: t.blockedBy ?? [],
      blocked: (t.blockedBy ?? []).some((n) => !finished(stateOf.get(n) ?? 'todo')),
    })),
  }
}

export const demoGraph = (): Graph =>
  makeGraph(
    [
      { id: 1, name: 'main' },
      { id: 2, name: 'Lighting', root: 2 },
    ],
    [
      { num: 1, branchId: 1, seq: 1, title: 'Make sure garage is empty', state: 'done' },
      { num: 2, branchId: 1, seq: 2, title: 'Measure the walls', state: 'done' },
      { num: 3, branchId: 1, seq: 3, title: 'Paint the walls', state: 'in_progress', blockedBy: [1] },
      { num: 4, branchId: 2, seq: 5, title: 'Buy lamps', state: 'later' },
      { num: 5, branchId: 2, seq: 6, title: 'Pack away loose stuff', state: 'todo', blockedBy: [3] },
    ],
    [{ seq: 4, fromVersion: 1, toVersion: 2 }],
  )
