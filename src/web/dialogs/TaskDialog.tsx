import * as Menu from '@radix-ui/react-dropdown-menu'
import { useEffect, useState } from 'react'
import type { Graph } from '../../core/graph.js'
import { FLAGGED_NOTE, findTask, taskLabel } from '../blockers.js'
import { errorText } from '../errors.js'
import type { DeleteTarget } from '../impact.js'
import { draftOf, isDirty, saveDraft, type TaskDraft } from '../taskDraft.js'
import { Dialog } from '../ui/Dialog.js'
import { TextField } from '../ui/Field.js'
import { ChevronDownIcon, CloseIcon, PlusIcon, WarnIcon } from '../ui/icons.js'
import { StateMenu } from '../ui/StateMenu.js'
import { STATE_LABEL, StatusDot } from '../ui/StatusDot.js'
import { useToast } from '../ui/Toast.js'

export function TaskDialog({
  projectId,
  graph,
  num,
  onClose,
  onDelete,
}: {
  projectId: number
  graph: Graph
  num: number
  onClose(): void
  onDelete(target: DeleteTarget): void
}) {
  const live = findTask(graph, num)
  const [draft, setDraft] = useState<TaskDraft | null>(() => (live ? draftOf(live) : null))
  const [busy, setBusy] = useState(false)
  const toast = useToast()

  useEffect(() => {
    if (!live) onClose()
  }, [live, onClose])

  if (!live || !draft) return null

  const dirty = isDirty(live, draft)
  const set = (patch: Partial<TaskDraft>) => setDraft({ ...draft, ...patch })
  const candidates = graph.tasks.filter((t) => t.num !== num && !draft.blockedBy.includes(t.num))

  const save = async () => {
    setBusy(true)
    try {
      await saveDraft(projectId, live, draft)
      onClose()
    } catch (e) {
      toast.error(errorText(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog
      dirty={dirty}
      onClose={onClose}
      headerStart={
        <StateMenu
          value={draft.state}
          onChange={(state) => set({ state })}
          trigger={
            <button type="button" className="btn flat" aria-label={STATE_LABEL[draft.state]}>
              <StatusDot state={draft.state} />
              {STATE_LABEL[draft.state]}
              <ChevronDownIcon />
            </button>
          }
        />
      }
      footerStart={
        <button type="button" className="btn destructive-text" onClick={() => onDelete({ kind: 'task', num })}>
          Delete
        </button>
      }
      footerEnd={
        <button type="button" className="btn suggested" disabled={!dirty || busy} onClick={() => void save()}>
          Save
        </button>
      }
    >
      {live.flagged && (
        <p className="hint warn-note">
          <WarnIcon /> {FLAGGED_NOTE}
        </p>
      )}
      <div className="boxed">
        <TextField label="Title" value={draft.title} onChange={(title) => set({ title })} />
        <TextField label="Details" value={draft.details} onChange={(details) => set({ details })} multiline />
      </div>
      <h3 className="group-title">Blocked by</h3>
      <ul className="boxed">
        {draft.blockedBy.map((n) => {
          const b = findTask(graph, n)
          if (!b) return null
          return (
            <li key={n} className="row">
              <StatusDot state={b.state} />
              <span className="dim-id">{taskLabel(n)}</span>
              <span className="grow">{b.title}</span>
              <button
                type="button"
                className="btn flat circular"
                aria-label={`Remove blocker ${b.title}`}
                title="Remove blocker"
                onClick={() => set({ blockedBy: draft.blockedBy.filter((x) => x !== n) })}
              >
                <CloseIcon />
              </button>
            </li>
          )
        })}
        <li className="row add">
          <Menu.Root modal={false}>
            <Menu.Trigger asChild>
              <button type="button" className="row-btn" aria-label="Add blocker" disabled={candidates.length === 0}>
                <PlusIcon /> Add blocker
              </button>
            </Menu.Trigger>
            <Menu.Portal>
              <Menu.Content className="menu" align="start" sideOffset={4}>
                {candidates.map((t) => (
                  <Menu.Item
                    key={t.num}
                    className="menu-item"
                    onSelect={() => set({ blockedBy: [...draft.blockedBy, t.num] })}
                  >
                    <StatusDot state={t.state} />
                    {taskLabel(t.num)} {t.title}
                  </Menu.Item>
                ))}
              </Menu.Content>
            </Menu.Portal>
          </Menu.Root>
        </li>
      </ul>
    </Dialog>
  )
}
