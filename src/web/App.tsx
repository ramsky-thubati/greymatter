import { useCallback, useEffect, useRef, useState } from 'react'
import type { Project } from '../core/types.js'
import { api } from './api.js'
import { BranchDialog } from './dialogs/BranchDialog.js'
import { DeleteAlert } from './dialogs/DeleteAlert.js'
import { NewBranchDialog } from './dialogs/NewBranchDialog.js'
import { NewProjectDialog } from './dialogs/NewProjectDialog.js'
import { NewTaskDialog } from './dialogs/NewTaskDialog.js'
import { TaskDialog } from './dialogs/TaskDialog.js'
import type { DeleteTarget } from './impact.js'
import { errorText } from './errors.js'
import { GraphView } from './graph/GraphView.js'
import { HeaderBar } from './HeaderBar.js'
import { Home } from './Home.js'
import { ProjectMenu } from './ProjectMenu.js'
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
  const [openTask, setOpenTask] = useState<number | null>(null)
  const [addTo, setAddTo] = useState<number | null>(null)
  const [openBranch, setOpenBranch] = useState<number | null>(null)
  const [newBranch, setNewBranch] = useState<{ fromTask?: number } | null>(null)
  const [deletingProject, setDeletingProject] = useState(false)
  const closeTask = useCallback(() => setOpenTask(null), [])
  const closeBranch = useCallback(() => setOpenBranch(null), [])
  const summaryDirty = useRef(false)

  const canLeave = useCallback((from: Route, to: Route) => {
    if (!summaryDirty.current || !leavesSummary(from, to)) return true
    setPending(to)
    return false
  }, [])
  const [route, navigate] = useRoute(canLeave)
  const projectId = route.name === 'project' ? route.projectId : null
  const { graph } = useGraph(projectId)

  useEffect(() => {
    setOpenTask(null)
    setAddTo(null)
    setOpenBranch(null)
    setNewBranch(null)
    setDeleting(null)
    setDeletingProject(false)
  }, [projectId])

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
            end={
              graph && (
                <ProjectMenu
                  status={graph.project.status}
                  onStatus={(status) =>
                    api.setProjectStatus(route.projectId, status).catch((e) => toast.error(errorText(e)))
                  }
                  onDelete={() => setDeletingProject(true)}
                />
              )
            }
          />
          <main className="content">
            {route.tab === 'graph' && graph && (
              <GraphView
                projectId={route.projectId}
                graph={graph}
                onOpenTask={setOpenTask}
                onOpenBranch={setOpenBranch}
                onAddTask={setAddTo}
                onNewBranch={(fromTask) => setNewBranch(fromTask === undefined ? {} : { fromTask })}
                onDelete={setDeleting}
              />
            )}
            {graph && openTask !== null && (
              <TaskDialog
                key={openTask}
                projectId={route.projectId}
                graph={graph}
                num={openTask}
                onClose={closeTask}
                onDelete={setDeleting}
              />
            )}
            {addTo !== null && (
              <NewTaskDialog projectId={route.projectId} branchId={addTo} onClose={() => setAddTo(null)} />
            )}
            {graph && openBranch !== null && (
              <BranchDialog
                key={openBranch}
                projectId={route.projectId}
                graph={graph}
                branchId={openBranch}
                onClose={closeBranch}
                onDelete={setDeleting}
              />
            )}
            {newBranch && (
              <NewBranchDialog projectId={route.projectId} fromTask={newBranch.fromTask} onClose={() => setNewBranch(null)} />
            )}
            {graph && deleting && (
              <DeleteAlert
                projectId={route.projectId}
                graph={graph}
                target={deleting}
                onDone={() => setDeleting(null)}
                onCancel={() => setDeleting(null)}
              />
            )}
            {graph && deletingProject && (
              <ConfirmAlert
                title={`Delete "${graph.project.name}"?`}
                body="This removes all its branches, tasks and summaries. It can't be undone."
                confirmLabel="Delete"
                destructive
                onConfirm={() => {
                  setDeletingProject(false)
                  api
                    .deleteProject(route.projectId)
                    .then(() => navigate({ name: 'home' }))
                    .catch((e) => toast.error(errorText(e)))
                }}
                onCancel={() => setDeletingProject(false)}
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
