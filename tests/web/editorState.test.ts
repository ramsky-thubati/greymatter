import { expect, test } from 'vitest'
import { canSave, editorReducer, initEditor, toOrder, type EditorState } from '../../src/web/editorState.js'

test('cut, add, relink gives the inserted order', () => {
  let s = initEditor([{ num: 3, title: 'a' }, { num: 4, title: 'b' }])
  s = editorReducer(s, { type: 'cut', piece: 0, after: 0 })
  s = editorReducer(s, { type: 'add', title: 'clean holes' })
  expect(canSave(s)).toBe(false)
  s = editorReducer(s, { type: 'link', fromPiece: 0, toPiece: 2 })
  s = editorReducer(s, { type: 'link', fromPiece: 0, toPiece: 1 })
  expect(canSave(s)).toBe(true)
  expect(toOrder(s)).toEqual([{ task: 3 }, { title: 'clean holes' }, { task: 4 }])
})

test('cannot link a piece to itself', () => {
  const s = initEditor([{ num: 1, title: 'a' }])
  expect(editorReducer(s, { type: 'link', fromPiece: 0, toPiece: 0 })).toBe(s)
})

test('the head piece can move after another piece', () => {
  let s = initEditor([{ num: 3, title: 'a' }, { num: 4, title: 'b' }])
  s = editorReducer(s, { type: 'cut', piece: 0, after: 0 })
  s = editorReducer(s, { type: 'link', fromPiece: 1, toPiece: 0 })
  expect(toOrder(s)).toEqual([{ task: 4 }, { task: 3 }])
})

test('no-op edge cases return the same state', () => {
  const s = initEditor([{ num: 1, title: 'a' }, { num: 2, title: 'b' }])
  expect(editorReducer(s, { type: 'cut', piece: 0, after: 1 })).toBe(s)
  expect(editorReducer(s, { type: 'cut', piece: 5, after: 0 })).toBe(s)
  expect(editorReducer(s, { type: 'add', title: '   ' })).toBe(s)
  expect(editorReducer(s, { type: 'link', fromPiece: 0, toPiece: 3 })).toBe(s)
  expect(editorReducer(s, { type: 'link', fromPiece: 9, toPiece: 0 })).toBe(s)
  expect(editorReducer(s, { type: 'remove', piece: 0, index: 0 })).toBe(s)
})

test('add trims the title', () => {
  const s = editorReducer(initEditor([{ num: 1, title: 'a' }]), { type: 'add', title: '  hi  ' })
  expect(s.pieces[1]).toEqual([{ tempId: expect.any(String), title: 'hi' }])
})

test('added items get distinct temp ids', () => {
  let s = initEditor([])
  s = editorReducer(s, { type: 'add', title: 'x' })
  s = editorReducer(s, { type: 'add', title: 'x' })
  const ids = s.pieces.flat().map((i) => ('tempId' in i ? i.tempId : ''))
  expect(new Set(ids).size).toBe(2)
})

test('remove drops a lone temp item and its piece', () => {
  let s = editorReducer(initEditor([{ num: 1, title: 'a' }]), { type: 'add', title: 'x' })
  s = editorReducer(s, { type: 'remove', piece: 1, index: 0 })
  expect(s.pieces).toEqual([[{ num: 1, title: 'a' }]])
})

test('remove from the middle splits the piece in two', () => {
  const withTemp: EditorState = {
    pieces: [[{ num: 1, title: 'a' }, { tempId: 't', title: 'x' }, { num: 2, title: 'b' }]],
  }
  const out = editorReducer(withTemp, { type: 'remove', piece: 0, index: 1 })
  expect(out.pieces).toEqual([[{ num: 1, title: 'a' }], [{ num: 2, title: 'b' }]])
})

test('remove keeps the surviving side when the temp item is at an end', () => {
  const s: EditorState = { pieces: [[{ num: 1, title: 'a' }, { tempId: 't', title: 'x' }]] }
  expect(editorReducer(s, { type: 'remove', piece: 0, index: 1 }).pieces).toEqual([[{ num: 1, title: 'a' }]])
})

test('remove ignores existing tasks and bad indexes', () => {
  const s = initEditor([{ num: 1, title: 'a' }])
  expect(editorReducer(s, { type: 'remove', piece: 0, index: 0 })).toBe(s)
  expect(editorReducer(s, { type: 'remove', piece: 0, index: 4 })).toBe(s)
  expect(editorReducer(s, { type: 'remove', piece: 3, index: 0 })).toBe(s)
})

test('an empty branch has no pieces and one added task can be saved', () => {
  const empty = initEditor([])
  expect(empty.pieces).toEqual([])
  const s = editorReducer(empty, { type: 'add', title: 'x' })
  expect(s.pieces).toHaveLength(1)
  expect(canSave(s)).toBe(true)
  expect(toOrder(s)).toEqual([{ title: 'x' }])
})
