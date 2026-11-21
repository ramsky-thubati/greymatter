import { beforeEach, describe, expect, test } from 'vitest'
import { BRANCH_COLORS } from '../../src/core/colors.js'
import { type Db, openDb } from '../../src/core/db.js'
import { createProject } from '../../src/core/projects.js'
import { nextSeq, shiftSeqFrom } from '../../src/core/sequence.js'
import {
  createBranch,
  createTask,
  getBranch,
  getTask,
  resumeTask,
  updateBranch,
  updateTask,
} from '../../src/core/tasks.js'
import { maxBranchPos, maxSeq, mainBranchId } from './helpers.js'

let db: Db
let p: { id: number; name: string }
let main: number

beforeEach(() => {
  db = openDb(':memory:')
  p = createProject(db, 'A')
  main = mainBranchId(db, p.id)
})

describe('tasks', () => {
  test('task numbers count up per project and are never reused', () => {
    expect(createTask(db, p.id, { branchId: main, title: 'one' }).num).toBe(1)
    expect(createTask(db, p.id, { branchId: main, title: 'two' }).num).toBe(2)
    db.prepare('DELETE FROM tasks WHERE project_id=? AND num=2').run(p.id)
    expect(createTask(db, p.id, { branchId: main, title: 'three' }).num).toBe(3)
    const q = createProject(db, 'B')
    expect(createTask(db, q.id, { branchId: mainBranchId(db, q.id), title: 'x' }).num).toBe(1)
  })

  test('new tasks go to the end of branch and sequence', () => {
    createTask(db, p.id, { branchId: main, title: 'a' })
    const t = createTask(db, p.id, { branchId: main, title: 'x', details: 'd' })
    expect(t).toMatchObject({ seq: maxSeq(db, p.id), branchPos: maxBranchPos(db, main), details: 'd', state: 'todo', flagged: false })
    expect(t.seq).toBe(2)
    expect(t.branchPos).toBe(2)
  })

  test('rejects blank title and foreign branch', () => {
    expect(() => createTask(db, p.id, { branchId: main, title: '  ' })).toThrow(expect.objectContaining({ code: 'invalid' }))
    const q = createProject(db, 'B')
    expect(() => createTask(db, p.id, { branchId: mainBranchId(db, q.id), title: 'x' })).toThrow(expect.objectContaining({ code: 'not_found' }))
  })

  test('updating a flagged task clears the flag', () => {
    createTask(db, p.id, { branchId: main, title: 'a' })
    db.prepare('UPDATE tasks SET flagged=1 WHERE project_id=? AND num=1').run(p.id)
    expect(getTask(db, p.id, 1).flagged).toBe(true)
    const t = updateTask(db, p.id, 1, { details: 'new' })
    expect(t).toMatchObject({ flagged: false, details: 'new', title: 'a' })
    expect(getTask(db, p.id, 1).flagged).toBe(false)
  })

  test('updateTask changes state and validates input', () => {
    createTask(db, p.id, { branchId: main, title: 'a' })
    expect(updateTask(db, p.id, 1, { state: 'later', title: ' b ' })).toMatchObject({ state: 'later', title: 'b' })
    expect(() => updateTask(db, p.id, 1, { title: ' ' })).toThrow(expect.objectContaining({ code: 'invalid' }))
    expect(() => updateTask(db, p.id, 1, { state: 'bogus' as never })).toThrow(expect.objectContaining({ code: 'invalid' }))
  })

  test('unknown task names the project', () => {
    expect(() => getTask(db, p.id, 999)).toThrow(/T-999.*"A"/)
    expect(() => getTask(db, p.id, 999)).toThrow(expect.objectContaining({ code: 'not_found' }))
  })
})

