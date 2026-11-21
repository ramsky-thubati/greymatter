import { useEffect, useState } from 'react'
import type { Graph, GraphBranch } from '../core/graph.js'
import { api } from './api.js'
import { deleteOutcome, ErrorLine, errorText, Popup } from './Popup.js'

function subtreeBranchIds(graph: Graph, branchId: number): Set<number> {
  const seen = new Set([branchId])
  let grew = true
  while (grew) {
    grew = false
    const nums = new Set(graph.branches.filter((b) => seen.has(b.id)).flatMap((b) => b.taskNums))
    for (const b of graph.branches) {
      if (!seen.has(b.id) && b.rootTaskNum !== null && nums.has(b.rootTaskNum)) {
        seen.add(b.id)
        grew = true
      }
    }
  }
  return seen
}

export function BranchPopup({
  projectId,
  branch,
  graph,
  onClose,
  onEditLinks,
}: {
  projectId: number
  branch: GraphBranch
  graph: Graph
  onClose: () => void
  onEditLinks: (branchId: number) => void
}) {
  const live = graph.branches.find((b) => b.id === branch.id)
  const [name, setName] = useState(live?.name ?? branch.name)
  const [purpose, setPurpose] = useState(live?.purpose ?? branch.purpose)
  const [error, setError] = useState<string | null>(null)
  const [confirmMessage, setConfirmMessage] = useState<string | null>(null)

  useEffect(() => {
    if (!live) onClose()
  }, [live, onClose])
  useEffect(() => {
    if (live) setName(live.name)
  }, [live?.name])
  useEffect(() => {
    if (live) setPurpose(live.purpose)
  }, [live?.purpose])

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

  const saveName = () => {
    if (name === live.name) return
    void attempt(
      () => api.updateBranch(projectId, live.id, { name }),
      () => setName(live.name),
    )
  }
  const savePurpose = () => {
    if (purpose === live.purpose) return
    void attempt(
      () => api.updateBranch(projectId, live.id, { purpose }),
      () => setPurpose(live.purpose),
    )
  }

  const remove = async (confirm: boolean) => {
    setError(null)
    try {
      await (confirm ? api.deleteBranch(projectId, live.id, { confirm: true }) : api.deleteBranch(projectId, live.id))
      onClose()
    } catch (e) {
      const outcome = deleteOutcome(e, (bid) => graph.branches.find((b) => b.id === bid)?.name ?? `#${bid}`)
      setConfirmMessage(outcome.kind === 'dependents' ? outcome.message : null)
      setError(outcome.kind === 'error' ? outcome.message : null)
    }
  }

  const excluded = new Set(
    [...subtreeBranchIds(graph, live.id)].flatMap((id) => graph.branches.find((b) => b.id === id)?.taskNums ?? []),
  )
  const targets = graph.tasks.filter((t) => !excluded.has(t.num))

  return (
    <Popup title={`Branch ${live.name}`} onClose={onClose}>
      <label>
        Name
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={saveName}
          onKeyDown={(e) => {
            if (e.key === 'Enter') saveName()
          }}
        />
      </label>
      <label>
        Purpose
        <textarea value={purpose} onChange={(e) => setPurpose(e.target.value)} onBlur={savePurpose} rows={3} />
      </label>
      <label>
        Root
        <select
          value={live.rootTaskNum === null ? '' : `T-${live.rootTaskNum}`}
          onChange={(e) =>
            void attempt(() =>
              api.updateBranch(projectId, live.id, { rootTask: e.target.value === '' ? null : e.target.value }),
            )
          }
        >
          <option value="">No root (top level)</option>
          {targets.map((t) => (
            <option key={t.num} value={`T-${t.num}`}>
              {`T-${t.num} ${t.title}`}
            </option>
          ))}
        </select>
      </label>
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
        <button onClick={() => onEditLinks(live.id)}>Edit links</button>
        <button className="danger" onClick={() => void remove(false)}>
          Delete
        </button>
      </div>
    </Popup>
  )
}
