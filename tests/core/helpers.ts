import type { Db } from '../../src/core/db.js'

export function mainBranchId(db: Db, projectId: number): number {
  const row = db
    .prepare("SELECT id FROM branches WHERE project_id=? AND name='main'")
    .get(projectId) as { id: number }
  return row.id
}

export function maxSeq(db: Db, projectId: number): number {
  const row = db
    .prepare(
      `SELECT MAX(seq) AS m FROM (
         SELECT seq FROM tasks WHERE project_id=?1
         UNION ALL SELECT seq FROM checkpoints WHERE project_id=?1)`,
    )
    .get(projectId) as { m: number | null }
  return row.m ?? 0
}

export function maxBranchPos(db: Db, branchId: number): number {
  const row = db.prepare('SELECT MAX(branch_pos) AS m FROM tasks WHERE branch_id=?').get(branchId) as {
    m: number | null
  }
  return row.m ?? 0
}
