import { useState, type FormEvent } from 'react'
import type { Graph } from '../core/graph.js'
import type { Project } from '../core/types.js'
import { api } from './api.js'
import { ErrorLine, errorText, Popup } from './Popup.js'

function useSubmit(onDone: () => void) {
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const submit = (fn: () => Promise<unknown>) => async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    setBusy(true)
    try {
      await fn()
      onDone()
    } catch (err) {
      setError(errorText(err))
      setBusy(false)
    }
  }
  return { error, busy, submit }
}

export function CreateTaskPopup({
  projectId,
  graph,
  defaultBranchId,
  onClose,
}: {
  projectId: number
  graph: Graph
  defaultBranchId?: number | null
  onClose: () => void
}) {
  const main = graph.branches.find((b) => b.name === 'main') ?? graph.branches[0]
  const initial = graph.branches.some((b) => b.id === defaultBranchId) ? defaultBranchId! : main?.id
  const [branchId, setBranchId] = useState<number | undefined>(initial)
  const [title, setTitle] = useState('')
  const [details, setDetails] = useState('')
  const { error, busy, submit } = useSubmit(onClose)

  return (
    <Popup title="New task" onClose={onClose}>
      <form
        onSubmit={submit(() =>
          api.createTask(projectId, { branchId: branchId!, title, ...(details ? { details } : {}) }),
        )}
      >
        <label>
          Branch
          <select value={branchId ?? ''} onChange={(e) => setBranchId(Number(e.target.value))}>
            {graph.branches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Title
          <input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} />
        </label>
        <label>
          Details
          <textarea value={details} onChange={(e) => setDetails(e.target.value)} rows={4} />
        </label>
        <ErrorLine message={error} />
        <div className="popup-actions">
          <button type="submit" disabled={busy || branchId === undefined}>
            Create task
          </button>
        </div>
      </form>
    </Popup>
  )
}

export function CreateBranchPopup({
  projectId,
  graph,
  fromTask,
  onClose,
}: {
  projectId: number
  graph: Graph
  fromTask?: number
  onClose: () => void
}) {
  const [name, setName] = useState('')
  const [purpose, setPurpose] = useState('')
  const [from, setFrom] = useState(fromTask === undefined ? '' : `T-${fromTask}`)
  const { error, busy, submit } = useSubmit(onClose)

  return (
    <Popup title="New branch" onClose={onClose}>
      <form
        onSubmit={submit(() =>
          api.createBranch(projectId, {
            name,
            ...(purpose ? { purpose } : {}),
            ...(from ? { fromTask: from } : {}),
          }),
        )}
      >
        <label>
          Name
          <input autoFocus value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <label>
          Purpose
          <textarea value={purpose} onChange={(e) => setPurpose(e.target.value)} rows={3} />
        </label>
        <label>
          From task
          <select value={from} onChange={(e) => setFrom(e.target.value)}>
            <option value="">Top level</option>
            {graph.tasks.map((t) => (
              <option key={t.num} value={`T-${t.num}`}>
                {`T-${t.num} ${t.title}`}
              </option>
            ))}
          </select>
        </label>
        <ErrorLine message={error} />
        <div className="popup-actions">
          <button type="submit" disabled={busy}>
            Create branch
          </button>
        </div>
      </form>
    </Popup>
  )
}

export function CreateProjectPopup({
  onCreated,
  onClose,
}: {
  onCreated: (project: Project) => void
  onClose: () => void
}) {
  const [name, setName] = useState('')
  const { error, busy, submit } = useSubmit(onClose)

  return (
    <Popup title="New project" onClose={onClose}>
      <form
        onSubmit={submit(async () => {
          onCreated(await api.createProject(name))
        })}
      >
        <label>
          Name
          <input autoFocus value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <ErrorLine message={error} />
        <div className="popup-actions">
          <button type="submit" disabled={busy}>
            Create project
          </button>
        </div>
      </form>
    </Popup>
  )
}
