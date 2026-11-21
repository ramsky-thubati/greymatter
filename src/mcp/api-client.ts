import type { Graph } from '../core/graph.js'
import type { Branch, Project, Task, TaskState } from '../core/types.js'

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

export interface ApiClient {
  listProjects(): Promise<Project[]>
  createProject(name: string): Promise<Project>
  projectByName(name: string): Promise<Project>
  getGraph(pid: number): Promise<Graph>
  getTask(pid: number, task: string): Promise<Task>
  resumeTask(pid: number, task: string): Promise<{ task: Task; summary: string }>
  createBranch(pid: number, body: { name: string; purpose?: string; fromTask?: string }): Promise<Branch>
  updateBranch(
    pid: number,
    bid: number,
    body: { name?: string; purpose?: string; rootTask?: string | null },
  ): Promise<Branch>
  deleteBranch(pid: number, bid: number, confirm: boolean): Promise<void>
  createTask(
    pid: number,
    body: { branchId: number; title: string; details?: string; before?: string; after?: string },
  ): Promise<Task>
  updateTask(pid: number, task: string, body: { title?: string; details?: string; state?: TaskState }): Promise<Task>
  moveTask(pid: number, task: string, body: { before?: string; after?: string }): Promise<void>
  addBlocker(pid: number, task: string, blocker: string): Promise<void>
  removeBlocker(pid: number, task: string, blocker: string): Promise<void>
  deleteTask(pid: number, task: string, confirm: boolean): Promise<void>
  getSummary(pid: number): Promise<{ version: number; body: string }>
  updateSummary(pid: number, body: string): Promise<{ version: number; body: string }>
  listSummaryVersions(pid: number): Promise<{ version: number; body: string; frozenAt: string | null }[]>
  createCheckpoint(pid: number): Promise<{ seq: number; fromVersion: number; toVersion: number }>
}

export function createApiClient(baseUrl: string, fetchFn: typeof fetch = fetch): ApiClient {
  const root = baseUrl.replace(/\/+$/, '')

  async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
    const init: RequestInit = { method }
    if (body !== undefined) {
      init.headers = { 'content-type': 'application/json' }
      init.body = JSON.stringify(body)
    }
    let res: Response
    try {
      res = await fetchFn(`${root}${path}`, init)
    } catch {
      throw new ApiError(0, 'unreachable', `Greymatter isn't running at ${baseUrl}. Start it with \`docker compose up -d\`.`)
    }
    if (res.status === 204) return undefined as T
    const text = await res.text()
    let json: unknown
    try {
      json = text ? JSON.parse(text) : undefined
    } catch {
      json = undefined
    }
    if (!res.ok) {
      const err = (json as { error?: { code?: string; message?: string; details?: unknown } } | undefined)?.error
      throw new ApiError(res.status, err?.code ?? 'error', err?.message ?? `Request failed with status ${res.status}`, err?.details)
    }
    return json as T
  }

  const p = (pid: number) => `/api/projects/${pid}`
  const t = (pid: number, task: string) => `${p(pid)}/tasks/${encodeURIComponent(task)}`

  return {
    listProjects: () => call('GET', '/api/projects'),
    createProject: (name) => call('POST', '/api/projects', { name }),
    projectByName: (name) => call('GET', `/api/projects/by-name/${encodeURIComponent(name.trim())}`),
    getGraph: (pid) => call('GET', `${p(pid)}/graph`),
    getTask: (pid, task) => call('GET', t(pid, task)),
    resumeTask: (pid, task) => call('POST', `${t(pid, task)}/resume`),
    createBranch: (pid, body) => call('POST', `${p(pid)}/branches`, body),
    updateBranch: (pid, bid, body) => call('PATCH', `${p(pid)}/branches/${bid}`, body),
    deleteBranch: (pid, bid, confirm) => call('DELETE', `${p(pid)}/branches/${bid}${confirm ? '?confirm=1' : ''}`),
    createTask: (pid, body) => call('POST', `${p(pid)}/tasks`, body),
    updateTask: (pid, task, body) => call('PATCH', t(pid, task), body),
    moveTask: (pid, task, body) => call('POST', `${t(pid, task)}/move`, body),
    addBlocker: (pid, task, blocker) => call('POST', `${t(pid, task)}/blockers`, { blocker }),
    removeBlocker: (pid, task, blocker) => call('DELETE', `${t(pid, task)}/blockers/${encodeURIComponent(blocker)}`),
    deleteTask: (pid, task, confirm) => call('DELETE', `${t(pid, task)}${confirm ? '?confirm=1' : ''}`),
    getSummary: (pid) => call('GET', `${p(pid)}/summary`),
    updateSummary: (pid, body) => call('PUT', `${p(pid)}/summary`, { body }),
    listSummaryVersions: (pid) => call('GET', `${p(pid)}/summary/versions`),
    createCheckpoint: (pid) => call('POST', `${p(pid)}/checkpoints`),
  }
}
