import { afterEach, expect, test, vi } from 'vitest'
import { api } from '../../src/web/api.js'
import { diffDraft, draftOf, isDirty, rebaseDraft, saveDraft } from '../../src/web/taskDraft.js'
import { demoGraph } from './fixtures.js'

afterEach(() => vi.restoreAllMocks())

const live = () => demoGraph().tasks.find((t) => t.num === 5)!

test('fresh draft is clean', () => {
  const t = live()
  expect(isDirty(t, draftOf(t))).toBe(false)
  expect(diffDraft(t, draftOf(t))).toEqual({ patch: {}, add: [], remove: [] })
})

test('diffDraft builds patch, add and remove', () => {
  const t = live()
  const d = { ...draftOf(t), title: 'New', state: 'done' as const, blockedBy: [1, 2] }
  expect(diffDraft(t, d)).toEqual({ patch: { title: 'New', state: 'done' }, add: [1, 2], remove: [3] })
  expect(isDirty(t, d)).toBe(true)
})

test('blocker order does not count as a change', () => {
  const t = { ...live(), blockedBy: [1, 3] }
  expect(isDirty(t, { ...draftOf(t), blockedBy: [3, 1] })).toBe(false)
})

test('saveDraft runs patch, then removes, then adds', async () => {
  const calls: string[] = []
  vi.spyOn(api, 'updateTask').mockImplementation(async () => {
    calls.push('patch')
    return {} as never
  })
  vi.spyOn(api, 'removeBlocker').mockImplementation(async (_p, task, b) => {
    calls.push(`remove ${task} ${b}`)
  })
  vi.spyOn(api, 'addBlocker').mockImplementation(async (_p, task, b) => {
    calls.push(`add ${task} ${b}`)
  })
  const t = live()
  await saveDraft(1, t, { ...draftOf(t), title: 'X', blockedBy: [1] })
  expect(calls).toEqual(['patch', 'remove T-5 T-3', 'add T-5 T-1'])
  expect(api.updateTask).toHaveBeenCalledWith(1, 'T-5', { title: 'X' })
})

test('saveDraft skips an empty patch and stops at the first failure', async () => {
  vi.spyOn(api, 'updateTask').mockResolvedValue({} as never)
  vi.spyOn(api, 'removeBlocker').mockRejectedValue(new Error('no'))
  const add = vi.spyOn(api, 'addBlocker').mockResolvedValue(undefined)
  const t = live()
  await expect(saveDraft(1, t, { ...draftOf(t), blockedBy: [1] })).rejects.toThrow('no')
  expect(api.updateTask).not.toHaveBeenCalled()
  expect(add).not.toHaveBeenCalled()
})

test('rebase: untouched fields follow the server, touched ones stay', () => {
  const t = live()
  const base = draftOf(t)
  const draft = { ...base, title: 'Mine' }
  const server = { ...t, title: 'Theirs', details: 'from Claude', state: 'done' as const }
  expect(rebaseDraft(base, draft, server)).toEqual({ ...draftOf(server), title: 'Mine' })
  expect(diffDraft(server, rebaseDraft(base, draft, server))).toEqual({ patch: { title: 'Mine' }, add: [], remove: [] })
})

test('rebase: blocker edits replay on top of the server list', () => {
  const t = { ...live(), blockedBy: [3] }
  const base = draftOf(t)
  expect(rebaseDraft(base, { ...base, blockedBy: [3, 1] }, { ...t, blockedBy: [3, 2] }).blockedBy).toEqual([3, 2, 1])
  expect(rebaseDraft(base, { ...base, blockedBy: [] }, { ...t, blockedBy: [3, 2] }).blockedBy).toEqual([2])
})

test('rebase: drops blockers whose task is gone', () => {
  const t = { ...live(), blockedBy: [] }
  const base = draftOf(t)
  expect(rebaseDraft(base, { ...base, blockedBy: [1, 2] }, t, (n) => n !== 2).blockedBy).toEqual([1])
})
