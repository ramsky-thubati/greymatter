import { beforeEach, describe, expect, test } from 'vitest'
import { type Db, openDb } from '../../src/core/db.js'
import { moveTask, relinkBranch } from '../../src/core/ordering.js'
import { createProject } from '../../src/core/projects.js'
import { createBranch, createTask, getTask } from '../../src/core/tasks.js'
import { addCheckpoint, branchNums, branchSeqs, mainBranchId, seqOrder } from './helpers.js'

let db: Db
let p: { id: number; name: string }
let main: number

const invalid = expect.objectContaining({ code: 'invalid' })

beforeEach(() => {
  db = openDb(':memory:')
  p = createProject(db, 'A')
  main = mainBranchId(db, p.id)
  for (const title of ['a', 'b', 'c']) createTask(db, p.id, { branchId: main, title })
  addCheckpoint(db, p.id, 3)
  db.prepare('UPDATE tasks SET seq = 4 WHERE project_id = ? AND num = 3').run(p.id)
})

describe('insert via createTask', () => {
  test('before lands just before the target and shifts the rest', () => {
    const t = createTask(db, p.id, { branchId: main, title: 'new', before: 2 })
    expect(branchNums(db, main)).toEqual([1, t.num, 2, 3])
    expect(seqOrder(db, p.id)).toEqual(['T1', `T${t.num}`, 'T2', 'CP', 'T3'])
  })

  test('after the last task lands just after it', () => {
    const t = createTask(db, p.id, { branchId: main, title: 'tail', after: 3 })
    expect(seqOrder(db, p.id).at(-1)).toBe(`T${t.num}`)
    expect(branchNums(db, main)).toEqual([1, 2, 3, t.num])
  })

  test('inserting before a task left of a checkpoint lands left of it', () => {
    const t = createTask(db, p.id, { branchId: main, title: 'old-insert', before: 2 })
    const order = seqOrder(db, p.id)
    expect(order.indexOf(`T${t.num}`)).toBeLessThan(order.indexOf('CP'))
  })

  test('rejects both before and after, and a target on another branch', () => {
    expect(() => createTask(db, p.id, { branchId: main, title: 'x', before: 1, after: 2 })).toThrow(invalid)
    const other = createBranch(db, p.id, { name: 'side' })
    expect(() => createTask(db, p.id, { branchId: other.id, title: 'x', before: 1 })).toThrow(invalid)
    expect(branchNums(db, main)).toEqual([1, 2, 3])
    expect(branchNums(db, other.id)).toEqual([])
  })
})

describe('moveTask', () => {
  test('moves a task before another and keeps seq compact', () => {
    moveTask(db, p.id, 3, { before: 1 })
    expect(branchNums(db, main)).toEqual([3, 1, 2])
    expect(seqOrder(db, p.id)).toEqual(['T3', 'T1', 'T2', 'CP'])
  })

  test('moves a task after another', () => {
    moveTask(db, p.id, 1, { after: 2 })
    expect(branchNums(db, main)).toEqual([2, 1, 3])
  })

  test('moving across a checkpoint keeps the branch line monotonic in seq', () => {
    moveTask(db, p.id, 1, { after: 3 })
    const seqs = branchSeqs(db, main)
    expect([...seqs].sort((a, b) => a - b)).toEqual(seqs)
  })

  test('rejects bad arguments', () => {
    const other = createBranch(db, p.id, { name: 'side' })
    const o = createTask(db, p.id, { branchId: other.id, title: 'o' })
    expect(() => moveTask(db, p.id, 1, {})).toThrow(invalid)
    expect(() => moveTask(db, p.id, 1, { before: 2, after: 3 })).toThrow(invalid)
    expect(() => moveTask(db, p.id, 1, { before: 1 })).toThrow(invalid)
    expect(() => moveTask(db, p.id, 1, { before: o.num })).toThrow(invalid)
    expect(() => moveTask(db, p.id, 1, { before: 99 })).toThrow(expect.objectContaining({ code: 'not_found' }))
  })
})

describe('relinkBranch', () => {
  test('cut-and-rejoin keeps branch lines monotonic in seq and creates titled tasks', () => {
    const out = relinkBranch(db, p.id, main, [{ num: 3 }, { num: 1 }, { title: 'mid' }, { num: 2 }])
    expect(out.map((t) => t.title)).toEqual(['c', 'a', 'mid', 'b'])
    const seqs = branchSeqs(db, main)
    expect([...seqs].sort((a, b) => a - b)).toEqual(seqs)
    expect(new Set(seqOrder(db, p.id)).size).toBe(5)
  })

  test('seq stays compact 1..n across tasks and checkpoints', () => {
    relinkBranch(db, p.id, main, [{ num: 3 }, { num: 1 }, { title: 'n' }, { num: 2 }])
    const rows = db
      .prepare(
        `SELECT seq FROM tasks WHERE project_id = ?1 UNION ALL SELECT seq FROM checkpoints WHERE project_id = ?1 ORDER BY seq`,
      )
      .all(p.id) as { seq: number }[]
    expect(rows.map((r) => r.seq)).toEqual([1, 2, 3, 4, 5])
  })

  test('several new tasks before one anchor keep their order', () => {
    relinkBranch(db, p.id, main, [{ num: 1 }, { title: 'x' }, { title: 'y' }, { num: 2 }, { num: 3 }])
    expect(seqOrder(db, p.id)).toEqual(['T1', 'T4', 'T5', 'T2', 'CP', 'T3'])
  })

  test('rejects missing or duplicate tasks and blank titles', () => {
    expect(() => relinkBranch(db, p.id, main, [{ num: 1 }, { num: 1 }])).toThrow(invalid)
    expect(() => relinkBranch(db, p.id, main, [{ num: 1 }, { num: 2 }])).toThrow(invalid)
    expect(() => relinkBranch(db, p.id, main, [{ num: 1 }, { num: 2 }, { num: 3 }, { num: 9 }])).toThrow(invalid)
    expect(() => relinkBranch(db, p.id, main, [{ num: 1 }, { num: 2 }, { num: 3 }, { title: ' ' }])).toThrow(invalid)
    expect(branchNums(db, main)).toEqual([1, 2, 3])
    expect(getTask(db, p.id, 1).branchPos).toBe(1)
  })
})
