import { type Db, tx } from './db.js'
import { DomainError } from './errors.js'
import { formatTaskId } from './ids.js'
import { getBranch, getTask } from './tasks.js'
import type { Branch } from './types.js'

const nums = (rows: unknown[], key: string): number[] => (rows as Record<string, number>[]).map((r) => r[key])

function forkedFrom(db: Db, projectId: number, taskNums: number[], excludeBranch?: number): number[] {
  if (taskNums.length === 0) return []
  const marks = taskNums.map(() => '?').join(',')
  return nums(
    db
      .prepare(
        `SELECT id FROM branches WHERE project_id = ? AND id != ? AND root_task_num IN (${marks}) ORDER BY id`,
      )
      .all(projectId, excludeBranch ?? -1, ...taskNums),
    'id',
  )
}

function dependentsOf(db: Db, projectId: number, taskNums: number[]): number[] {
  if (taskNums.length === 0) return []
  const marks = taskNums.map(() => '?').join(',')
  return nums(
    db
      .prepare(
        `SELECT DISTINCT task_num AS n FROM blockers
         WHERE project_id = ? AND blocker_num IN (${marks}) AND task_num NOT IN (${marks}) ORDER BY task_num`,
      )
      .all(projectId, ...taskNums, ...taskNums),
    'n',
  )
}

function refuseForked(forkedBranches: number[], what: string): void {
  if (forkedBranches.length > 0) {
    throw new DomainError('conflict', `${what} is the fork point of other branches`, { forkedBranches })
  }
}

function refuseDependents(dependents: number[], what: string): void {
  if (dependents.length > 0) {
    throw new DomainError(
      'conflict',
      `${dependents.map(formatTaskId).join(', ')} blocked by ${what}; confirm to drop those blockers`,
      { dependents },
    )
  }
}

function dropBlockers(db: Db, projectId: number, taskNums: number[]): void {
  const del = db.prepare('DELETE FROM blockers WHERE project_id = ? AND (task_num = ?2 OR blocker_num = ?2)')
  for (const n of taskNums) del.run(projectId, n)
}

export function deleteTask(db: Db, projectId: number, num: number, opts: { confirm?: boolean }): void {
  tx(db, () => {
    const task = getTask(db, projectId, num)
    refuseForked(forkedFrom(db, projectId, [num]), formatTaskId(num))
    if (!opts.confirm) refuseDependents(dependentsOf(db, projectId, [num]), formatTaskId(num))
    dropBlockers(db, projectId, [num])
    db.prepare('DELETE FROM tasks WHERE project_id = ? AND num = ?').run(projectId, num)
    const rest = nums(
      db.prepare('SELECT num FROM tasks WHERE branch_id = ? ORDER BY branch_pos').all(task.branchId),
      'num',
    )
    const setPos = db.prepare('UPDATE tasks SET branch_pos = ? WHERE project_id = ? AND num = ?')
    rest.forEach((n, i) => setPos.run(i + 1, projectId, n))
  })
}

function branchTaskNums(db: Db, branchId: number): number[] {
  return nums(db.prepare('SELECT num FROM tasks WHERE branch_id = ? ORDER BY branch_pos').all(branchId), 'num')
}

export function deleteBranch(db: Db, projectId: number, branchId: number, opts: { confirm?: boolean }): void {
  tx(db, () => {
    const branch = getBranch(db, projectId, branchId)
    const own = branchTaskNums(db, branchId)
    refuseForked(forkedFrom(db, projectId, own, branchId), `Branch "${branch.name}"`)
    if (!opts.confirm) refuseDependents(dependentsOf(db, projectId, own), `branch "${branch.name}"`)
    dropBlockers(db, projectId, own)
    db.prepare('DELETE FROM tasks WHERE branch_id = ?').run(branchId)
    db.prepare('DELETE FROM branches WHERE id = ?').run(branchId)
  })
}

function subtreeBranchIds(db: Db, projectId: number, branchId: number): Set<number> {
  const seen = new Set([branchId])
  let frontier = [branchId]
  while (frontier.length > 0) {
    const taskNums = frontier.flatMap((id) => branchTaskNums(db, id))
    frontier = forkedFrom(db, projectId, taskNums).filter((id) => !seen.has(id))
    frontier.forEach((id) => seen.add(id))
  }
  return seen
}

export function moveRoot(db: Db, projectId: number, branchId: number, rootTaskNum: number | null): Branch {
  return tx(db, () => {
    getBranch(db, projectId, branchId)
    if (rootTaskNum !== null) {
      const target = getTask(db, projectId, rootTaskNum)
      if (subtreeBranchIds(db, projectId, branchId).has(target.branchId)) {
        throw new DomainError(
          'invalid',
          `${formatTaskId(rootTaskNum)} is in this branch or one forked from it; cannot root the branch there`,
        )
      }
    }
    db.prepare('UPDATE branches SET root_task_num = ? WHERE id = ?').run(rootTaskNum, branchId)
    return getBranch(db, projectId, branchId)
  })
}
