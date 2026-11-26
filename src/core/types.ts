export type TaskState = 'todo' | 'in_progress' | 'later' | 'done' | 'cancelled'

export type ProjectStatus = 'in_progress' | 'complete'

export interface Project {
  id: number
  name: string
  status: ProjectStatus
  createdAt: string
  updatedAt: string
}

export interface Branch {
  id: number
  projectId: number
  name: string
  purpose: string
  rootTaskNum: number | null
  color: string
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
