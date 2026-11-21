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

export function addCheckpoint(db: Db, projectId: number, seq: number): void {
  db.prepare(
    'INSERT INTO checkpoints (project_id, seq, from_version, to_version, created_at) VALUES (?, ?, 1, 2, ?)',
  ).run(projectId, seq, new Date().toISOString())
}

export function seqOrder(db: Db, projectId: number): string[] {
  const rows = db
    .prepare(
      `SELECT seq, 'T' || num AS label FROM tasks WHERE project_id = ?1
       UNION ALL SELECT seq, 'CP' FROM checkpoints WHERE project_id = ?1
       ORDER BY seq`,
    )
    .all(projectId) as { label: string }[]
  return rows.map((r) => r.label)
}

export function branchNums(db: Db, branchId: number): number[] {
  const rows = db.prepare('SELECT num FROM tasks WHERE branch_id = ? ORDER BY branch_pos').all(branchId) as {
    num: number
  }[]
  return rows.map((r) => r.num)
}

export function branchSeqs(db: Db, branchId: number): number[] {
  const rows = db.prepare('SELECT seq FROM tasks WHERE branch_id = ? ORDER BY branch_pos').all(branchId) as {
    seq: number
  }[]
  return rows.map((r) => r.seq)
}
