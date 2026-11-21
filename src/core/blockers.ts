import { type Db, tx } from './db.js'
import { DomainError } from './errors.js'
import { formatTaskId } from './ids.js'
import { getTask } from './tasks.js'

function reaches(db: Db, projectId: number, from: number, target: number): boolean {
  const seen = new Set<number>()
  const stack = [from]
  const next = db.prepare('SELECT blocker_num AS n FROM blockers WHERE project_id = ? AND task_num = ?')
  while (stack.length > 0) {
    const cur = stack.pop()!
    if (cur === target) return true
    if (seen.has(cur)) continue
    seen.add(cur)
    for (const row of next.all(projectId, cur) as { n: number }[]) stack.push(row.n)
  }
  return false
}

export function addBlocker(db: Db, projectId: number, taskNum: number, blockerNum: number): void {
  tx(db, () => {
    getTask(db, projectId, taskNum)
    getTask(db, projectId, blockerNum)
    if (taskNum === blockerNum) {
      throw new DomainError('invalid', `${formatTaskId(taskNum)} cannot block itself`)
    }
    if (reaches(db, projectId, blockerNum, taskNum)) {
      throw new DomainError(
        'invalid',
        `${formatTaskId(blockerNum)} already depends on ${formatTaskId(taskNum)}; this would create a cycle`,
      )
    }
    db.prepare('INSERT OR IGNORE INTO blockers (project_id, task_num, blocker_num) VALUES (?, ?, ?)').run(
      projectId,
      taskNum,
      blockerNum,
    )
  })
}

export function removeBlocker(db: Db, projectId: number, taskNum: number, blockerNum: number): void {
  db.prepare('DELETE FROM blockers WHERE project_id = ? AND task_num = ? AND blocker_num = ?').run(
    projectId,
    taskNum,
    blockerNum,
  )
}
