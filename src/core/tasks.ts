import { type Db, tx } from './db.js'
import { DomainError } from './errors.js'
import { formatTaskId } from './ids.js'
import { moveTask } from './ordering.js'
import { getProject } from './projects.js'
import { nextSeq } from './sequence.js'
import type { Branch, Task, TaskState } from './types.js'

const STATES: TaskState[] = ['todo', 'in_progress', 'later', 'done', 'cancelled']

interface BranchRow {
  id: number
  project_id: number
  name: string
  purpose: string
  root_task_num: number | null
}

interface TaskRow {
  project_id: number
  num: number
  branch_id: number
  title: string
  details: string
  state: TaskState
  branch_pos: number
  seq: number
  flagged: number
}

const toBranch = (r: BranchRow): Branch => ({
  id: r.id,
  projectId: r.project_id,
  name: r.name,
  purpose: r.purpose,
  rootTaskNum: r.root_task_num,
})

const toTask = (r: TaskRow): Task => ({
  projectId: r.project_id,
  num: r.num,
  branchId: r.branch_id,
  title: r.title,
  details: r.details,
  state: r.state,
  branchPos: r.branch_pos,
  seq: r.seq,
  flagged: r.flagged !== 0,
})

export function requireText(value: string, what: string): string {
  const clean = value.trim()
  if (!clean) throw new DomainError('invalid', `${what} must not be blank`)
  return clean
}

export function getBranch(db: Db, projectId: number, branchId: number): Branch {
  const row = db
    .prepare('SELECT * FROM branches WHERE id = ? AND project_id = ?')
    .get(branchId, projectId) as BranchRow | undefined
  if (!row) throw new DomainError('not_found', `Branch ${branchId} not found in project ${projectId}`)
  return toBranch(row)
}

export function createBranch(
  db: Db,
  projectId: number,
  input: { name: string; purpose?: string; fromTaskNum?: number },
): Branch {
  const name = requireText(input.name, 'Branch name')
  return tx(db, () => {
    getProject(db, projectId)
    if (input.fromTaskNum !== undefined) getTask(db, projectId, input.fromTaskNum)
    const { lastInsertRowid } = db
      .prepare(
        'INSERT INTO branches (project_id, name, purpose, root_task_num, created_at) VALUES (?, ?, ?, ?, ?)',
      )
      .run(projectId, name, input.purpose ?? '', input.fromTaskNum ?? null, new Date().toISOString())
    return getBranch(db, projectId, Number(lastInsertRowid))
  })
}

export function updateBranch(
  db: Db,
  projectId: number,
  branchId: number,
  input: { name?: string; purpose?: string },
): Branch {
  return tx(db, () => {
    const current = getBranch(db, projectId, branchId)
    const name = input.name === undefined ? current.name : requireText(input.name, 'Branch name')
    const purpose = input.purpose ?? current.purpose
    db.prepare('UPDATE branches SET name = ?, purpose = ? WHERE id = ?').run(name, purpose, branchId)
    return getBranch(db, projectId, branchId)
  })
}

export function getTask(db: Db, projectId: number, num: number): Task {
  const row = db
    .prepare('SELECT * FROM tasks WHERE project_id = ? AND num = ?')
    .get(projectId, num) as TaskRow | undefined
  if (!row) {
    const project = getProject(db, projectId)
    throw new DomainError('not_found', `Task ${formatTaskId(num)} not found in project "${project.name}"`)
  }
  return toTask(row)
}

export function createTask(
  db: Db,
  projectId: number,
  input: { branchId: number; title: string; details?: string; before?: number; after?: number },
): Task {
  const title = requireText(input.title, 'Task title')
  return tx(db, () => {
    const project = db
      .prepare('SELECT next_task_num AS n FROM projects WHERE id = ?')
      .get(projectId) as { n: number } | undefined
    if (!project) throw new DomainError('not_found', `Project ${projectId} not found`)
    getBranch(db, projectId, input.branchId)
    const last = db
      .prepare('SELECT MAX(branch_pos) AS m FROM tasks WHERE branch_id = ?')
      .get(input.branchId) as { m: number | null }
    db.prepare(
      `INSERT INTO tasks (project_id, num, branch_id, title, details, branch_pos, seq)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      projectId,
      project.n,
      input.branchId,
      title,
      input.details ?? '',
      (last.m ?? 0) + 1,
      nextSeq(db, projectId),
    )
    db.prepare('UPDATE projects SET next_task_num = ? WHERE id = ?').run(project.n + 1, projectId)
    if (input.before !== undefined || input.after !== undefined) {
      moveTask(db, projectId, project.n, { before: input.before, after: input.after })
    }
    return getTask(db, projectId, project.n)
  })
}

function applyTaskUpdate(
  db: Db,
  projectId: number,
  num: number,
  input: { title?: string; details?: string; state?: TaskState },
): Task {
  if (input.state !== undefined && !STATES.includes(input.state)) {
    throw new DomainError('invalid', `Invalid task state: "${input.state}"`)
  }
  const current = getTask(db, projectId, num)
  const title = input.title === undefined ? current.title : requireText(input.title, 'Task title')
  db.prepare(
    'UPDATE tasks SET title = ?, details = ?, state = ?, flagged = 0 WHERE project_id = ? AND num = ?',
  ).run(title, input.details ?? current.details, input.state ?? current.state, projectId, num)
  return getTask(db, projectId, num)
}

export function updateTask(
  db: Db,
  projectId: number,
  num: number,
  input: { title?: string; details?: string; state?: TaskState },
): Task {
  return tx(db, () => applyTaskUpdate(db, projectId, num, input))
}

export function resumeTask(db: Db, projectId: number, num: number): { task: Task; summary: string } {
  return tx(db, () => {
    getTask(db, projectId, num)
    const blockers = db
      .prepare(
        `SELECT b.blocker_num AS n FROM blockers b
         JOIN tasks t ON t.project_id = b.project_id AND t.num = b.blocker_num
         WHERE b.project_id = ? AND b.task_num = ? AND t.state NOT IN ('done', 'cancelled')
         ORDER BY b.blocker_num`,
      )
      .all(projectId, num) as { n: number }[]
    if (blockers.length > 0) {
      const blockedBy = blockers.map((b) => b.n)
      throw new DomainError(
        'conflict',
        `${formatTaskId(num)} is blocked by ${blockedBy.map(formatTaskId).join(', ')}`,
        { blockedBy },
      )
    }
    const task = applyTaskUpdate(db, projectId, num, { state: 'in_progress' })
    const live = db
      .prepare('SELECT body FROM summary_versions WHERE project_id = ? AND frozen_at IS NULL ORDER BY version DESC')
      .get(projectId) as { body: string } | undefined
    return { task, summary: live?.body ?? '' }
  })
}
