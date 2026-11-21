import { beforeEach, describe, expect, test } from 'vitest'
import { addBlocker } from '../../src/core/blockers.js'
import { type Db, openDb } from '../../src/core/db.js'
import { type Graph, getGraph } from '../../src/core/graph.js'
import { createProject } from '../../src/core/projects.js'
import { createBranch, createTask, updateTask } from '../../src/core/tasks.js'
import { addCheckpoint, mainBranchId } from './helpers.js'

let db: Db
let p: { id: number; name: string }

const task = (g: Graph, num: number) => g.tasks.find((t) => t.num === num)!
const branch = (g: Graph, name: string) => g.branches.find((b) => b.name === name)!

beforeEach(() => {
  db = openDb(':memory:')
  p = createProject(db, 'A')
  const main = mainBranchId(db, p.id)
  createTask(db, p.id, { branchId: main, title: 'T1' })
  updateTask(db, p.id, 1, { state: 'in_progress' })
  const weld = createBranch(db, p.id, { name: 'weld', fromTaskNum: 1 })
  createTask(db, p.id, { branchId: weld.id, title: 'T2' })
  createTask(db, p.id, { branchId: weld.id, title: 'T3' })
})

describe('graph', () => {
  test('cross-branch blocker makes the branch stuck', () => {
    addBlocker(db, p.id, 2, 1)
    const g = getGraph(db, p.id)
    expect(task(g, 2)).toMatchObject({ blocked: true, blockedBy: [1] })
    expect(task(g, 1)).toMatchObject({ blocked: false, blockedBy: [] })
    expect(branch(g, 'weld')).toMatchObject({ nextTaskNum: 2, stuck: true, taskNums: [2, 3] })
  })

  test('later is skipped for next task and does not make a branch stuck', () => {
    addBlocker(db, p.id, 2, 1)
    updateTask(db, p.id, 2, { state: 'later' })
    expect(branch(getGraph(db, p.id), 'weld')).toMatchObject({ nextTaskNum: 3, stuck: false, finished: false })
  })

  test('cancelled blocker stops blocking and flags the waiting task', () => {
    addBlocker(db, p.id, 2, 1)
    updateTask(db, p.id, 1, { state: 'cancelled' })
    expect(task(getGraph(db, p.id), 2)).toMatchObject({ blocked: false, flagged: true })
  })

  test('finished when all tasks done or cancelled', () => {
    updateTask(db, p.id, 2, { state: 'done' })
    updateTask(db, p.id, 3, { state: 'cancelled' })
    expect(branch(getGraph(db, p.id), 'weld')).toMatchObject({ finished: true, nextTaskNum: null, stuck: false })
    expect(branch(getGraph(db, p.id), 'main')).toMatchObject({ finished: false })
  })

  test('an empty branch is not finished', () => {
    const fresh = createProject(db, 'B')
    const g = getGraph(db, fresh.id)
    expect(branch(g, 'main')).toMatchObject({ finished: false, nextTaskNum: null, stuck: false })
  })

  test('branches by creation, tasks by seq, checkpoints and live version', () => {
    addCheckpoint(db, p.id, 4)
    db.prepare('UPDATE summary_versions SET frozen_at = ? WHERE project_id=? AND version=1').run('x', p.id)
    db.prepare("INSERT INTO summary_versions (project_id, version, body) VALUES (?, 2, '')").run(p.id)
    const g = getGraph(db, p.id)
    expect(g.project).toEqual(p)
    expect(g.branches.map((b) => b.name)).toEqual(['main', 'weld'])
    expect(g.tasks.map((t) => t.num)).toEqual([1, 2, 3])
    expect(g.checkpoints).toEqual([{ seq: 4, fromVersion: 1, toVersion: 2 }])
    expect(g.liveVersion).toBe(2)
  })
})
