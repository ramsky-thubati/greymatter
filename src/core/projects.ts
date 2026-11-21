import { BRANCH_COLORS } from './colors.js'
import { type Db, tx } from './db.js'
import { DomainError } from './errors.js'
import type { Project } from './types.js'

interface ProjectRow {
  id: number
  name: string
}

const toProject = (row: ProjectRow): Project => ({ id: row.id, name: row.name })

export function createProject(db: Db, name: string): Project {
  const clean = name.trim()
  if (!clean) throw new DomainError('invalid', 'Project name must not be blank')
  return tx(db, () => {
    const existing = db.prepare('SELECT id FROM projects WHERE name = ?').get(clean)
    if (existing) throw new DomainError('conflict', `Project "${clean}" already exists`)
    const now = new Date().toISOString()
    const { lastInsertRowid } = db
      .prepare('INSERT INTO projects (name, created_at) VALUES (?, ?)')
      .run(clean, now)
    const id = Number(lastInsertRowid)
    db.prepare("INSERT INTO branches (project_id, name, created_at, color) VALUES (?, 'main', ?, ?)").run(
      id,
      now,
      BRANCH_COLORS[0],
    )
    db.prepare("INSERT INTO summary_versions (project_id, version, body) VALUES (?, 1, '')").run(id)
    return { id, name: clean }
  })
}

export function listProjects(db: Db): Project[] {
  const rows = db.prepare('SELECT id, name FROM projects ORDER BY id').all() as unknown as ProjectRow[]
  return rows.map(toProject)
}

export function getProject(db: Db, id: number): Project {
  const row = db.prepare('SELECT id, name FROM projects WHERE id = ?').get(id) as ProjectRow | undefined
  if (!row) throw new DomainError('not_found', `Project ${id} not found`)
  return toProject(row)
}

export function findProjectByName(db: Db, name: string): Project {
  const clean = name.trim()
  const row = db.prepare('SELECT id, name FROM projects WHERE name = ?').get(clean) as ProjectRow | undefined
  if (!row) throw new DomainError('not_found', `Project "${clean}" not found`)
  return toProject(row)
}
