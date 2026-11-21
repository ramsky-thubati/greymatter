import type { Graph, GraphTask } from '../core/graph.js'

export function openBlockers(graph: Graph, task: GraphTask): number[] {
  return task.blockedBy.filter((n) => {
    const state = graph.tasks.find((t) => t.num === n)?.state
    return state !== undefined && state !== 'done' && state !== 'cancelled'
  })
}
