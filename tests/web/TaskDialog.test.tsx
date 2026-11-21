// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'
import type { Graph } from '../../src/core/graph.js'
import { ApiError, api } from '../../src/web/api.js'
import { NewTaskDialog } from '../../src/web/dialogs/NewTaskDialog.js'
import { TaskDialog } from '../../src/web/dialogs/TaskDialog.js'
import { ToastProvider } from '../../src/web/ui/Toast.js'
import { demoGraph, makeGraph } from './fixtures.js'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

function show(graph: Graph = demoGraph(), num = 3) {
  const h = { onClose: vi.fn(), onOpenTask: vi.fn(), onDelete: vi.fn() }
  const ui = (g: Graph) => (
    <ToastProvider>
      <TaskDialog projectId={1} graph={g} num={num} {...h} />
    </ToastProvider>
  )
  const r = render(ui(graph))
  return { ...r, h, rerenderWith: (g: Graph) => r.rerender(ui(g)) }
}

const title = () => screen.getByLabelText('Title') as HTMLInputElement
const save = () => screen.getByRole('button', { name: 'Save' }) as HTMLButtonElement
const spyAll = () => ({
  update: vi.spyOn(api, 'updateTask').mockResolvedValue({} as never),
  add: vi.spyOn(api, 'addBlocker').mockResolvedValue(undefined),
  remove: vi.spyOn(api, 'removeBlocker').mockResolvedValue(undefined),
})
const withTask = (g: Graph, num: number, patch: Partial<Graph['tasks'][number]>): Graph => ({
  ...g,
  tasks: g.tasks.map((t) => (t.num === num ? { ...t, ...patch } : t)),
})

test('header shows the state button, no label, no title text', () => {
  show()
  const dialog = screen.getByRole('dialog')
  const state = within(dialog).getByRole('button', { name: 'In progress' })
  expect(state.querySelector('.dot-in_progress')).toBeTruthy()
  expect(within(dialog).queryByText('State')).toBeNull()
  expect(within(dialog).queryByText('Paint the walls')).toBeNull()
  expect(title().value).toBe('Paint the walls')
})

test('Save is off until something changes', () => {
  show()
  expect(save().disabled).toBe(true)
  fireEvent.change(title(), { target: { value: 'Paint twice' } })
  expect(save().disabled).toBe(false)
})

test('state change waits for Save', async () => {
  const s = spyAll()
  show()
  fireEvent.pointerDown(screen.getByRole('button', { name: 'In progress' }), { button: 0 })
  fireEvent.click(screen.getByRole('menuitemradio', { name: /Done/ }))
  expect(s.update).not.toHaveBeenCalled()
  expect(screen.getByRole('button', { name: 'Done' })).toBeTruthy()
  fireEvent.click(save())
  await waitFor(() => expect(s.update).toHaveBeenCalledWith(1, 'T-3', { state: 'done' }))
})

test('blocker edits wait for Save, then run in order', async () => {
  const s = spyAll()
  show()
  fireEvent.click(screen.getByRole('button', { name: 'Remove blocker Make sure garage is empty' }))
  fireEvent.pointerDown(screen.getByRole('button', { name: 'Add blocker' }), { button: 0 })
  fireEvent.click(screen.getByRole('menuitem', { name: /Measure the walls/ }))
  expect(s.remove).not.toHaveBeenCalled()
  expect(s.add).not.toHaveBeenCalled()
  fireEvent.change(title(), { target: { value: 'Paint twice' } })
  fireEvent.click(save())
  await waitFor(() => expect(s.add).toHaveBeenCalledWith(1, 'T-3', 'T-2'))
  expect(s.update).toHaveBeenCalledWith(1, 'T-3', { title: 'Paint twice' })
  expect(s.remove).toHaveBeenCalledWith(1, 'T-3', 'T-1')
  expect(s.update.mock.invocationCallOrder[0]!).toBeLessThan(s.remove.mock.invocationCallOrder[0]!)
  expect(s.remove.mock.invocationCallOrder[0]!).toBeLessThan(s.add.mock.invocationCallOrder[0]!)
})

