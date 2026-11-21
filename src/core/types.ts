export type TaskState = 'todo' | 'in_progress' | 'later' | 'done' | 'cancelled'

export interface Project {
  id: number
  name: string
}

export interface Branch {
  id: number
  projectId: number
  name: string
  purpose: string
  rootTaskNum: number | null
}

export interface Task {
  projectId: number
  num: number
  branchId: number
  title: string
  details: string
  state: TaskState
  branchPos: number
  seq: number
  flagged: boolean
}
