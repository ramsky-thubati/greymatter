import { beforeAll, describe, expect, test } from 'vitest'
import { type Db, openDb } from '../../src/core/db.js'
import { DomainError } from '../../src/core/errors.js'
import { createProject } from '../../src/core/projects.js'
import { createCheckpoint, getLiveSummary, listSummaryVersions, updateLiveSummary } from '../../src/core/summary.js'
import { createBranch, createTask, updateTask } from '../../src/core/tasks.js'
import type { TaskState } from '../../src/core/types.js'
import { addCheckpoint, branchNums, mainBranchId, maxSeq, seqOrder } from './helpers.js'

const md = '# Engine\n\n```ts\nconst a = `x`\n```\n\nMounts done ✅\n\n'

let db: Db
let p: { id: number; name: string }

beforeAll(() => {
  db = openDb(':memory:')
  p = createProject(db, 'A')
})

describe('summary', () => {
  test('summary round-trips exactly', () => {
    updateLiveSummary(db, p.id, md)
    expect(getLiveSummary(db, p.id)).toEqual({ version: 1, body: md })
  })

  test('checkpoint freezes v1 and starts v2 as an exact copy at the end of the sequence', () => {
    const cp = createCheckpoint(db, p.id)
    expect(cp).toMatchObject({ fromVersion: 1, toVersion: 2 })
    expect(getLiveSummary(db, p.id)).toEqual({ version: 2, body: md })
    expect(listSummaryVersions(db, p.id)[1]).toMatchObject({ version: 1, body: md, frozenAt: expect.any(String) })
    expect(cp.seq).toBe(maxSeq(db, p.id))
  })

  test('updates after a checkpoint only touch the live version', () => {
    updateLiveSummary(db, p.id, 'short')
    expect(listSummaryVersions(db, p.id).map((v) => v.body)).toEqual(['short', md])
  })

  test('unknown project is not_found', () => {
    expect(() => getLiveSummary(db, 999)).toThrow(DomainError)
    expect(() => createCheckpoint(db, 999)).toThrow(DomainError)
  })
})

describe('checkpoint sorting', () => {
  let d: Db
  let pid: number
  let main: number
  const add = (branchId: number, state: TaskState = 'todo') => {
    const t = createTask(d, pid, { branchId, title: `t${state}` })
    if (state !== 'todo') updateTask(d, pid, t.num, { state })
    return t.num
  }
  const fork = (from: number) => createBranch(d, pid, { name: `from ${from}`, fromTaskNum: from }).id
  const fresh = () => {
    d = openDb(':memory:')
    pid = createProject(d, 'P').id
    main = mainBranchId(d, pid)
  }
  const twoLanes = () => {
    fresh()
    add(main, 'done')
    add(main, 'done')
    add(main)
    const b = fork(2)
    add(b, 'done')
    add(b)
    return b
  }

  test('finished tasks go left, the rest right', () => {
    twoLanes()
    createCheckpoint(d, pid)
    expect(seqOrder(d, pid)).toEqual(['T1', 'T2', 'T4', 'CP', 'T3', 'T5'])
  })

  test('cancelled counts as finished', () => {
    fresh()
    add(main, 'cancelled')
    add(main)
    createCheckpoint(d, pid)
    expect(seqOrder(d, pid)).toEqual(['T1', 'CP', 'T2'])
  })

  test('done task behind an unfinished one stays right', () => {
    fresh()
    add(main)
    add(main, 'done')
    createCheckpoint(d, pid)
    expect(seqOrder(d, pid)).toEqual(['CP', 'T1', 'T2'])
  })

  test('branch whose root stays right stays right', () => {
    fresh()
    add(main)
    add(main, 'done')
    add(fork(2), 'done')
    createCheckpoint(d, pid)
    expect(seqOrder(d, pid)).toEqual(['CP', 'T1', 'T2', 'T3'])
  })

  test('tasks left of an older checkpoint stay put', () => {
    fresh()
    add(main)
    addCheckpoint(d, pid, 2)
    add(main, 'done')
    createCheckpoint(d, pid)
    expect(seqOrder(d, pid)).toEqual(['T1', 'CP', 'T2', 'CP'])
  })

  test('nothing finished puts the line first', () => {
    fresh()
    add(main)
    add(main, 'later')
    createCheckpoint(d, pid)
    expect(seqOrder(d, pid)).toEqual(['CP', 'T1', 'T2'])
  })

  test('branch order never changes', () => {
    const b = twoLanes()
    createCheckpoint(d, pid)
    expect(branchNums(d, main)).toEqual([1, 2, 3])
    expect(branchNums(d, b)).toEqual([4, 5])
  })

  test("returned seq is the checkpoint's place", () => {
    twoLanes()
    expect(createCheckpoint(d, pid).seq).toBe(4)
  })
})
