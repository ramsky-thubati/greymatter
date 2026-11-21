import type { GraphTask } from '../core/graph.js'
import type { TaskState } from '../core/types.js'
import { api } from './api.js'
import { taskLabel } from './blockers.js'

export interface TaskDraft {
  title: string
  details: string
  state: TaskState
  blockedBy: number[]
}

export interface DraftDiff {
  patch: { title?: string; details?: string; state?: TaskState }
  add: number[]
  remove: number[]
}

export const draftOf = (t: GraphTask): TaskDraft => ({
  title: t.title,
  details: t.details,
  state: t.state,
  blockedBy: [...t.blockedBy],
})

export function diffDraft(live: GraphTask, d: TaskDraft): DraftDiff {
  const patch: DraftDiff['patch'] = {}
  if (d.title !== live.title) patch.title = d.title
  if (d.details !== live.details) patch.details = d.details
  if (d.state !== live.state) patch.state = d.state
  return {
    patch,
    add: d.blockedBy.filter((n) => !live.blockedBy.includes(n)),
    remove: live.blockedBy.filter((n) => !d.blockedBy.includes(n)),
  }
}

export function isDirty(live: GraphTask, d: TaskDraft): boolean {
  const { patch, add, remove } = diffDraft(live, d)
  return Object.keys(patch).length > 0 || add.length > 0 || remove.length > 0
}

export function rebaseDraft(
  base: TaskDraft,
  draft: TaskDraft,
  live: GraphTask,
  exists: (num: number) => boolean = () => true,
): TaskDraft {
  const added = draft.blockedBy.filter((n) => !base.blockedBy.includes(n))
  const removed = base.blockedBy.filter((n) => !draft.blockedBy.includes(n))
  const blockedBy = [...live.blockedBy.filter((n) => !added.includes(n)), ...added].filter(
    (n) => !removed.includes(n) && exists(n),
  )
  return {
    title: draft.title === base.title ? live.title : draft.title,
    details: draft.details === base.details ? live.details : draft.details,
    state: draft.state === base.state ? live.state : draft.state,
    blockedBy,
  }
}

export async function saveDraft(projectId: number, live: GraphTask, d: TaskDraft): Promise<void> {
  const { patch, add, remove } = diffDraft(live, d)
  const id = taskLabel(live.num)
  if (Object.keys(patch).length > 0) await api.updateTask(projectId, id, patch)
  for (const n of remove) await api.removeBlocker(projectId, id, taskLabel(n))
  for (const n of add) await api.addBlocker(projectId, id, taskLabel(n))
}
