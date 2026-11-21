import { useState } from 'react'
import type { Graph } from '../../core/graph.js'
import { api } from '../api.js'
import { taskLabel } from '../blockers.js'
import { errorText } from '../errors.js'
import { type DeleteTarget, deleteImpact } from '../impact.js'
import { ConfirmAlert } from '../ui/ConfirmAlert.js'
import { useToast } from '../ui/Toast.js'

export function DeleteAlert({
  projectId,
  graph,
  target,
  onDone,
  onCancel,
}: {
  projectId: number
  graph: Graph
  target: DeleteTarget
  onDone(): void
  onCancel(): void
}) {
  const toast = useToast()
  const [busy, setBusy] = useState(false)
  const { dependents, forkedBranches } = deleteImpact(graph, target)
  const branchName = (id: number) => graph.branches.find((b) => b.id === id)?.name ?? `#${id}`

  if (forkedBranches.length > 0) {
    const from = target.kind === 'task' ? 'this task' : 'a task on this branch'
    return (
      <ConfirmAlert
        title="Can't delete yet"
        body={forkedBranches.map((id) => (
          <p key={id}>
            Branch {branchName(id)} forks from {from}. Move or delete it first.
          </p>
        ))}
        confirmLabel="OK"
        cancelLabel={null}
        onConfirm={onCancel}
        onCancel={onCancel}
      />
    )
  }

  let title: string
  if (target.kind === 'task') title = `Delete ${taskLabel(target.num)}?`
  else {
    const n = graph.branches.find((b) => b.id === target.branchId)?.taskNums.length ?? 0
    const name = branchName(target.branchId)
    title = n === 0 ? `Delete branch ${name}?` : `Delete branch ${name} and its ${n} ${n === 1 ? 'task' : 'tasks'}?`
  }

  const by = target.kind === 'task' ? 'this task' : 'a task on this branch'
  const ids = dependents.map(taskLabel).join(', ')
  const body =
    dependents.length === 0
      ? "This can't be undone."
      : `${ids} ${dependents.length === 1 ? 'is' : 'are'} blocked by ${by}. This can't be undone.`

  const run = async () => {
    if (busy) return
    setBusy(true)
    const opts = dependents.length > 0 ? ({ confirm: true } as const) : undefined
    try {
      if (target.kind === 'task') {
        if (opts) await api.deleteTask(projectId, taskLabel(target.num), opts)
        else await api.deleteTask(projectId, taskLabel(target.num))
      } else if (opts) await api.deleteBranch(projectId, target.branchId, opts)
      else await api.deleteBranch(projectId, target.branchId)
      onDone()
    } catch (e) {
      toast.error(errorText(e))
      onCancel()
    }
  }

  return (
    <ConfirmAlert title={title} body={body} confirmLabel="Delete" destructive onConfirm={() => void run()} onCancel={onCancel} />
  )
}
