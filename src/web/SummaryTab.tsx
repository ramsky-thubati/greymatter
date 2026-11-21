import { useCallback, useEffect, useRef, useState } from 'react'
import { api, type SummaryVersion } from './api.js'
import { errorText } from './Popup.js'

const NOTICE = 'Claude updated the summary. Reload to see it.'

export function SummaryTab({ projectId }: { projectId: number }) {
  const [version, setVersion] = useState<number | null>(null)
  const [saved, setSaved] = useState('')
  const [text, setText] = useState('')
  const [versions, setVersions] = useState<SummaryVersion[]>([])
  const [stale, setStale] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const latest = useRef(0)
  const dirty = useRef(false)

  const dirtyNow = text !== saved
  dirty.current = dirtyNow

  const refreshVersions = useCallback(() => {
    const ticket = latest.current
    api
      .listSummaryVersions(projectId)
      .then((v) => {
        if (ticket === latest.current) setVersions(v)
      })
      .catch(() => {})
  }, [projectId])

  const load = useCallback((explicit: boolean) => {
    const ticket = ++latest.current
    Promise.all([api.getSummary(projectId), api.listSummaryVersions(projectId)])
      .then(([live, all]) => {
        if (ticket !== latest.current) return
        setVersions(all)
        if (!explicit && dirty.current) {
          setStale(true)
          return
        }
        setVersion(live.version)
        setSaved(live.body)
        setText(live.body)
        setStale(false)
      })
      .catch((e) => {
        if (ticket === latest.current) setError(errorText(e))
      })
  }, [projectId])

  useEffect(() => {
    latest.current++
    setVersion(null)
    setSaved('')
    setText('')
    setVersions([])
    setStale(false)
    setError(null)
    load(true)
    const source = new EventSource(`/api/projects/${projectId}/events`)
    source.addEventListener('changed', () => {
      if (dirty.current) {
        setStale(true)
        refreshVersions()
      } else {
        load(false)
      }
    })
    return () => {
      latest.current++
      source.close()
    }
  }, [projectId, load, refreshVersions])

  const save = async () => {
    setBusy(true)
    setError(null)
    try {
      await api.updateSummary(projectId, text)
      setSaved(text)
      setStale(false)
    } catch (e) {
      setError(errorText(e))
    } finally {
      setBusy(false)
    }
  }

  const checkpoint = async () => {
    if (version === null || !window.confirm(`Freeze v${version} and start v${version + 1} as a copy?`)) return
    setError(null)
    try {
      await api.createCheckpoint(projectId)
      load(true)
    } catch (e) {
      setError(errorText(e))
    }
  }

  const copy = (body: string) => {
    navigator.clipboard.writeText(body).catch((e) => setError(errorText(e)))
  }

  const older = versions.filter((v) => v.frozenAt)

  return (
    <div className="summary">
      <div className="summary-head">
        <h2>{version === null ? 'Summary' : `Summary v${version}`}</h2>
        <div className="summary-actions">
          <button onClick={save} disabled={!dirtyNow || busy}>
            Save
          </button>
          <button onClick={() => copy(text)}>Copy</button>
          <button
            onClick={checkpoint}
            disabled={version === null || dirtyNow}
            title={dirtyNow ? 'Save or reload first' : undefined}
          >
            Checkpoint
          </button>
        </div>
      </div>
      {stale && (
        <p className="summary-notice">
          {NOTICE} <button onClick={() => load(true)}>Reload</button>
        </p>
      )}
      {error && (
        <p className="summary-error" role="alert">
          {error}
        </p>
      )}
      <textarea
        className="summary-text"
        aria-label="Summary"
        value={text}
        onChange={(e) => setText(e.target.value)}
        spellCheck={false}
      />
      {older.length > 0 && (
        <>
          <h3>Older versions</h3>
          <ul className="summary-versions">
            {older.map((v) => (
              <li key={v.version}>
                <div className="summary-head">
                  <strong>v{v.version}</strong>
                  <button onClick={() => copy(v.body)}>Copy</button>
                </div>
                <pre>{v.body}</pre>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  )
}
