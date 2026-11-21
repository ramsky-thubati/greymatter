import type { Graph } from '../core/graph.js'

export type DeleteTarget = { kind: 'task'; num: number } | { kind: 'branch'; branchId: number }

export function deleteImpact(graph: Graph, t: DeleteTarget): { dependents: number[]; forkedBranches: number[] } {
  const own =
    t.kind === 'task' ? [t.num] : (graph.branches.find((b) => b.id === t.branchId)?.taskNums ?? [])
  const ownSet = new Set(own)
  const dependents = graph.tasks
    .filter((x) => !ownSet.has(x.num) && x.blockedBy.some((n) => ownSet.has(n)))
    .map((x) => x.num)
    .sort((a, b) => a - b)
  const forkedBranches = graph.branches
    .filter((b) => (t.kind !== 'branch' || b.id !== t.branchId) && b.rootTaskNum !== null && ownSet.has(b.rootTaskNum))
    .map((b) => b.id)
    .sort((a, b) => a - b)
  return { dependents, forkedBranches }
}
