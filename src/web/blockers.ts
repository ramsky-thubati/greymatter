import type { Graph, GraphTask } from '../core/graph.js'
import type { TaskState } from '../core/types.js'

export const isFinished = (s: TaskState): boolean => s === 'done' || s === 'cancelled'

export const taskLabel = (num: number): string => `T-${num}`

export const findTask = (graph: Graph, num: number): GraphTask | undefined => graph.tasks.find((t) => t.num === num)

export function openBlockers(graph: Graph, task: GraphTask): number[] {
  return task.blockedBy.filter((n) => {
    const state = findTask(graph, n)?.state
    return state !== undefined && !isFinished(state)
  })
}

export const blocks = (graph: Graph, num: number): GraphTask[] => graph.tasks.filter((t) => t.blockedBy.includes(num))

export const showsPadlock = (graph: Graph, task: GraphTask): boolean => openBlockers(graph, task).length > 0

export const showsFlag = (graph: Graph, task: GraphTask): boolean =>
  !isFinished(task.state) && blocks(graph, task.num).some((t) => !isFinished(t.state))

export const hasFork = (graph: Graph, num: number): boolean => graph.branches.some((b) => b.rootTaskNum === num)

export const FLAGGED_NOTE = 'A blocker was cancelled. Check this task still makes sense.'
