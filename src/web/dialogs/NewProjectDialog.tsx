import { useState } from 'react'
import type { Project } from '../../core/types.js'
import { api } from '../api.js'
import { Dialog } from '../ui/Dialog.js'
import { TextField } from '../ui/Field.js'
import { useToast } from '../ui/Toast.js'

export function NewProjectDialog({ onCreated, onClose }: { onCreated(p: Project): void; onClose(): void }) {
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const toast = useToast()
  const blank = name.trim() === ''

  const create = async () => {
    setBusy(true)
    try {
      onCreated(await api.createProject(name.trim()))
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e))
      setBusy(false)
    }
  }

  return (
    <Dialog
      title="New project"
      dirty={!blank}
      onClose={onClose}
      footerEnd={
        <button type="button" className="btn suggested" disabled={blank || busy} onClick={() => void create()}>
          Create project
        </button>
      }
    >
      <div className="boxed">
        <TextField label="Name" value={name} onChange={setName} autoFocus />
      </div>
    </Dialog>
  )
}
