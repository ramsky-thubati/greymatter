import { useCallback, useEffect, useRef, useState } from 'react'
import type { Project } from '../core/types.js'
import { api } from './api.js'
import { DeleteAlert } from './dialogs/DeleteAlert.js'
import { NewProjectDialog } from './dialogs/NewProjectDialog.js'
import type { DeleteTarget } from './impact.js'
import { errorText } from './errors.js'
import { GraphView } from './graph/GraphView.js'
import { HeaderBar } from './HeaderBar.js'
import { Home } from './Home.js'
import { type Route, useRoute } from './route.js'
import { SummaryTab } from './SummaryTab.js'
import { ConfirmAlert } from './ui/ConfirmAlert.js'
import { ChevronLeftIcon } from './ui/icons.js'
import { ToastProvider, useToast } from './ui/Toast.js'
import { useGraph } from './useGraph.js'


const leavesSummary = (from: Route, to: Route) =>
  from.name === 'project' &&
  from.tab === 'summary' &&
  !(to.name === 'project' && to.projectId === from.projectId && to.tab === 'summary')

export function App() {
  return (
    <ToastProvider>
      <Shell />
    </ToastProvider>
  )
}

function Shell() {
  const toast = useToast()
  const [projects, setProjects] = useState<Project[] | null>(null)
  const [newProject, setNewProject] = useState(false)
  const [pending, setPending] = useState<Route | null>(null)
  const [deleting, setDeleting] = useState<DeleteTarget | null>(null)
  const summaryDirty = useRef(false)

  const canLeave = useCallback((from: Route, to: Route) => {
    if (!summaryDirty.current || !leavesSummary(from, to)) return true
    setPending(to)
    return false
  }, [])
  const [route, navigate] = useRoute(canLeave)
  const projectId = route.name === 'project' ? route.projectId : null
  const { graph } = useGraph(projectId)

  const onDirtyChange = useCallback((dirty: boolean) => {
    summaryDirty.current = dirty
  }, [])

  useEffect(() => {
    if (route.name !== 'home') return
    api
      .listProjects()
      .then(setProjects)
      .catch((e) => toast.error(errorText(e)))
  }, [route.name, toast])

  useEffect(() => {
    const guard = (e: BeforeUnloadEvent) => {
      if (summaryDirty.current) e.preventDefault()
    }
    window.addEventListener('beforeunload', guard)
    return () => window.removeEventListener('beforeunload', guard)
  }, [])

  const open = (id: number, tab: 'graph' | 'summary' = 'graph') => navigate({ name: 'project', projectId: id, tab })

  return (
    <div className="app">
      {route.name === 'home' && (
        <Home projects={projects} onOpen={(id) => open(id)} onNew={() => setNewProject(true)} />
      )}
      {route.name === 'project' && (
        <>
          <HeaderBar
            start={
              <>
                <button type="button" className="btn flat" onClick={() => navigate({ name: 'home' })}>
                  <ChevronLeftIcon /> Home
                </button>
                <span className="hb-title">{graph?.project.name}</span>
              </>
            }
            center={
              <nav className="switcher">
                <button
                  type="button"
                  className="btn"
                  aria-pressed={route.tab === 'graph'}
                  onClick={() => open(route.projectId, 'graph')}
                >
                  Graph
                </button>
                <button
                  type="button"
                  className="btn"
                  aria-pressed={route.tab === 'summary'}
                  onClick={() => open(route.projectId, 'summary')}
                >
                  Summary
                </button>
              </nav>
            }
          />
          <main className="content">
            {route.tab === 'graph' && graph && (
              <GraphView
                projectId={route.projectId}
                graph={graph}
                onOpenTask={() => {}}
                onOpenBranch={() => {}}
                onAddTask={() => {}}
                onNewBranch={() => {}}
                onDelete={setDeleting}
              />
            )}
            {graph && deleting && route.name === 'project' && (
              <DeleteAlert
                projectId={route.projectId}
                graph={graph}
                target={deleting}
                onDone={() => setDeleting(null)}
                onCancel={() => setDeleting(null)}
              />
            )}
            {route.tab === 'summary' && (
              <SummaryTab key={route.projectId} projectId={route.projectId} onDirtyChange={onDirtyChange} />
            )}
          </main>
        </>
      )}
      {newProject && (
        <NewProjectDialog
          onCreated={(p) => {
            setNewProject(false)
            open(p.id)
          }}
          onClose={() => setNewProject(false)}
        />
      )}
      {pending && (
        <ConfirmAlert
          title="Discard changes?"
          body="Your summary edits haven't been saved."
          confirmLabel="Discard"
          cancelLabel="Keep editing"
          destructive
          onConfirm={() => {
            const to = pending
            setPending(null)
            summaryDirty.current = false
            navigate(to)
          }}
          onCancel={() => setPending(null)}
        />
      )}
    </div>
  )
}