describe('resume', () => {
  test('sets in_progress and returns live summary', () => {
    createTask(db, p.id, { branchId: main, title: 'a' })
    expect(resumeTask(db, p.id, 1)).toMatchObject({ task: { state: 'in_progress' }, summary: '' })
    expect(getTask(db, p.id, 1).state).toBe('in_progress')
  })

  test('returns the unfrozen summary body', () => {
    createTask(db, p.id, { branchId: main, title: 'a' })
    db.prepare("UPDATE summary_versions SET frozen_at='x' WHERE project_id=? AND version=1").run(p.id)
    db.prepare("INSERT INTO summary_versions (project_id, version, body) VALUES (?, 2, 'live `body`\n')").run(p.id)
    expect(resumeTask(db, p.id, 1).summary).toBe('live `body`\n')
  })

  test('blocked task conflicts with blockedBy; done and cancelled blockers do not block', () => {
    for (const t of ['a', 'b', 'c', 'd']) createTask(db, p.id, { branchId: main, title: t })
    const add = db.prepare('INSERT INTO blockers (project_id, task_num, blocker_num) VALUES (?, 4, ?)')
    for (const n of [1, 2, 3]) add.run(p.id, n)
    updateTask(db, p.id, 2, { state: 'done' })
    updateTask(db, p.id, 3, { state: 'cancelled' })
    expect(() => resumeTask(db, p.id, 4)).toThrow(
      expect.objectContaining({ code: 'conflict', details: { blockedBy: [1] } }),
    )
    expect(getTask(db, p.id, 4).state).toBe('todo')
    updateTask(db, p.id, 1, { state: 'done' })
    expect(resumeTask(db, p.id, 4).task.state).toBe('in_progress')
  })
})

describe('branches', () => {
  test('fork branch from a task in the same project only', () => {
    createTask(db, p.id, { branchId: main, title: 'a' })
    const b = createBranch(db, p.id, { name: ' Weld mounts ', purpose: 'mounts', fromTaskNum: 1 })
    expect(b).toMatchObject({ name: 'Weld mounts', purpose: 'mounts', rootTaskNum: 1, projectId: p.id })
    const other = createProject(db, 'B')
    expect(() => createBranch(db, other.id, { name: 'x', fromTaskNum: 1 })).toThrow(expect.objectContaining({ code: 'not_found' }))
    expect(() => createBranch(db, p.id, { name: '  ' })).toThrow(expect.objectContaining({ code: 'invalid' }))
    expect(createBranch(db, p.id, { name: 'free' }).rootTaskNum).toBeNull()
  })

  test('update and get branch, scoped to project', () => {
    const b = createBranch(db, p.id, { name: 'x' })
    expect(updateBranch(db, p.id, b.id, { purpose: 'why' })).toMatchObject({ name: 'x', purpose: 'why' })
    expect(updateBranch(db, p.id, b.id, { name: ' y ' }).name).toBe('y')
    expect(getBranch(db, p.id, b.id).name).toBe('y')
    expect(() => updateBranch(db, p.id, b.id, { name: ' ' })).toThrow(expect.objectContaining({ code: 'invalid' }))
    const other = createProject(db, 'B')
    expect(() => getBranch(db, other.id, b.id)).toThrow(expect.objectContaining({ code: 'not_found' }))
  })
})

describe('sequence', () => {
  test('nextSeq counts tasks and checkpoints; shiftSeqFrom moves both', () => {
    expect(nextSeq(db, p.id)).toBe(1)
    createTask(db, p.id, { branchId: main, title: 'a' })
    createTask(db, p.id, { branchId: main, title: 'b' })
    db.prepare('INSERT INTO checkpoints (project_id, seq, from_version, to_version, created_at) VALUES (?, 3, 1, 2, ?)').run(p.id, 'x')
    expect(nextSeq(db, p.id)).toBe(4)
    shiftSeqFrom(db, p.id, 2)
    expect(getTask(db, p.id, 1).seq).toBe(1)
    expect(getTask(db, p.id, 2).seq).toBe(3)
    expect((db.prepare('SELECT seq FROM checkpoints WHERE project_id=?').get(p.id) as { seq: number }).seq).toBe(4)
  })

  test('shiftSeqFrom ignores other projects', () => {
    const q = createProject(db, 'B')
    createTask(db, q.id, { branchId: mainBranchId(db, q.id), title: 'x' })
    shiftSeqFrom(db, p.id, 1)
    expect(getTask(db, q.id, 1).seq).toBe(1)
  })
})

describe('branch colour', () => {
  test('new branches take the next rotation colour', () => {
    expect(getBranch(db, p.id, main).color).toBe(BRANCH_COLORS[0])
    const made = Array.from({ length: 6 }, (_, i) => createBranch(db, p.id, { name: `b${i}` }).color)
    expect(made).toEqual([...BRANCH_COLORS.slice(1), BRANCH_COLORS[0]])
  })

  test('updateBranch stores colour lowercase', () => {
    expect(updateBranch(db, p.id, main, { color: '#ABCDEF' }).color).toBe('#abcdef')
  })

  test('updateBranch rejects a bad colour', () => {
    expect(() => updateBranch(db, p.id, main, { color: '#12' })).toThrow('Colour must be #rrggbb')
  })
})
