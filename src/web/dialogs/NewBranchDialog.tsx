import { useState } from 'react'
import { api } from '../api.js'
import { taskLabel } from '../blockers.js'
import { errorText } from '../errors.js'
import { Dialog } from '../ui/Dialog.js'
import { TextField } from '../ui/Field.js'
import { useToast } from '../ui/Toast.js'

export function NewBranchDialog({
  projectId,
  fromTask,
  onClose,
}: {
  projectId: number
  fromTask?: number
  onClose(): void
}) {
  const [name, setName] = useState('')
  const [purpose, setPurpose] = useState('')
  const [busy, setBusy] = useState(false)
  const toast = useToast()
  const blank = name.trim() === ''

  const create = async () => {
    setBusy(true)
    try {
      await api.createBranch(projectId, {
        name: name.trim(),
        ...(purpose.trim() ? { purpose } : {}),
        ...(fromTask === undefined ? {} : { fromTask: taskLabel(fromTask) }),
      })
      onClose()
    } catch (e) {
      toast.error(errorText(e))
      setBusy(false)
    }
  }

  return (
    <Dialog
      title="New branch"
      dirty={!blank || purpose !== ''}
      onClose={onClose}
      footerEnd={
        <button type="button" className="btn suggested" disabled={blank || busy} onClick={() => void create()}>
          Create branch
        </button>
      }
    >
      <div className="boxed">
        <TextField label="Name" value={name} onChange={setName} autoFocus />
        <TextField label="Purpose" value={purpose} onChange={setPurpose} placeholder="Optional" multiline />
      </div>
    </Dialog>
  )
}
