import { expect, test } from 'vitest'
import { deleteImpact } from '../../src/web/impact.js'
import { demoGraph, makeGraph } from './fixtures.js'

test('task: dependents and forks', () => {
  const g = demoGraph()
  expect(deleteImpact(g, { kind: 'task', num: 3 })).toEqual({ dependents: [5], forkedBranches: [] })
  expect(deleteImpact(g, { kind: 'task', num: 2 })).toEqual({ dependents: [], forkedBranches: [2] })
})

test('branch: own tasks are not dependents', () => {
  const g = makeGraph(
    [
      { id: 1, name: 'main' },
      { id: 2, name: 'side' },
      { id: 3, name: 'sub', root: 3 },
    ],
    [
      { num: 1, branchId: 1, seq: 1, blockedBy: [2] },
      { num: 2, branchId: 2, seq: 2 },
      { num: 3, branchId: 2, seq: 3, blockedBy: [2] },
    ],
  )
  expect(deleteImpact(g, { kind: 'branch', branchId: 2 })).toEqual({ dependents: [1], forkedBranches: [3] })
  expect(deleteImpact(g, { kind: 'branch', branchId: 3 })).toEqual({ dependents: [], forkedBranches: [] })
})
