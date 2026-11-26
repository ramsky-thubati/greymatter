import { BRANCH_COLORS } from './colors.js'
import { type Db, tx } from './db.js'
import { DomainError } from './errors.js'
import type { Project, ProjectStatus } from './types.js'

interface ProjectRow {
  id: number
  name: string
  status: ProjectStatus
  created_at: string
  updated_at: string
}

const COLS = 'id, name, status, created_at, updated_at'
const toProject = (row: ProjectRow): Project => ({
  id: row.id,
  name: row.name,
  status: row.status,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
})

export function createProject(db: Db, name: string): Project {
  const clean = name.trim()
  if (!clean) throw new DomainError('invalid', 'Project name must not be blank')
  return tx(db, () => {
    const existing = db.prepare('SELECT id FROM projects WHERE name = ?').get(clean)
    if (existing) throw new DomainError('conflict', `Project "${clean}" already exists`)
    const now = new Date().toISOString()
    const { lastInsertRowid } = db
      .prepare('INSERT INTO projects (name, created_at, updated_at) VALUES (?, ?, ?)')
      .run(clean, now, now)
    const id = Number(lastInsertRowid)
    db.prepare("INSERT INTO branches (project_id, name, created_at, color) VALUES (?, 'main', ?, ?)").run(
      id,
      now,
      BRANCH_COLORS[0],
    )
    db.prepare("INSERT INTO summary_versions (project_id, version, body) VALUES (?, 1, '')").run(id)
    return { id, name: clean, status: 'in_progress', createdAt: now, updatedAt: now }
  })
}

export function listProjects(db: Db): Project[] {
  const rows = db.prepare(`SELECT ${COLS} FROM projects ORDER BY id`).all() as unknown as ProjectRow[]
  return rows.map(toProject)
}

export function getProject(db: Db, id: number): Project {
  const row = db.prepare(`SELECT ${COLS} FROM projects WHERE id = ?`).get(id) as ProjectRow | undefined
  if (!row) throw new DomainError('not_found', `Project ${id} not found`)
  return toProject(row)
}

export function findProjectByName(db: Db, name: string): Project {
  const clean = name.trim()
  const row = db.prepare(`SELECT ${COLS} FROM projects WHERE name = ?`).get(clean) as ProjectRow | undefined
  if (!row) throw new DomainError('not_found', `Project "${clean}" not found`)
  return toProject(row)
}

export function setProjectStatus(db: Db, id: number, status: ProjectStatus): Project {
  return tx(db, () => {
    getProject(db, id)
    db.prepare('UPDATE projects SET status = ?, updated_at = ? WHERE id = ?').run(status, new Date().toISOString(), id)
    return getProject(db, id)
  })
}

export function touchProject(db: Db, id: number): void {
  db.prepare('UPDATE projects SET updated_at = ? WHERE id = ?').run(new Date().toISOString(), id)
}

export function deleteProject(db: Db, id: number): void {
  tx(db, () => {
    getProject(db, id)
    for (const table of ['blockers', 'tasks', 'checkpoints', 'summary_versions', 'branches'])
      db.prepare(`DELETE FROM ${table} WHERE project_id = ?`).run(id)
    db.prepare('DELETE FROM projects WHERE id = ?').run(id)
  })
}
