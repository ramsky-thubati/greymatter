// @vitest-environment jsdom
import { afterEach, expect, test } from 'vitest'
import type { Project } from '../../src/core/types.js'
import { loadSort, saveSort, sortProjects } from '../../src/web/projectSort.js'

const p = (id: number, name: string, createdAt: string, updatedAt: string): Project => ({
  id,
  name,
  status: 'in_progress',
  createdAt,
  updatedAt,
})

const list = [p(1, 'beta', '2026-01-02', '2026-01-05'), p(2, 'Alpha', '2026-01-01', '2026-01-09'), p(3, 'gamma', '2026-01-03', '2026-01-03')]
const names = (ps: Project[]) => ps.map((x) => x.name)

afterEach(() => localStorage.clear())

test('sorts by updated and created newest first, name A-Z ignoring case', () => {
  expect(names(sortProjects(list, 'updated'))).toEqual(['Alpha', 'beta', 'gamma'])
  expect(names(sortProjects(list, 'created'))).toEqual(['gamma', 'beta', 'Alpha'])
  expect(names(sortProjects(list, 'name'))).toEqual(['Alpha', 'beta', 'gamma'])
  expect(names(list)).toEqual(['beta', 'Alpha', 'gamma'])
})

test('ties on timestamp fall back to newest id', () => {
  const tied = [p(1, 'a', 'x', 'x'), p(2, 'b', 'x', 'x')]
  expect(names(sortProjects(tied, 'updated'))).toEqual(['b', 'a'])
})

test('load defaults to updated and ignores junk', () => {
  expect(loadSort()).toBe('updated')
  localStorage.setItem('greymatter.projectSort', 'bogus')
  expect(loadSort()).toBe('updated')
  saveSort('name')
  expect(loadSort()).toBe('name')
})
