import type { Graph } from '../core/graph.js'

export function subtreeBranchIds(graph: Graph, branchId: number): Set<number> {
  const seen = new Set([branchId])
  let grew = true
  while (grew) {
    grew = false
    const nums = new Set(graph.branches.filter((b) => seen.has(b.id)).flatMap((b) => b.taskNums))
    for (const b of graph.branches) {
      if (!seen.has(b.id) && b.rootTaskNum !== null && nums.has(b.rootTaskNum)) {
        seen.add(b.id)
        grew = true
      }
    }
  }
  return seen
}
