import { type Db, tx } from './db.js'
import { getProject } from './projects.js'
import { nextSeq } from './sequence.js'

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
    const seq = nextSeq(db, projectId)
    db.prepare(
      'INSERT INTO checkpoints (project_id, seq, from_version, to_version, created_at) VALUES (?, ?, ?, ?, ?)',
    ).run(projectId, seq, live.version, toVersion, now)
    return { seq, fromVersion: live.version, toVersion }
  })
}
