import * as Menu from '@radix-ui/react-dropdown-menu'
import { useEffect, useState } from 'react'
import type { Graph, GraphBranch } from '../../core/graph.js'
import { api } from '../api.js'
import { findTask, taskLabel } from '../blockers.js'
import { subtreeBranchIds } from '../branchTree.js'
import { errorText } from '../errors.js'
import type { DeleteTarget } from '../impact.js'
import { Dialog } from '../ui/Dialog.js'
import { TextField } from '../ui/Field.js'
import { CheckIcon, ChevronDownIcon } from '../ui/icons.js'
import { useToast } from '../ui/Toast.js'
import { ColorPicker } from './ColorPicker.js'

interface BranchDraft {
  name: string
  purpose: string
  color: string
  root: number | null
}

type BranchPatch = { name?: string; purpose?: string; color?: string; rootTask?: string | null }

const draftOf = (b: GraphBranch): BranchDraft => ({
  name: b.name,
  purpose: b.purpose,
  color: b.color,
  root: b.rootTaskNum,
})

function diff(b: GraphBranch, d: BranchDraft): BranchPatch {
  const patch: BranchPatch = {}
  if (d.name !== b.name) patch.name = d.name
  if (d.purpose !== b.purpose) patch.purpose = d.purpose
  if (d.color !== b.color) patch.color = d.color
  if (d.root !== b.rootTaskNum) patch.rootTask = d.root === null ? null : taskLabel(d.root)
  return patch
}

const NONE = 'none'

export function BranchDialog({
  projectId,
  graph,
  branchId,
  onClose,
  onDelete,
}: {
  projectId: number
  graph: Graph
  branchId: number
  onClose(): void
  onDelete(target: DeleteTarget): void
}) {
  const live = graph.branches.find((b) => b.id === branchId)
  const [draft, setDraft] = useState<BranchDraft | null>(() => (live ? draftOf(live) : null))
  const [busy, setBusy] = useState(false)
  const toast = useToast()

  useEffect(() => {
    if (!live) onClose()
  }, [live, onClose])

  if (!live || !draft) return null

  const patch = diff(live, draft)
  const dirty = Object.keys(patch).length > 0
  const set = (p: Partial<BranchDraft>) => setDraft({ ...draft, ...p })
  const inside = subtreeBranchIds(graph, branchId)
  const forkable = graph.tasks.filter((t) => !inside.has(t.branchId))
  const rootTask = draft.root === null ? undefined : findTask(graph, draft.root)

  const save = async () => {
    setBusy(true)
    try {
      await api.updateBranch(projectId, branchId, patch)
      onClose()
    } catch (e) {
      toast.error(errorText(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog
      title="Branch"
      dirty={dirty}
      onClose={onClose}
      footerStart={
        <button type="button" className="btn destructive-text" onClick={() => onDelete({ kind: 'branch', branchId })}>
          Delete
        </button>
      }
      footerEnd={
        <button
          type="button"
          className="btn suggested"
          disabled={!dirty || busy || draft.name.trim() === ''}
          onClick={() => void save()}
        >
          Save
        </button>
      }
    >
      <div className="boxed">
        <TextField label="Name" value={draft.name} onChange={(name) => set({ name })} />
        <TextField
          label="Purpose"
          value={draft.purpose}
          onChange={(purpose) => set({ purpose })}
          placeholder="Optional"
          multiline
        />
        <div className="row">
          <span className="field">
            <span className="field-label">Colour</span>
            <span className="hint mono">{draft.color}</span>
          </span>
          <ColorPicker value={draft.color} onChange={(color) => set({ color })} />
        </div>
        <Menu.Root modal={false}>
          <Menu.Trigger asChild>
            <button type="button" className="row row-btn">
              <span className="field">
                <span className="field-label">Branches from</span>
                <span>{rootTask ? `${taskLabel(rootTask.num)} ${rootTask.title}` : 'Nothing (top level)'}</span>
              </span>
              <ChevronDownIcon />
            </button>
          </Menu.Trigger>
          <Menu.Portal>
            <Menu.Content className="menu scroll" align="end" sideOffset={4}>
              <Menu.RadioGroup
                value={draft.root === null ? NONE : String(draft.root)}
                onValueChange={(v) => set({ root: v === NONE ? null : Number(v) })}
              >
                <Menu.RadioItem value={NONE} className="menu-item">
                  Nothing (top level)
                  <Menu.ItemIndicator className="end">
                    <CheckIcon />
                  </Menu.ItemIndicator>
                </Menu.RadioItem>
                {forkable.map((t) => (
                  <Menu.RadioItem key={t.num} value={String(t.num)} className="menu-item">
                    <span className="dim-id">{taskLabel(t.num)}</span>
                    {t.title}
                    <Menu.ItemIndicator className="end">
                      <CheckIcon />
                    </Menu.ItemIndicator>
                  </Menu.RadioItem>
                ))}
              </Menu.RadioGroup>
            </Menu.Content>
          </Menu.Portal>
        </Menu.Root>
      </div>
      <div className="branch-preview" aria-hidden="true">
        <span className="preview-line" style={{ backgroundColor: draft.color }} />
        <span className="preview-pill" style={{ backgroundColor: draft.color }}>
          {draft.name || live.name}
        </span>
        <span className="preview-line" style={{ backgroundColor: draft.color }} />
      </div>
    </Dialog>
  )
}
