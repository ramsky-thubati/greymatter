import type { Db } from './db.js'

export function nextSeq(db: Db, projectId: number): number {
  const row = db
    .prepare(
      `SELECT MAX(seq) AS m FROM (
         SELECT seq FROM tasks WHERE project_id = ?1
         UNION ALL SELECT seq FROM checkpoints WHERE project_id = ?1)`,
    )
    .get(projectId) as { m: number | null }
  return (row.m ?? 0) + 1
}

export function shiftSeqFrom(db: Db, projectId: number, seq: number): void {
  db.prepare('UPDATE tasks SET seq = seq + 1 WHERE project_id = ? AND seq >= ?').run(projectId, seq)
  db.prepare('UPDATE checkpoints SET seq = seq + 1 WHERE project_id = ? AND seq >= ?').run(projectId, seq)
}
