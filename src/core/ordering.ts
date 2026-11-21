import { type Db, tx } from './db.js'
import { DomainError } from './errors.js'
import { formatTaskId } from './ids.js'
import { nextSeq, shiftSeqFrom } from './sequence.js'
import { getBranch, getTask, requireText } from './tasks.js'
import type { Task } from './types.js'

export type OrderEntry = { num: number } | { title: string }

interface Slot {
  num: number
  pinnedFloat: boolean
  anchor: boolean
}

function currentSeq(db: Db, projectId: number, num: number): number {
  return (
    db.prepare('SELECT seq FROM tasks WHERE project_id = ? AND num = ?').get(projectId, num) as { seq: number }
  ).seq
}

function validateOrder(db: Db, projectId: number, branchId: number, order: OrderEntry[]): void {
  const existing = new Set(
    (db.prepare('SELECT num FROM tasks WHERE branch_id = ?').all(branchId) as { num: number }[]).map((r) => r.num),
  )
  const seen = new Set<number>()
  for (const entry of order) {
    if ('title' in entry) {
      requireText(entry.title, 'Task title')
      continue
    }
    if (seen.has(entry.num)) throw new DomainError('invalid', `${formatTaskId(entry.num)} appears more than once`)
    if (!existing.has(entry.num)) {
      throw new DomainError('invalid', `${formatTaskId(entry.num)} is not on this branch`)
    }
    seen.add(entry.num)
  }
  const missing = [...existing].filter((n) => !seen.has(n))
  if (missing.length > 0) {
    throw new DomainError('invalid', `Order is missing ${missing.map(formatTaskId).join(', ')}`)
  }
}

function createInBranch(db: Db, projectId: number, branchId: number, title: string): number {
  const project = db.prepare('SELECT next_task_num AS n FROM projects WHERE id = ?').get(projectId) as { n: number }
  db.prepare(
    'INSERT INTO tasks (project_id, num, branch_id, title, branch_pos, seq) VALUES (?, ?, ?, ?, 0, 0)',
  ).run(projectId, project.n, branchId, requireText(title, 'Task title'))
  db.prepare('UPDATE projects SET next_task_num = ? WHERE id = ?').run(project.n + 1, projectId)
  return project.n
}

function renumberSeq(db: Db, projectId: number): void {
  const rows = db
    .prepare(
      `SELECT 't' AS kind, num AS ref, seq FROM tasks WHERE project_id = ?1
       UNION ALL SELECT 'c', rowid, seq FROM checkpoints WHERE project_id = ?1
       ORDER BY seq, kind, ref`,
    )
    .all(projectId) as { kind: 't' | 'c'; ref: number }[]
  const setTask = db.prepare('UPDATE tasks SET seq = ? WHERE project_id = ? AND num = ?')
  const setCheckpoint = db.prepare('UPDATE checkpoints SET seq = ? WHERE rowid = ?')
  rows.forEach((row, i) => {
    if (row.kind === 't') setTask.run(i + 1, projectId, row.ref)
    else setCheckpoint.run(i + 1, row.ref)
  })
}

export function relinkBranch(
  db: Db,
  projectId: number,
  branchId: number,
  order: OrderEntry[],
  floating: number[] = [],
): Task[] {
  return tx(db, () => {
    getBranch(db, projectId, branchId)
    validateOrder(db, projectId, branchId, order)

    const slots: Slot[] = order.map((entry) =>
      'title' in entry
        ? { num: createInBranch(db, projectId, branchId, entry.title), pinnedFloat: true, anchor: false }
        : { num: entry.num, pinnedFloat: floating.includes(entry.num), anchor: false },
    )
    const setPos = db.prepare('UPDATE tasks SET branch_pos = ? WHERE project_id = ? AND num = ?')
    slots.forEach((slot, i) => setPos.run(i + 1, projectId, slot.num))

    const candidates = slots.filter((slot) => !slot.pinnedFloat)
    const seqs = candidates.map((slot) => currentSeq(db, projectId, slot.num))
    const best = candidates.map(() => 1)
    const prev = candidates.map(() => -1)
    let tail = -1
    candidates.forEach((_, i) => {
      for (let j = 0; j < i; j++) {
        if (seqs[j] < seqs[i] && best[j] + 1 > best[i]) {
          best[i] = best[j] + 1
          prev[i] = j
        }
      }
      if (tail < 0 || best[i] > best[tail]) tail = i
    })
    for (let k = tail; k >= 0; k = prev[k]) candidates[k].anchor = true

    const setSeq = db.prepare('UPDATE tasks SET seq = ? WHERE project_id = ? AND num = ?')
    slots.forEach((slot, i) => {
      if (slot.anchor) return
      const later = slots.slice(i + 1).find((s) => s.anchor)
      if (later) {
        const s = currentSeq(db, projectId, later.num)
        shiftSeqFrom(db, projectId, s)
        setSeq.run(s, projectId, slot.num)
      } else if (i > 0) {
        const s = currentSeq(db, projectId, slots[i - 1].num)
        shiftSeqFrom(db, projectId, s + 1)
        setSeq.run(s + 1, projectId, slot.num)
      } else {
        setSeq.run(nextSeq(db, projectId), projectId, slot.num)
      }
    })

    renumberSeq(db, projectId)
    return slots.map((slot) => getTask(db, projectId, slot.num))
  })
}

export function moveTask(
  db: Db,
  projectId: number,
  num: number,
  to: { before?: number; after?: number },
): void {
  const hasBefore = to.before !== undefined
  const hasAfter = to.after !== undefined
  if (hasBefore === hasAfter) throw new DomainError('invalid', 'Give exactly one of before or after')
  const target = (to.before ?? to.after) as number
  if (target === num) throw new DomainError('invalid', 'A task cannot be moved relative to itself')
  tx(db, () => {
    const task = getTask(db, projectId, num)
    const anchor = getTask(db, projectId, target)
    if (anchor.branchId !== task.branchId) {
      throw new DomainError('invalid', `${formatTaskId(target)} is not on the same branch as ${formatTaskId(num)}`)
    }
    const nums = (
      db
        .prepare('SELECT num FROM tasks WHERE branch_id = ? AND num != ? ORDER BY branch_pos')
        .all(task.branchId, num) as { num: number }[]
    ).map((r) => r.num)
    const at = nums.indexOf(target) + (hasAfter ? 1 : 0)
    nums.splice(at, 0, num)
    relinkBranch(db, projectId, task.branchId, nums.map((n) => ({ num: n })), [num])
  })
}
