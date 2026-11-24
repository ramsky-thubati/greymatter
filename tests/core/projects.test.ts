import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { expect, test } from 'vitest'
import { addBlocker } from '../../src/core/blockers.js'
import { openDb } from '../../src/core/db.js'
import {
  createProject,
  deleteProject,
  findProjectByName,
  getProject,
  listProjects,
  setProjectStatus,
} from '../../src/core/projects.js'
import { createBranch, createTask } from '../../src/core/tasks.js'
import { addCheckpoint, mainBranchId } from './helpers.js'

const db = openDb(':memory:')

test('new project gets a main branch and empty summary v1', () => {
  const p = createProject(db, 'Engine build')
  const b = db.prepare('SELECT name, root_task_num FROM branches WHERE project_id=?').all(p.id)
  expect(b).toEqual([{ name: 'main', root_task_num: null }])
  const s = db.prepare('SELECT version, body, frozen_at FROM summary_versions WHERE project_id=?').all(p.id)
  expect(s).toEqual([{ version: 1, body: '', frozen_at: null }])
})

test('names are trimmed and matched case-insensitively', () => {
  createProject(db, 'Book idea')
  expect(findProjectByName(db, '  book IDEA ').name).toBe('Book idea')
  expect(() => createProject(db, 'BOOK IDEA ')).toThrow(expect.objectContaining({ code: 'conflict' }))
})

test('blank name is invalid; unknown name is not_found', () => {
  expect(() => createProject(db, '   ')).toThrow(expect.objectContaining({ code: 'invalid' }))
  expect(() => findProjectByName(db, 'nope')).toThrow(expect.objectContaining({ code: 'not_found' }))
})

test('new project is in_progress; status can be toggled', () => {
  const p = createProject(db, 'Status one')
  expect(p.status).toBe('in_progress')
  expect(setProjectStatus(db, p.id, 'complete').status).toBe('complete')
  expect(getProject(db, p.id).status).toBe('complete')
  expect(listProjects(db).find((x) => x.id === p.id)?.status).toBe('complete')
  expect(setProjectStatus(db, p.id, 'in_progress').status).toBe('in_progress')
})

test('deleteProject removes project and all its rows', () => {
  const p = createProject(db, 'Doomed')
  const main = mainBranchId(db, p.id)
  createTask(db, p.id, { branchId: main, title: 'a' })
  createTask(db, p.id, { branchId: main, title: 'b' })
  addBlocker(db, p.id, 2, 1)
  createBranch(db, p.id, { name: 'side', fromTaskNum: 1 })
  addCheckpoint(db, p.id, 99)
  deleteProject(db, p.id)
  expect(() => getProject(db, p.id)).toThrow(expect.objectContaining({ code: 'not_found' }))
  for (const table of ['branches', 'tasks', 'blockers', 'summary_versions', 'checkpoints'])
    expect(db.prepare(`SELECT COUNT(*) AS n FROM ${table} WHERE project_id=?`).get(p.id)).toEqual({ n: 0 })
})

test('unknown id is not_found for status and delete', () => {
  expect(() => setProjectStatus(db, 9999, 'complete')).toThrow(expect.objectContaining({ code: 'not_found' }))
  expect(() => deleteProject(db, 9999)).toThrow(expect.objectContaining({ code: 'not_found' }))
})

test('old db without status column migrates to in_progress', () => {
  const path = join(mkdtempSync(join(tmpdir(), 'gm-')), 'old.db')
  const raw = new DatabaseSync(path)
  raw.exec(`CREATE TABLE projects (id INTEGER PRIMARY KEY, name TEXT NOT NULL UNIQUE COLLATE NOCASE,
    next_task_num INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL);
    INSERT INTO projects (name, created_at) VALUES ('legacy', '2026-01-01')`)
  raw.close()
  expect(listProjects(openDb(path))).toEqual([{ id: 1, name: 'legacy', status: 'in_progress' }])
})
