import { beforeEach, describe, expect, test } from 'vitest'
import { addBlocker, removeBlocker } from '../../src/core/blockers.js'
import { type Db, openDb } from '../../src/core/db.js'
import { createProject } from '../../src/core/projects.js'
import { createTask, getTask, updateTask } from '../../src/core/tasks.js'
import { mainBranchId } from './helpers.js'

let db: Db
let p: { id: number; name: string }

const blockersOf = (num: number) =>
  (
    db.prepare('SELECT blocker_num AS n FROM blockers WHERE project_id=? AND task_num=? ORDER BY n').all(p.id, num) as {
      n: number
    }[]
  ).map((r) => r.n)

beforeEach(() => {
  db = openDb(':memory:')
  p = createProject(db, 'A')
  const main = mainBranchId(db, p.id)
  for (const title of ['one', 'two', 'three']) createTask(db, p.id, { branchId: main, title })
})

describe('blockers', () => {
  test('add and remove', () => {
    addBlocker(db, p.id, 2, 1)
    addBlocker(db, p.id, 2, 1)
    expect(blockersOf(2)).toEqual([1])
    removeBlocker(db, p.id, 2, 1)
    expect(blockersOf(2)).toEqual([])
  })

  test('cycles and self-blocks are rejected', () => {
    addBlocker(db, p.id, 3, 2)
    expect(() => addBlocker(db, p.id, 2, 3)).toThrow(expect.objectContaining({ code: 'invalid' }))
    expect(() => addBlocker(db, p.id, 2, 2)).toThrow(expect.objectContaining({ code: 'invalid' }))
    addBlocker(db, p.id, 2, 1)
    expect(() => addBlocker(db, p.id, 1, 3)).toThrow(expect.objectContaining({ code: 'invalid' }))
    expect(blockersOf(1)).toEqual([])
  })

  test('unknown tasks are not found', () => {
    expect(() => addBlocker(db, p.id, 2, 99)).toThrow(expect.objectContaining({ code: 'not_found' }))
    expect(() => addBlocker(db, p.id, 99, 1)).toThrow(expect.objectContaining({ code: 'not_found' }))
  })

  test('blocker from another project is not found', () => {
    const q = createProject(db, 'B')
    createTask(db, q.id, { branchId: mainBranchId(db, q.id), title: 'x' })
    createTask(db, q.id, { branchId: mainBranchId(db, q.id), title: 'y' })
    createTask(db, q.id, { branchId: mainBranchId(db, q.id), title: 'z' })
    expect(() => addBlocker(db, p.id, 2, 99)).toThrow(expect.objectContaining({ code: 'not_found' }))
  })

  test('cancelling flags only tasks it was blocking; own edit clears flag', () => {
    addBlocker(db, p.id, 2, 1)
    updateTask(db, p.id, 1, { state: 'cancelled' })
    expect(getTask(db, p.id, 2).flagged).toBe(true)
    expect(getTask(db, p.id, 3).flagged).toBe(false)
    updateTask(db, p.id, 2, { title: 'two!' })
    expect(getTask(db, p.id, 2).flagged).toBe(false)
  })
})
