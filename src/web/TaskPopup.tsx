import { useEffect, useState } from 'react'
import type { Graph, GraphTask } from '../core/graph.js'
import type { TaskState } from '../core/types.js'
import { api } from './api.js'
import { deleteOutcome, ErrorLine, errorText, Popup } from './Popup.js'

const STATES: { value: TaskState; label: string }[] = [
  { value: 'todo', label: 'To do' },
  { value: 'in_progress', label: 'In progress' },
  { value: 'later', label: 'Later' },
  { value: 'done', label: 'Done' },
  { value: 'cancelled', label: 'Cancelled' },
]

const finished = (s: TaskState) => s === 'done' || s === 'cancelled'

export function TaskPopup({
  projectId,
  task,
  graph,
  onClose,
  onBranchFrom,
}: {
  projectId: number
  task: GraphTask
  graph: Graph
  onClose: () => void
  onBranchFrom?: (num: number) => void
}) {
  const live = graph.tasks.find((t) => t.num === task.num)
  const id = `T-${task.num}`
  const [title, setTitle] = useState(live?.title ?? task.title)
  const [details, setDetails] = useState(live?.details ?? task.details)
  const [error, setError] = useState<string | null>(null)
  const [confirmMessage, setConfirmMessage] = useState<string | null>(null)

  useEffect(() => {
    if (!live) onClose()
  }, [live, onClose])
  useEffect(() => {
    if (live) setTitle(live.title)
  }, [live?.title])
  useEffect(() => {
    if (live) setDetails(live.details)
  }, [live?.details])

  if (!live) return null

  const attempt = async (fn: () => Promise<unknown>, revert?: () => void) => {
    setError(null)
    try {
      await fn()
    } catch (e) {
      setError(errorText(e))
      revert?.()
    }
  }

  const saveTitle = () => {
    if (title === live.title) return
    void attempt(
      () => api.updateTask(projectId, id, { title }),
      () => setTitle(live.title),
    )
  }
  const saveDetails = () => {
    if (details === live.details) return
    void attempt(
      () => api.updateTask(projectId, id, { details }),
      () => setDetails(live.details),
    )
  }

  const remove = async (confirm: boolean) => {
    setError(null)
    try {
      await (confirm ? api.deleteTask(projectId, id, { confirm: true }) : api.deleteTask(projectId, id))
      onClose()
    } catch (e) {
      const outcome = deleteOutcome(e, (bid) => graph.branches.find((b) => b.id === bid)?.name ?? `#${bid}`)
      setConfirmMessage(outcome.kind === 'dependents' ? outcome.message : null)
      setError(outcome.kind === 'error' ? outcome.message : null)
    }
  }

  const blockers = live.blockedBy.map((n) => graph.tasks.find((t) => t.num === n)).filter((t) => !!t)
  const candidates = graph.tasks.filter((t) => t.num !== live.num && !live.blockedBy.includes(t.num))

  return (
    <Popup title={id} onClose={onClose}>
      <label>
        Title
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={saveTitle}
          onKeyDown={(e) => {
            if (e.key === 'Enter') saveTitle()
          }}
        />
      </label>
      <label>
        State
        <select
          value={live.state}
          onChange={(e) => void attempt(() => api.updateTask(projectId, id, { state: e.target.value as TaskState }))}
        >
          {STATES.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
      </label>
      {live.flagged && <p className="popup-note">A blocker was cancelled. Check this task still makes sense.</p>}
      <label>
        Details
        <textarea value={details} onChange={(e) => setDetails(e.target.value)} onBlur={saveDetails} rows={5} />
      </label>
      <div className="blockers">
        <h3>Blockers</h3>
        {blockers.length === 0 && <p className="muted">None</p>}
        <ul>
          {blockers.map((b) => (
            <li key={b.num}>
              <span>
                T-{b.num} {b.title}
                {finished(b.state) && <em> ({b.state === 'done' ? 'done' : 'cancelled'})</em>}
              </span>
              <button
                aria-label={`Remove blocker T-${b.num}`}
                onClick={() => void attempt(() => api.removeBlocker(projectId, id, `T-${b.num}`))}
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
        <label>
          Add blocker
          <select
            value=""
            onChange={(e) => {
              if (e.target.value) void attempt(() => api.addBlocker(projectId, id, e.target.value))
            }}
          >
            <option value="">Choose a task…</option>
            {candidates.map((t) => (
              <option key={t.num} value={`T-${t.num}`}>
                {`T-${t.num} ${t.title}`}
              </option>
            ))}
          </select>
        </label>
      </div>
      <ErrorLine message={error} />
      {confirmMessage && (
        <div className="popup-confirm">
          <p>{confirmMessage}</p>
          <button className="danger" onClick={() => void remove(true)}>
            Delete anyway
          </button>
          <button onClick={() => setConfirmMessage(null)}>Cancel</button>
        </div>
      )}
      <div className="popup-actions">
        {onBranchFrom && <button onClick={() => onBranchFrom(live.num)}>Branch from here</button>}
        <button className="danger" onClick={() => void remove(false)}>
          Delete
        </button>
      </div>
    </Popup>
  )
}
