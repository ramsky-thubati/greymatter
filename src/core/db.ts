import { DatabaseSync } from 'node:sqlite'
import { BRANCH_COLORS } from './colors.js'

export type Db = DatabaseSync

const SCHEMA = `
CREATE TABLE IF NOT EXISTS projects (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL UNIQUE COLLATE NOCASE,
  next_task_num INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'in_progress' CHECK (status IN ('in_progress','complete')),
  updated_at TEXT
);
CREATE TABLE IF NOT EXISTS branches (
  id INTEGER PRIMARY KEY,
  project_id INTEGER NOT NULL REFERENCES projects(id),
  name TEXT NOT NULL,
  purpose TEXT NOT NULL DEFAULT '',
  root_task_num INTEGER,
  created_at TEXT NOT NULL,
  color TEXT
);
CREATE TABLE IF NOT EXISTS tasks (
  project_id INTEGER NOT NULL,
  num INTEGER NOT NULL,
  branch_id INTEGER NOT NULL REFERENCES branches(id),
  title TEXT NOT NULL,
  details TEXT NOT NULL DEFAULT '',
  state TEXT NOT NULL DEFAULT 'todo' CHECK (state IN ('todo','in_progress','later','done','cancelled')),
  branch_pos INTEGER NOT NULL,
  seq INTEGER NOT NULL,
  flagged INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (project_id, num)
);
CREATE TABLE IF NOT EXISTS blockers (
  project_id INTEGER NOT NULL,
  task_num INTEGER NOT NULL,
  blocker_num INTEGER NOT NULL,
  PRIMARY KEY (project_id, task_num, blocker_num)
);
CREATE TABLE IF NOT EXISTS summary_versions (
  project_id INTEGER NOT NULL,
  version INTEGER NOT NULL,
  body TEXT NOT NULL,
  frozen_at TEXT,
  PRIMARY KEY (project_id, version)
);
CREATE TABLE IF NOT EXISTS checkpoints (
  project_id INTEGER NOT NULL,
  seq INTEGER NOT NULL,
  from_version INTEGER NOT NULL,
  to_version INTEGER NOT NULL,
  created_at TEXT NOT NULL
);
`

export function openDb(path: string): Db {
  const db = new DatabaseSync(path)
  db.exec('PRAGMA foreign_keys=ON')
  db.exec('PRAGMA journal_mode=WAL')
  db.exec(SCHEMA)
  migrate(db)
  return db
}

const hasColumn = (db: Db, table: string, column: string) =>
  (db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]).some((c) => c.name === column)

function migrate(db: Db): void {
  migrateBranchColor(db)
  if (!hasColumn(db, 'projects', 'status'))
    db.exec(
      "ALTER TABLE projects ADD COLUMN status TEXT NOT NULL DEFAULT 'in_progress' CHECK (status IN ('in_progress','complete'))",
    )
  if (!hasColumn(db, 'projects', 'updated_at')) db.exec('ALTER TABLE projects ADD COLUMN updated_at TEXT')
  db.exec('UPDATE projects SET updated_at = created_at WHERE updated_at IS NULL')
}

function migrateBranchColor(db: Db): void {
  if (hasColumn(db, 'branches', 'color')) return
  tx(db, () => {
    db.exec('ALTER TABLE branches ADD COLUMN color TEXT')
    const rows = db.prepare('SELECT id, project_id FROM branches ORDER BY project_id, created_at, id').all() as {
      id: number
      project_id: number
    }[]
    const set = db.prepare('UPDATE branches SET color = ? WHERE id = ?')
    const seen = new Map<number, number>()
    for (const r of rows) {
      const i = seen.get(r.project_id) ?? 0
      set.run(BRANCH_COLORS[i % BRANCH_COLORS.length], r.id)
      seen.set(r.project_id, i + 1)
    }
  })
}

export function tx<T>(db: Db, fn: () => T): T {
  if (db.isTransaction) return fn()
  db.exec('BEGIN')
  try {
    const result = fn()
    db.exec('COMMIT')
    return result
  } catch (err) {
    db.exec('ROLLBACK')
    throw err
  }
}
