import { useReducer, useState } from 'react'
import type { Graph, GraphBranch } from '../core/graph.js'
import { api } from './api.js'
import { canSave, chipLabel, editorReducer, initEditor, isTemp, toOrder } from './editorState.js'
import { ErrorLine, errorText, Popup } from './Popup.js'

export function LinkEditor({
  projectId,
  branch,
  graph,
  onClose,
}: {
  projectId: number
  branch: GraphBranch
  graph: Graph
  onClose: () => void
}) {
  const [state, dispatch] = useReducer(editorReducer, undefined, () =>
    initEditor(
      branch.taskNums.flatMap((num) => {
        const t = graph.tasks.find((x) => x.num === num)
        return t ? [{ num, title: t.title }] : []
      }),
    ),
  )
  const [title, setTitle] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const add = () => {
    dispatch({ type: 'add', title })
    setTitle('')
  }

  const save = async () => {
    setSaving(true)
    setError(null)
    try {
      await api.setBranchOrder(projectId, branch.id, toOrder(state))
      onClose()
    } catch (e) {
      setError(errorText(e))
      setSaving(false)
    }
  }

  const savable = canSave(state)
  const lastLabel = (i: number) => chipLabel(state.pieces[i][state.pieces[i].length - 1])

  return (
    <Popup title={`Edit links — ${branch.name}`} onClose={onClose}>
      <div className="link-editor">
        {state.pieces.map((piece, pi) => (
          <div className="piece" key={piece.map((i) => ('tempId' in i ? i.tempId : i.num)).join('|')}>
            <div className="chips">
              {piece.map((item, ii) => (
                <span className="chip-group" key={'tempId' in item ? item.tempId : item.num}>
                  <span className={isTemp(item) ? 'chip chip-new' : 'chip'}>
                    {chipLabel(item)}
                    {isTemp(item) && (
                      <button
                        type="button"
                        aria-label={`Remove ${chipLabel(item)}`}
                        onClick={() => dispatch({ type: 'remove', piece: pi, index: ii })}
                      >
                        ×
                      </button>
                    )}
                  </span>
                  {ii < piece.length - 1 && (
                    <>
                      <span className="link-mark" aria-hidden="true">
                        —
                      </span>
                      <button
                        type="button"
                        className="cut"
                        aria-label={`Cut after ${chipLabel(item)}`}
                        onClick={() => dispatch({ type: 'cut', piece: pi, after: ii })}
                      >
                        ✂
                      </button>
                      <span className="link-mark" aria-hidden="true">
                        —
                      </span>
                    </>
                  )}
                </span>
              ))}
            </div>
            {state.pieces.length > 1 && (
              <select
                aria-label={`Link ${chipLabel(piece[0])} after`}
                value=""
                onChange={(e) => dispatch({ type: 'link', fromPiece: Number(e.target.value), toPiece: pi })}
              >
                <option value="" disabled>
                  Link after…
                </option>
                {state.pieces.map((_, j) =>
                  j === pi ? null : (
                    <option key={j} value={j}>
                      {lastLabel(j)}
                    </option>
                  ),
                )}
              </select>
            )}
          </div>
        ))}
        <div className="new-task">
          <input
            aria-label="New task title"
            value={title}
            placeholder="New task title"
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') add()
            }}
          />
          <button type="button" onClick={add} disabled={!title.trim()}>
            + New task
          </button>
        </div>
      </div>
      <ErrorLine message={error} />
      <div className="popup-actions">
        <button type="button" onClick={onClose}>
          Cancel
        </button>
        <button type="button" onClick={save} disabled={!savable || saving}>
          Save
        </button>
      </div>
      {!savable && <p className="popup-note">Link all pieces into one chain to save.</p>}
    </Popup>
  )
}
