import type { Db } from './db.js'
import { getProject } from './projects.js'
import { UNFINISHED_BLOCKER } from './tasks.js'
import type { Branch, Project, Task, TaskState } from './types.js'

export interface GraphTask extends Task {
  blockedBy: number[]
  blocked: boolean
}

export interface GraphBranch extends Branch {
  taskNums: number[]
  nextTaskNum: number | null
  stuck: boolean
  finished: boolean
}

export interface Graph {
  project: Project
  branches: GraphBranch[]
  tasks: GraphTask[]
  checkpoints: { seq: number; fromVersion: number; toVersion: number }[]
  liveVersion: number
}

export function getGraph(db: Db, projectId: number): Graph {
  const project = getProject(db, projectId)

  const blockerRows = db
    .prepare(
      `SELECT b.task_num AS task, b.blocker_num AS blocker, (${UNFINISHED_BLOCKER}) AS open
       FROM blockers b JOIN tasks t ON t.project_id = b.project_id AND t.num = b.blocker_num
       WHERE b.project_id = ? ORDER BY b.blocker_num`,
    )
    .all(projectId) as { task: number; blocker: number; open: number }[]
  const blockedBy = new Map<number, number[]>()
  const blocked = new Set<number>()
  for (const r of blockerRows) {
    blockedBy.set(r.task, [...(blockedBy.get(r.task) ?? []), r.blocker])
    if (r.open) blocked.add(r.task)
  }

  const taskRows = db
    .prepare('SELECT * FROM tasks WHERE project_id = ? ORDER BY seq')
    .all(projectId) as {
    project_id: number
    num: number
    branch_id: number
    title: string
    details: string
    state: TaskState
    branch_pos: number
    seq: number
    flagged: number
  }[]
  const tasks: GraphTask[] = taskRows.map((r) => ({
    projectId: r.project_id,
    num: r.num,
    branchId: r.branch_id,
    title: r.title,
    details: r.details,
    state: r.state,
    branchPos: r.branch_pos,
    seq: r.seq,
    flagged: r.flagged !== 0,
    blockedBy: blockedBy.get(r.num) ?? [],
    blocked: blocked.has(r.num),
  }))

  const branchRows = db
    .prepare('SELECT * FROM branches WHERE project_id = ? ORDER BY created_at, id')
    .all(projectId) as { id: number; project_id: number; name: string; purpose: string; root_task_num: number | null }[]
  const branches: GraphBranch[] = branchRows.map((r) => {
    const own = tasks.filter((t) => t.branchId === r.id).sort((a, b) => a.branchPos - b.branchPos)
    const next = own.find((t) => t.state === 'todo' || t.state === 'in_progress')
    return {
      id: r.id,
      projectId: r.project_id,
      name: r.name,
      purpose: r.purpose,
      rootTaskNum: r.root_task_num,
      taskNums: own.map((t) => t.num),
      nextTaskNum: next?.num ?? null,
      stuck: next?.blocked ?? false,
      finished: own.length > 0 && own.every((t) => t.state === 'done' || t.state === 'cancelled'),
    }
  })

  const checkpoints = (
    db
      .prepare('SELECT seq, from_version, to_version FROM checkpoints WHERE project_id = ? ORDER BY seq')
      .all(projectId) as { seq: number; from_version: number; to_version: number }[]
  ).map((c) => ({ seq: c.seq, fromVersion: c.from_version, toVersion: c.to_version }))

  const live = db
    .prepare('SELECT MAX(version) AS v FROM summary_versions WHERE project_id = ? AND frozen_at IS NULL')
    .get(projectId) as { v: number | null }

  return { project, branches, tasks, checkpoints, liveVersion: live.v ?? 0 }
}
