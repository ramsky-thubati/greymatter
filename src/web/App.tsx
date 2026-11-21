import { useEffect, useState } from 'react'
import type { GraphBranch } from '../core/graph.js'
import type { Project } from '../core/types.js'
import { api } from './api.js'
import { MetroMap } from './MetroMap.js'
import { useGraph } from './useGraph.js'

const STORAGE_KEY = 'greymatter.project'
const NEW_PROJECT = 'new'

function savedProject(): number | null {
  try {
    const n = Number(localStorage.getItem(STORAGE_KEY))
    return Number.isInteger(n) && n > 0 ? n : null
  } catch {
    return null
  }
}

function remember(id: number | null) {
  try {
    if (id !== null) localStorage.setItem(STORAGE_KEY, String(id))
  } catch {}
}

export interface MapActions {
  onTaskClick(num: number): void
  onBranchClick(branchId: number): void
  onAddBranch(): void
  onAddTask(): void
}

export function App() {
  const [projects, setProjects] = useState<Project[] | null>(null)
  const [projectId, setProjectId] = useState<number | null>(savedProject)
  const [tab, setTab] = useState<'graph' | 'summary'>('graph')
  const [error, setError] = useState<string | null>(null)
  const { graph, reload } = useGraph(projectId)

  const report = (e: unknown) => setError(e instanceof Error ? e.message : String(e))

  useEffect(() => {
    api
      .listProjects()
      .then((list) => {
        setProjects(list)
        setProjectId((cur) => (list.some((p) => p.id === cur) ? cur : (list[0]?.id ?? null)))
      })
      .catch(report)
  }, [])

  useEffect(() => remember(projectId), [projectId])

  const createProject = async () => {
    const name = window.prompt('Project name')?.trim()
    if (!name) return
    try {
      const p = await api.createProject(name)
      setProjects((list) => [...(list ?? []), p])
      setProjectId(p.id)
    } catch (e) {
      report(e)
    }
  }

  const addBranch = async () => {
    if (projectId === null) return
    const name = window.prompt('Branch name')?.trim()
    if (!name) return
    try {
      await api.createBranch(projectId, { name })
      reload()
    } catch (e) {
      report(e)
    }
  }

  const addTask = async () => {
    if (projectId === null || !graph) return
    const title = window.prompt('Task title')?.trim()
    if (!title) return
    let branch: GraphBranch | undefined = graph.branches[0]
    if (graph.branches.length > 1) {
      const wanted = window.prompt('Branch name', branch?.name)?.trim()
      branch = graph.branches.find((b) => b.name === wanted)
      if (!branch) return report(new Error(`No branch named "${wanted}"`))
    }
    if (!branch) return
    try {
      await api.createTask(projectId, { branchId: branch.id, title })
      reload()
    } catch (e) {
      report(e)
    }
  }

  const actions: MapActions = {
    onTaskClick: () => {},
    onBranchClick: () => {},
    onAddBranch: addBranch,
    onAddTask: addTask,
  }

  const onSelect = (value: string) => {
    if (value === NEW_PROJECT) void createProject()
    else setProjectId(Number(value))
  }

  return (
    <div className="app">
      <header className="topbar">
        <select aria-label="Project" value={projectId ?? ''} onChange={(e) => onSelect(e.target.value)}>
          {projectId === null && <option value="">No project</option>}
          {(projects ?? []).map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
          <option value={NEW_PROJECT}>New project…</option>
        </select>
        <nav className="tabs">
          <button className={tab === 'graph' ? 'active' : ''} onClick={() => setTab('graph')}>
            Graph
          </button>
          <button className={tab === 'summary' ? 'active' : ''} onClick={() => setTab('summary')}>
            Summary
          </button>
        </nav>
        <span className="spacer" />
        <button onClick={actions.onAddBranch} disabled={projectId === null}>
          + Branch
        </button>
        <button onClick={actions.onAddTask} disabled={!graph}>
          + Task
        </button>
      </header>
      {error && (
        <div className="error" role="alert" onClick={() => setError(null)}>
          {error}
        </div>
      )}
      <main>
        {projects !== null && projects.length === 0 && (
          <div className="empty">
            <p>No projects yet.</p>
            <button onClick={createProject}>Create your first project</button>
          </div>
        )}
        {tab === 'graph' && graph && (
          <>
            <MetroMap graph={graph} onTaskClick={actions.onTaskClick} onBranchClick={actions.onBranchClick} />
            {graph.tasks.length === 0 && <div className="empty">No tasks yet. Add one with + Task.</div>}
          </>
        )}
        {tab === 'summary' && graph && <div className="empty">Summary coming soon.</div>}
      </main>
    </div>
  )
}
