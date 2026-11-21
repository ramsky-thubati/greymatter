import { beforeEach, describe, expect, test } from 'vitest'
import { addBlocker } from '../../src/core/blockers.js'
import { type Db, openDb } from '../../src/core/db.js'
import { type Graph, getGraph } from '../../src/core/graph.js'
import { createProject } from '../../src/core/projects.js'
import { deleteBranch, deleteTask, moveRoot } from '../../src/core/structure.js'
import { createBranch, createTask } from '../../src/core/tasks.js'
import { branchNums, mainBranchId } from './helpers.js'

let db: Db
let p: { id: number; name: string }
let main: number
let weld: { id: number }
let supplier: { id: number }
const supplierTaskNum = 4

const task = (g: Graph, num: number) => g.tasks.find((t) => t.num === num)!

beforeEach(() => {
  db = openDb(':memory:')
  p = createProject(db, 'A')
  main = mainBranchId(db, p.id)
  createTask(db, p.id, { branchId: main, title: 'T1' })
  weld = createBranch(db, p.id, { name: 'weld', fromTaskNum: 1 })
  createTask(db, p.id, { branchId: weld.id, title: 'T2' })
  createTask(db, p.id, { branchId: main, title: 'T3' })
  supplier = createBranch(db, p.id, { name: 'supplier', fromTaskNum: 2 })
  createTask(db, p.id, { branchId: supplier.id, title: 'T4' })
  addBlocker(db, p.id, 2, 1)
})

describe('deleteTask', () => {
  test('warns about dependents, then drops the blocker on confirm', () => {
    createTask(db, p.id, { branchId: main, title: 'T5' })
    addBlocker(db, p.id, 5, 3)
    expect(() => deleteTask(db, p.id, 3, {})).toThrow(
      expect.objectContaining({ code: 'conflict', details: { dependents: [5] } }),
    )
    deleteTask(db, p.id, 3, { confirm: true })
    expect(task(getGraph(db, p.id), 5).blockedBy).toEqual([])
  })

  test('removes blocker rows in both directions', () => {
    addBlocker(db, p.id, 3, 4)
    deleteTask(db, p.id, 3, {})
    expect(db.prepare('SELECT COUNT(*) AS c FROM blockers WHERE task_num = 3 OR blocker_num = 3').get()).toEqual({
      c: 0,
    })
  })

  test('refuses when a branch roots on it, even with confirm', () => {
    expect(() => deleteTask(db, p.id, 1, { confirm: true })).toThrow(
      expect.objectContaining({ code: 'conflict', details: { forkedBranches: [weld.id] } }),
    )
  })

  test('re-packs branch positions from 1', () => {
    createTask(db, p.id, { branchId: main, title: 'T5' })
    deleteTask(db, p.id, 3, {})
    expect(branchNums(db, main)).toEqual([1, 5])
    const pos = db.prepare('SELECT branch_pos FROM tasks WHERE branch_id = ? ORDER BY branch_pos').all(main)
    expect(pos).toEqual([{ branch_pos: 1 }, { branch_pos: 2 }])
  })

  test('unknown task is not_found', () => {
    expect(() => deleteTask(db, p.id, 99, {})).toThrow(expect.objectContaining({ code: 'not_found' }))
  })
})

describe('deleteBranch', () => {
  test('cannot delete a branch another branch forks from, even a sub-branch', () => {
    expect(() => deleteBranch(db, p.id, main, { confirm: true })).toThrow(
      expect.objectContaining({ code: 'conflict', details: { forkedBranches: [weld.id] } }),
    )
    expect(() => deleteBranch(db, p.id, weld.id, { confirm: true })).toThrow(
      expect.objectContaining({ code: 'conflict', details: { forkedBranches: [supplier.id] } }),
    )
  })

  test('warns about outside dependents unless confirmed', () => {
    expect(() => deleteBranch(db, p.id, supplier.id, {})).not.toThrow()
    createTask(db, p.id, { branchId: main, title: 'T5' })
    const leaf = createBranch(db, p.id, { name: 'leaf', fromTaskNum: 3 })
    createTask(db, p.id, { branchId: leaf.id, title: 'T6' })
    addBlocker(db, p.id, 5, 6)
    expect(() => deleteBranch(db, p.id, leaf.id, {})).toThrow(
      expect.objectContaining({ code: 'conflict', details: { dependents: [5] } }),
    )
  })

  test('deletes its tasks, the branch and their blocker rows', () => {
    deleteBranch(db, p.id, supplier.id, { confirm: true })
    deleteBranch(db, p.id, weld.id, { confirm: true })
    const g = getGraph(db, p.id)
    expect(g.tasks.some((t) => t.branchId === weld.id)).toBe(false)
    expect(g.branches.map((b) => b.id)).toEqual([main])
    expect(db.prepare('SELECT COUNT(*) AS c FROM blockers').get()).toEqual({ c: 0 })
  })

  test('unknown branch is not_found', () => {
    expect(() => deleteBranch(db, p.id, 999, {})).toThrow(expect.objectContaining({ code: 'not_found' }))
  })
})

describe('moveRoot', () => {
  test('rejects its own tasks and sub-branch tasks', () => {
    expect(() => moveRoot(db, p.id, weld.id, 2)).toThrow(expect.objectContaining({ code: 'invalid' }))
    expect(() => moveRoot(db, p.id, weld.id, supplierTaskNum)).toThrow(expect.objectContaining({ code: 'invalid' }))
    expect(moveRoot(db, p.id, weld.id, 3).rootTaskNum).toBe(3)
  })

  test('null makes it top-level', () => {
    expect(moveRoot(db, p.id, weld.id, null).rootTaskNum).toBeNull()
  })

  test('unknown target is not_found', () => {
    expect(() => moveRoot(db, p.id, weld.id, 99)).toThrow(expect.objectContaining({ code: 'not_found' }))
  })
})
