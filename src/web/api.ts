import type { Graph } from '../core/graph.js'
import type { Branch, Project, ProjectStatus, Task, TaskState } from '../core/types.js'

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message)
  }
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`/api${path}`, {
    method,
    ...(body === undefined ? {} : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
  })
  if (!res.ok) {
    let err: { code?: string; message?: string; details?: unknown } = {}
    try {
      err = (await res.json()).error ?? {}
    } catch {}
    throw new ApiError(res.status, err.code ?? 'error', err.message ?? res.statusText, err.details)
  }
  if (res.status === 204) return undefined as T
  return (await res.json()) as T
}

const p = (projectId: number) => `/projects/${projectId}`
const t = (projectId: number, task: string) => `${p(projectId)}/tasks/${encodeURIComponent(task)}`
const confirmQuery = (o?: { confirm?: boolean }) => (o?.confirm ? '?confirm=1' : '')

export interface SummaryVersion {
  version: number
  body: string
  frozenAt?: string | null
  [key: string]: unknown
}

export const api = {
  listProjects: () => request<Project[]>('GET', '/projects'),
  createProject: (name: string) => request<Project>('POST', '/projects', { name }),
  setProjectStatus: (projectId: number, status: ProjectStatus) =>
    request<Project>('PATCH', p(projectId), { status }),
  deleteProject: (projectId: number) => request<void>('DELETE', p(projectId)),
  getGraph: (projectId: number) => request<Graph>('GET', `${p(projectId)}/graph`),

  createBranch: (projectId: number, body: { name: string; purpose?: string; fromTask?: string }) =>
    request<Branch>('POST', `${p(projectId)}/branches`, body),
  updateBranch: (
    projectId: number,
    branchId: number,
    body: { name?: string; purpose?: string; color?: string; rootTask?: string | null },
  ) => request<Branch>('PATCH', `${p(projectId)}/branches/${branchId}`, body),
  deleteBranch: (projectId: number, branchId: number, opts?: { confirm?: boolean }) =>
    request<void>('DELETE', `${p(projectId)}/branches/${branchId}${confirmQuery(opts)}`),
  setBranchOrder: (projectId: number, branchId: number, order: ({ task: number | string } | { title: string })[]) =>
    request<Task[]>('PUT', `${p(projectId)}/branches/${branchId}/order`, { order }),

  createTask: (
    projectId: number,
    body: { branchId: number; title: string; details?: string; before?: string; after?: string },
  ) => request<Task>('POST', `${p(projectId)}/tasks`, body),
  getTask: (projectId: number, task: string) => request<Task>('GET', t(projectId, task)),
  updateTask: (projectId: number, task: string, body: { title?: string; details?: string; state?: TaskState }) =>
    request<Task>('PATCH', t(projectId, task), body),
  moveTask: (projectId: number, task: string, body: { before?: string; after?: string }) =>
    request<void>('POST', `${t(projectId, task)}/move`, body),
  deleteTask: (projectId: number, task: string, opts?: { confirm?: boolean }) =>
    request<void>('DELETE', `${t(projectId, task)}${confirmQuery(opts)}`),
  addBlocker: (projectId: number, task: string, blocker: string) =>
    request<void>('POST', `${t(projectId, task)}/blockers`, { blocker }),
  removeBlocker: (projectId: number, task: string, blocker: string) =>
    request<void>('DELETE', `${t(projectId, task)}/blockers/${encodeURIComponent(blocker)}`),

  getSummary: (projectId: number) => request<{ version: number; body: string }>('GET', `${p(projectId)}/summary`),
  updateSummary: (projectId: number, body: string) =>
    request<{ version: number; body: string }>('PUT', `${p(projectId)}/summary`, { body }),
  listSummaryVersions: (projectId: number) => request<SummaryVersion[]>('GET', `${p(projectId)}/summary/versions`),
  createCheckpoint: (projectId: number) => request<unknown>('POST', `${p(projectId)}/checkpoints`),
}
