import { useState } from 'react'
import { api } from '../api.js'
import { errorText } from '../errors.js'
import { Dialog } from '../ui/Dialog.js'
import { TextField } from '../ui/Field.js'
import { useToast } from '../ui/Toast.js'

export function NewTaskDialog({
  projectId,
  branchId,
  onClose,
}: {
  projectId: number
  branchId: number
  onClose(): void
}) {
  const [title, setTitle] = useState('')
  const [details, setDetails] = useState('')
  const [busy, setBusy] = useState(false)
  const toast = useToast()
  const blank = title.trim() === ''

  const create = async () => {
    setBusy(true)
    try {
      await api.createTask(projectId, {
        branchId,
        title: title.trim(),
        ...(details.trim() ? { details } : {}),
      })
      onClose()
    } catch (e) {
      toast.error(errorText(e))
      setBusy(false)
    }
  }

  return (
    <Dialog
      title="New task"
      dirty={!blank || details !== ''}
      onClose={onClose}
      footerEnd={
        <button type="button" className="btn suggested" disabled={blank || busy} onClick={() => void create()}>
          Add task
        </button>
      }
    >
      <div className="boxed">
        <TextField label="Title" value={title} onChange={setTitle} autoFocus />
        <TextField label="Details" value={details} onChange={setDetails} multiline placeholder="Optional" />
      </div>
    </Dialog>
  )
}