test('add blocker list skips self and current blockers', () => {
  show()
  fireEvent.pointerDown(screen.getByRole('button', { name: 'Add blocker' }), { button: 0 })
  const names = screen.getAllByRole('menuitem').map((i) => i.textContent)
  expect(names.some((n) => n?.includes('Paint the walls'))).toBe(false)
  expect(names.some((n) => n?.includes('Make sure garage is empty'))).toBe(false)
  expect(names.some((n) => n?.includes('Buy lamps'))).toBe(true)
})

test('Enter in Title does not save', () => {
  const s = spyAll()
  show()
  fireEvent.change(title(), { target: { value: 'Paint twice' } })
  fireEvent.keyDown(title(), { key: 'Enter' })
  expect(s.update).not.toHaveBeenCalled()
})

test('successful save closes', async () => {
  spyAll()
  const { h } = show()
  fireEvent.change(title(), { target: { value: 'Paint twice' } })
  fireEvent.click(save())
  await waitFor(() => expect(h.onClose).toHaveBeenCalled())
})

test('closing while dirty asks first', () => {
  const { h } = show()
  fireEvent.change(title(), { target: { value: 'Paint twice' } })
  fireEvent.click(screen.getByRole('button', { name: 'Close' }))
  expect(screen.getByRole('alertdialog', { name: 'Discard changes?' })).toBeTruthy()
  expect(h.onClose).not.toHaveBeenCalled()
})

test('flagged task shows the note', () => {
  show(makeGraph([{ id: 1, name: 'main' }], [{ num: 3, branchId: 1, seq: 1, flagged: true }]))
  expect(screen.getByText('A blocker was cancelled. Check this task still makes sense.')).toBeTruthy()
})

test('no Branch from here in the dialog; Delete asks the parent', () => {
  const { h } = show()
  expect(screen.queryByRole('button', { name: /Branch from here/ })).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'Delete' }))
  expect(h.onDelete).toHaveBeenCalledWith({ kind: 'task', num: 3 })
})

test('refresh keeps the draft; task gone closes', () => {
  const { rerenderWith, h } = show()
  fireEvent.change(title(), { target: { value: 'Mine' } })
  rerenderWith(withTask(demoGraph(), 3, { details: 'changed by Claude' }))
  expect(title().value).toBe('Mine')
  expect(h.onClose).not.toHaveBeenCalled()
  const g = demoGraph()
  rerenderWith({ ...g, tasks: g.tasks.filter((t) => t.num !== 3) })
  expect(h.onClose).toHaveBeenCalled()
})

test('partial save failure keeps the unsaved part', async () => {
  vi.spyOn(api, 'updateTask').mockResolvedValue({} as never)
  vi.spyOn(api, 'addBlocker').mockRejectedValue(new ApiError(400, 'invalid', 'would create a cycle'))
  const { rerenderWith, h } = show()
  fireEvent.change(title(), { target: { value: 'Paint twice' } })
  fireEvent.pointerDown(screen.getByRole('button', { name: 'Add blocker' }), { button: 0 })
  fireEvent.click(screen.getByRole('menuitem', { name: /Pack away loose stuff/ }))
  fireEvent.click(save())
  expect(await screen.findByText('would create a cycle')).toBeTruthy()
  expect(h.onClose).not.toHaveBeenCalled()
  rerenderWith(withTask(demoGraph(), 3, { title: 'Paint twice' }))
  expect(save().disabled).toBe(false)
  vi.mocked(api.updateTask).mockClear()
  vi.mocked(api.addBlocker).mockResolvedValue(undefined)
  fireEvent.click(save())
  await waitFor(() => expect(api.addBlocker).toHaveBeenCalledWith(1, 'T-3', 'T-5'))
  expect(api.updateTask).not.toHaveBeenCalled()
})

test('New task dialog', async () => {
  const create = vi.spyOn(api, 'createTask').mockResolvedValue({} as never)
  const onClose = vi.fn()
  render(
    <ToastProvider>
      <NewTaskDialog projectId={1} branchId={2} onClose={onClose} />
    </ToastProvider>,
  )
  expect(screen.getByRole('heading').textContent).toBe('New task')
  const add = screen.getByRole('button', { name: 'Add task' }) as HTMLButtonElement
  expect(add.disabled).toBe(true)
  fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Sand floor' } })
  fireEvent.click(add)
  await waitFor(() => expect(create).toHaveBeenCalledWith(1, { branchId: 2, title: 'Sand floor' }))
  await waitFor(() => expect(onClose).toHaveBeenCalled())
})
