import { useCallback, useEffect, useState } from 'react'
import type { Graph } from '../core/graph.js'
import type { Project } from '../core/types.js'
import { api } from './api.js'
import { BranchPopup } from './BranchPopup.js'
import { CreateBranchPopup, CreateProjectPopup, CreateTaskPopup } from './CreatePopups.js'
import { LinkEditor } from './LinkEditor.js'
import { MetroMap } from './MetroMap.js'
import { SummaryTab } from './SummaryTab.js'
import { TaskPopup } from './TaskPopup.js'
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

const graphTask = (graph: Graph, num: number) => graph.tasks.find((t) => t.num === num)

export interface MapActions {
  onTaskClick(num: number): void
  onBranchClick(branchId: number): void
  onAddBranch(): void
  onAddTask(): void
}

type PopupState =
  | { kind: 'task'; num: number }
  | { kind: 'branch'; id: number }
  | { kind: 'createTask' }
  | { kind: 'createBranch'; fromTask?: number }
  | { kind: 'createProject' }

export function App() {
  const [projects, setProjects] = useState<Project[] | null>(null)
  const [projectId, setProjectId] = useState<number | null>(savedProject)
  const [tab, setTab] = useState<'graph' | 'summary'>('graph')
  const [error, setError] = useState<string | null>(null)
  const [popup, setPopup] = useState<PopupState | null>(null)
  const [summaryDirty, setSummaryDirty] = useState(false)
  const [lastBranchId, setLastBranchId] = useState<number | null>(null)
  const [editingBranchId, setEditingBranchId] = useState<number | null>(null)
  const { graph } = useGraph(projectId)

  const editingBranch = graph?.branches.find((b) => b.id === editingBranchId)

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

  useEffect(() => {
    if (!summaryDirty) return
    const guard = (e: BeforeUnloadEvent) => e.preventDefault()
    window.addEventListener('beforeunload', guard)
    return () => window.removeEventListener('beforeunload', guard)
  }, [summaryDirty])

  const switchProject = (id: number) => {
    if (id === projectId) return
    if (summaryDirty && !window.confirm('Discard unsaved summary edits?')) return
    setProjectId(id)
  }

  const closePopup = useCallback(() => setPopup(null), [])

  const actions: MapActions = {
    onTaskClick: (num) => {
      const task = graph?.tasks.find((t) => t.num === num)
      if (task) setLastBranchId(task.branchId)
      setPopup({ kind: 'task', num })
    },
    onBranchClick: (id) => setPopup({ kind: 'branch', id }),
    onAddBranch: () => setPopup({ kind: 'createBranch' }),
    onAddTask: () => setPopup({ kind: 'createTask' }),
  }

  const startEditingLinks = (branchId: number) => {
    setEditingBranchId(branchId)
    setPopup(null)
  }

  const onSelect = (value: string) => {
    if (value === NEW_PROJECT) setPopup({ kind: 'createProject' })
    else switchProject(Number(value))
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
        <button onClick={actions.onAddBranch} disabled={!graph}>
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
            <button onClick={() => setPopup({ kind: 'createProject' })}>Create your first project</button>
          </div>
        )}
        {tab === 'graph' && graph && (
          <>
            <MetroMap graph={graph} onTaskClick={actions.onTaskClick} onBranchClick={actions.onBranchClick} />
            {graph.tasks.length === 0 && <div className="empty">No tasks yet. Add one with + Task.</div>}
          </>
        )}
        {projectId !== null && graph && (
          <div hidden={tab !== 'summary'}>
            <SummaryTab key={projectId} projectId={projectId} onDirtyChange={setSummaryDirty} />
          </div>
        )}
      </main>
      {projectId !== null && graph && popup?.kind === 'task' && graphTask(graph, popup.num) && (
        <TaskPopup
          projectId={projectId}
          task={graphTask(graph, popup.num)!}
          graph={graph}
          onClose={closePopup}
          onBranchFrom={(num) => setPopup({ kind: 'createBranch', fromTask: num })}
        />
      )}
      {projectId !== null && graph && popup?.kind === 'branch' && graph.branches.find((b) => b.id === popup.id) && (
        <BranchPopup
          projectId={projectId}
          branch={graph.branches.find((b) => b.id === popup.id)!}
          graph={graph}
          onClose={closePopup}
          onEditLinks={startEditingLinks}
        />
      )}
      {projectId !== null && graph && popup?.kind === 'createTask' && (
        <CreateTaskPopup projectId={projectId} graph={graph} defaultBranchId={lastBranchId} onClose={closePopup} />
      )}
      {projectId !== null && graph && popup?.kind === 'createBranch' && (
        <CreateBranchPopup projectId={projectId} graph={graph} fromTask={popup.fromTask} onClose={closePopup} />
      )}
      {projectId !== null && graph && editingBranch && (
        <LinkEditor
          key={editingBranch.id}
          projectId={projectId}
          branch={editingBranch}
          graph={graph}
          onClose={() => setEditingBranchId(null)}
        />
      )}
      {popup?.kind === 'createProject' && (
        <CreateProjectPopup
          onCreated={(p) => {
            setProjects((list) => [...(list ?? []), p])
            switchProject(p.id)
          }}
          onClose={closePopup}
        />
      )}
    </div>
  )
}
