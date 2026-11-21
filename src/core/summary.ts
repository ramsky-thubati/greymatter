import { type Db, tx } from './db.js'
import { checkpointOrder } from './ordering.js'
import { getProject } from './projects.js'

export type SummaryVersion = { version: number; body: string }
export type SummaryVersionRow = SummaryVersion & { frozenAt: string | null }

function liveRow(db: Db, projectId: number): SummaryVersion {
  getProject(db, projectId)
  return db
    .prepare('SELECT version, body FROM summary_versions WHERE project_id = ? AND frozen_at IS NULL')
    .get(projectId) as SummaryVersion
}

export function getLiveSummary(db: Db, projectId: number): SummaryVersion {
  const { version, body } = liveRow(db, projectId)
  return { version, body }
}

export function updateLiveSummary(db: Db, projectId: number, body: string): SummaryVersion {
  const { version } = liveRow(db, projectId)
  db.prepare('UPDATE summary_versions SET body = ? WHERE project_id = ? AND version = ?').run(body, projectId, version)
  return { version, body }
}

export function listSummaryVersions(db: Db, projectId: number): SummaryVersionRow[] {
  getProject(db, projectId)
  const rows = db
    .prepare('SELECT version, body, frozen_at FROM summary_versions WHERE project_id = ? ORDER BY version DESC')
    .all(projectId) as { version: number; body: string; frozen_at: string | null }[]
  return rows.map((r) => ({ version: r.version, body: r.body, frozenAt: r.frozen_at }))
}

export function createCheckpoint(
  db: Db,
  projectId: number,
): { seq: number; fromVersion: number; toVersion: number } {
  return tx(db, () => {
    const live = liveRow(db, projectId)
    const now = new Date().toISOString()
    const toVersion = live.version + 1
    db.prepare('UPDATE summary_versions SET frozen_at = ? WHERE project_id = ? AND version = ?').run(
      now,
      projectId,
      live.version,
    )
    db.prepare('INSERT INTO summary_versions (project_id, version, body, frozen_at) VALUES (?, ?, ?, NULL)').run(
      projectId,
      toVersion,
      live.body,
    )
    const { left, right } = checkpointOrder(db, projectId)
    const moving = new Set([...left, ...right])
    const settled = db
      .prepare(
        `SELECT 't' AS kind, num AS ref, seq FROM tasks WHERE project_id = ?1
         UNION ALL SELECT 'c', rowid, seq FROM checkpoints WHERE project_id = ?1
         ORDER BY seq, kind, ref`,
      )
      .all(projectId) as { kind: 't' | 'c'; ref: number }[]
    const cp = Number(
      db
        .prepare(
          'INSERT INTO checkpoints (project_id, seq, from_version, to_version, created_at) VALUES (?, 0, ?, ?, ?)',
        )
        .run(projectId, live.version, toVersion, now).lastInsertRowid,
    )
    const order = [
      ...settled.filter((r) => r.kind === 'c' || !moving.has(r.ref)),
      ...left.map((ref) => ({ kind: 't' as const, ref })),
      { kind: 'c' as const, ref: cp },
      ...right.map((ref) => ({ kind: 't' as const, ref })),
    ]
    const setTask = db.prepare('UPDATE tasks SET seq = ? WHERE project_id = ? AND num = ?')
    const setCheckpoint = db.prepare('UPDATE checkpoints SET seq = ? WHERE rowid = ?')
    order.forEach((r, i) => {
      if (r.kind === 't') setTask.run(i + 1, projectId, r.ref)
      else setCheckpoint.run(i + 1, r.ref)
    })
    const seq = order.findIndex((r) => r.kind === 'c' && r.ref === cp) + 1
    return { seq, fromVersion: live.version, toVersion }
  })
}
