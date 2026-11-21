import { expect, test } from 'vitest'
import { openDb } from '../../src/core/db.js'
import { createProject, findProjectByName } from '../../src/core/projects.js'

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
