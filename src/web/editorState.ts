export type Item = { num: number; title: string } | { tempId: string; title: string }
export type EditorState = { pieces: Item[][] }
export type EditorAction =
  | { type: 'cut'; piece: number; after: number }
  | { type: 'add'; title: string }
  | { type: 'link'; fromPiece: number; toPiece: number }
  | { type: 'remove'; piece: number; index: number }

export const initEditor = (tasks: { num: number; title: string }[]): EditorState => ({
  pieces: [tasks.map((t) => ({ num: t.num, title: t.title }))],
})

export const isTemp = (item: Item): item is { tempId: string; title: string } => 'tempId' in item

function nextTempId(s: EditorState): string {
  let max = 0
  for (const item of s.pieces.flat()) {
    if (isTemp(item)) max = Math.max(max, Number(item.tempId.slice(4)))
  }
  return `new-${max + 1}`
}

export function editorReducer(s: EditorState, a: EditorAction): EditorState {
  switch (a.type) {
    case 'cut': {
      const piece = s.pieces[a.piece]
      if (!piece || a.after < 0 || a.after >= piece.length - 1) return s
      const pieces = [...s.pieces]
      pieces.splice(a.piece, 1, piece.slice(0, a.after + 1), piece.slice(a.after + 1))
      return { pieces }
    }
    case 'add': {
      const title = a.title.trim()
      if (!title) return s
      return { pieces: [...s.pieces, [{ tempId: nextTempId(s), title }]] }
    }
    case 'link': {
      const { fromPiece, toPiece } = a
      if (fromPiece === toPiece || !s.pieces[fromPiece] || !s.pieces[toPiece]) return s
      const pieces = s.pieces.map((p, i) => (i === fromPiece ? [...p, ...s.pieces[toPiece]] : p))
      pieces.splice(toPiece, 1)
      return { pieces }
    }
    case 'remove': {
      const piece = s.pieces[a.piece]
      const item = piece?.[a.index]
      if (!piece || !item || !isTemp(item)) return s
      const parts = [piece.slice(0, a.index), piece.slice(a.index + 1)].filter((p) => p.length > 0)
      const pieces = [...s.pieces]
      pieces.splice(a.piece, 1, ...parts)
      return { pieces }
    }
  }
}

export const canSave = (s: EditorState): boolean => s.pieces.length === 1

export const toOrder = (s: EditorState): ({ task: number } | { title: string })[] =>
  s.pieces.flat().map((i) => (isTemp(i) ? { title: i.title } : { task: i.num }))

export const chipLabel = (item: Item): string => (isTemp(item) ? `new: ${item.title}` : `T-${item.num} ${item.title}`)
