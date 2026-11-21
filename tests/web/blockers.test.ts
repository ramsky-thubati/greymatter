import { expect, test } from 'vitest'
import { blocks, hasFork, isFinished, openBlockers, showsFlag, showsPadlock } from '../../src/web/blockers.js'
import { makeGraph, type TaskSpec } from './fixtures.js'

const g = (tasks: TaskSpec[], branches = [{ id: 1, name: 'main' }]) => makeGraph(branches, tasks)
const t = (graph: ReturnType<typeof g>, num: number) => graph.tasks.find((x) => x.num === num)!

test('isFinished', () => {
  expect(isFinished('done')).toBe(true)
  expect(isFinished('cancelled')).toBe(true)
  expect(isFinished('later')).toBe(false)
})

test('openBlockers lists only unfinished blockers', () => {
  const graph = g([
    { num: 1, branchId: 1, seq: 1, state: 'done' },
    { num: 2, branchId: 1, seq: 2, state: 'cancelled' },
    { num: 3, branchId: 1, seq: 3, state: 'later' },
    { num: 4, branchId: 1, seq: 4, blockedBy: [1, 2, 3] },
  ])
  expect(openBlockers(graph, t(graph, 4))).toEqual([3])
})

test('padlock shows while a blocker is unfinished', () => {
  const graph = g([
    { num: 1, branchId: 1, seq: 1, state: 'todo' },
    { num: 2, branchId: 1, seq: 2, blockedBy: [1] },
  ])
  expect(showsPadlock(graph, t(graph, 2))).toBe(true)
  const done = g([
    { num: 1, branchId: 1, seq: 1, state: 'done' },
    { num: 3, branchId: 1, seq: 2, state: 'cancelled' },
    { num: 2, branchId: 1, seq: 3, blockedBy: [1, 3] },
  ])
  expect(showsPadlock(done, t(done, 2))).toBe(false)
})

test('flag shows while the task is unfinished and blocks an unfinished task', () => {
  const graph = g([
    { num: 1, branchId: 1, seq: 1, state: 'todo' },
    { num: 2, branchId: 1, seq: 2, blockedBy: [1] },
  ])
  expect(showsFlag(graph, t(graph, 1))).toBe(true)
  expect(blocks(graph, 1).map((x) => x.num)).toEqual([2])

  const finishedSelf = g([
    { num: 1, branchId: 1, seq: 1, state: 'done' },
    { num: 2, branchId: 1, seq: 2, blockedBy: [1] },
  ])
  expect(showsFlag(finishedSelf, t(finishedSelf, 1))).toBe(false)

  const finishedOthers = g([
    { num: 1, branchId: 1, seq: 1, state: 'todo' },
    { num: 2, branchId: 1, seq: 2, state: 'done', blockedBy: [1] },
  ])
  expect(showsFlag(finishedOthers, t(finishedOthers, 1))).toBe(false)
})

test('hasFork', () => {
  const graph = makeGraph(
    [
      { id: 1, name: 'main' },
      { id: 2, name: 'b', root: 1 },
    ],
    [
      { num: 1, branchId: 1, seq: 1 },
      { num: 2, branchId: 1, seq: 2 },
    ],
  )
  expect(hasFork(graph, 1)).toBe(true)
  expect(hasFork(graph, 2)).toBe(false)
})
