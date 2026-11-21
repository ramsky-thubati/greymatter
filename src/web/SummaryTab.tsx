import { useCallback, useEffect, useRef, useState } from 'react'
import { api, type SummaryVersion } from './api.js'
import { errorText } from './errors.js'
import { ConfirmAlert } from './ui/ConfirmAlert.js'
import { ChevronDownIcon, ChevronRightIcon } from './ui/icons.js'
import { useToast } from './ui/Toast.js'

export function SummaryTab({ projectId, onDirtyChange }: { projectId: number; onDirtyChange?: (dirty: boolean) => void }) {
  const [version, setVersion] = useState<number | null>(null)
  const [saved, setSaved] = useState('')
  const [text, setText] = useState('')
  const [versions, setVersions] = useState<SummaryVersion[]>([])
  const [busy, setBusy] = useState(false)
  const [asking, setAsking] = useState(false)
  const [open, setOpen] = useState<Set<number>>(new Set())
  const toast = useToast()
  const latest = useRef(0)
  const dirty = useRef(false)

  const dirtyNow = text !== saved
  dirty.current = dirtyNow

  useEffect(() => {
    onDirtyChange?.(dirtyNow)
  }, [dirtyNow, onDirtyChange])
  useEffect(() => () => onDirtyChange?.(false), [onDirtyChange])

  const load = useCallback(
    (explicit: boolean) => {
      const ticket = ++latest.current
      Promise.all([api.getSummary(projectId), api.listSummaryVersions(projectId)])
        .then(([live, all]) => {
          if (ticket !== latest.current) return
          setVersions(all)
          if (!explicit && dirty.current) return
          setVersion(live.version)
          setSaved(live.body)
          setText(live.body)
        })
        .catch((e) => {
          if (ticket === latest.current) toast.error(errorText(e), explicit ? () => load(true) : undefined)
        })
    },
    [projectId, toast],
  )

  useEffect(() => {
    latest.current++
    setVersion(null)
    setSaved('')
    setText('')
    setVersions([])
    setOpen(new Set())
    load(true)
    const source = new EventSource(`/api/projects/${projectId}/events`)
    source.addEventListener('changed', () => load(false))
    let opened = false
    source.addEventListener('open', () => {
      if (opened) load(false)
      opened = true
    })
    return () => {
      latest.current++
      source.close()
    }
  }, [projectId, load])

  const save = async () => {
    setBusy(true)
    try {
      await api.updateSummary(projectId, text)
      setSaved(text)
    } catch (e) {
      toast.error(errorText(e))
    } finally {
      setBusy(false)
    }
  }

  const checkpoint = async () => {
    setAsking(false)
    try {
      await api.createCheckpoint(projectId)
      load(true)
    } catch (e) {
      toast.error(errorText(e))
    }
  }

  const copy = (body: string) => {
    navigator.clipboard.writeText(body).catch((e) => toast.error(errorText(e)))
  }

  const toggle = (v: number) =>
    setOpen((cur) => {
      const next = new Set(cur)
      if (!next.delete(v)) next.add(v)
      return next
    })

  const older = versions.filter((v) => v.frozenAt)

  return (
    <div className="summary">
      <div className="summary-head">
        <h2>{version === null ? 'Summary' : `Summary v${version}`}</h2>
        <div className="summary-actions">
          <button type="button" className="btn flat" onClick={() => copy(text)} disabled={version === null}>
            Copy
          </button>
          <button
            type="button"
            className="btn flat"
            onClick={() => setAsking(true)}
            disabled={version === null || dirtyNow}
            title={dirtyNow ? 'Save first' : undefined}
          >
            Checkpoint
          </button>
        </div>
      </div>
      <textarea
        className="summary-text"
        aria-label="Summary"
        value={text}
        readOnly={version === null}
        onChange={(e) => setText(e.target.value)}
        spellCheck={false}
      />
      <div className="summary-foot">
        <button
          type="button"
          className="btn suggested"
          onClick={() => void save()}
          disabled={version === null || !dirtyNow || busy}
        >
          Save
        </button>
      </div>
      {older.length > 0 && (
        <section>
          <h3 className="group-title">Older versions</h3>
          <ul className="boxed">
            {older.map((v) => {
              const expanded = open.has(v.version)
              return (
                <li key={v.version} className="version">
                  <div className="row">
                    <button
                      type="button"
                      className="row-btn version-toggle"
                      aria-expanded={expanded}
                      onClick={() => toggle(v.version)}
                    >
                      {expanded ? <ChevronDownIcon /> : <ChevronRightIcon />}
                      <span>v{v.version}</span>
                    </button>
                    <button type="button" className="btn flat" onClick={() => copy(v.body)}>
                      Copy
                    </button>
                  </div>
                  {expanded && <pre className="version-body">{v.body}</pre>}
                </li>
              )
            })}
          </ul>
        </section>
      )}
      {asking && version !== null && (
        <ConfirmAlert
          title={`Freeze v${version} and start v${version + 1} as a copy?`}
          confirmLabel="Checkpoint"
          onConfirm={() => void checkpoint()}
          onCancel={() => setAsking(false)}
        />
      )}
    </div>
  )
}
