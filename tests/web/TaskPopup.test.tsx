// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'
import type { Graph, GraphBranch, GraphTask } from '../../src/core/graph.js'
import { api } from '../../src/web/api.js'
import { BranchPopup } from '../../src/web/BranchPopup.js'
import { TaskPopup } from '../../src/web/TaskPopup.js'

const task = (num: number, over: Partial<GraphTask> = {}): GraphTask => ({
  projectId: 1,
  num,
  branchId: 1,
  title: `Task ${num}`,
  details: '',
  state: 'todo',
  branchPos: num,
  seq: num,
  flagged: false,
  blockedBy: [],
  blocked: false,
  ...over,
})

const branch = (id: number, name: string, taskNums: number[], rootTaskNum: number | null = null): GraphBranch => ({
  id,
  projectId: 1,
  name,
  purpose: '',
  rootTaskNum,
  taskNums,
  nextTaskNum: null,
  stuck: false,
  finished: false,
})

const graph = (): Graph => ({
  project: { id: 1, name: 'demo' },
  branches: [
    branch(1, 'main', [7, 9, 10]),
    branch(2, 'spike', [11, 12], 7),
    branch(3, 'deep', [13], 12),
    branch(4, 'other', [14], 9),
  ],
  tasks: [
    task(7, { title: 'Design schema' }),
    task(9, { title: 'Write API' }),
    task(10, { title: 'Write UI' }),
    task(11, { branchId: 2 }),
    task(12, { branchId: 2 }),
    task(13, { branchId: 3 }),
    task(14, { branchId: 4 }),
  ],
  checkpoints: [],
  liveVersion: 1,
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

const renderTask = (g = graph(), onClose = () => {}) =>
  render(<TaskPopup projectId={1} task={g.tasks[0]!} graph={g} onClose={onClose} />)

test('changing state calls updateTask', () => {
  const g = graph()
  const update = vi.spyOn(api, 'updateTask').mockResolvedValue(g.tasks[0]!)
  renderTask(g)
  fireEvent.change(screen.getByLabelText('State'), { target: { value: 'done' } })
  expect(update).toHaveBeenCalledWith(1, 'T-7', { state: 'done' })
})

test('delete with dependents asks before confirming', async () => {
  vi.spyOn(api, 'deleteTask')
    .mockRejectedValueOnce({ status: 409, details: { dependents: [9] } })
    .mockResolvedValueOnce(undefined)
  renderTask()
  fireEvent.click(screen.getByText('Delete'))
  expect(await screen.findByText('T-9 waits on this task. Delete anyway?')).toBeTruthy()
})

test('several dependents use the plural copy', async () => {
  vi.spyOn(api, 'deleteTask').mockRejectedValueOnce({ status: 409, details: { dependents: [9, 10] } })
  renderTask()
  fireEvent.click(screen.getByText('Delete'))
  expect(await screen.findByText('T-9, T-10 wait on this task. Delete anyway?')).toBeTruthy()
})

test('Delete anyway retries with confirm and closes', async () => {
  const del = vi
    .spyOn(api, 'deleteTask')
    .mockRejectedValueOnce({ status: 409, details: { dependents: [9] } })
    .mockResolvedValueOnce(undefined)
  const onClose = vi.fn()
  renderTask(graph(), onClose)
  fireEvent.click(screen.getByText('Delete'))
  fireEvent.click(await screen.findByText('Delete anyway'))
  await waitFor(() => expect(onClose).toHaveBeenCalled())
  expect(del).toHaveBeenLastCalledWith(1, 'T-7', { confirm: true })
})

test('forked branches show one line per branch name', async () => {
  vi.spyOn(api, 'deleteTask').mockRejectedValueOnce({ status: 409, details: { forkedBranches: [2, 4] } })
  renderTask()
  fireEvent.click(screen.getByText('Delete'))
  const alert = await screen.findByRole('alert')
  expect(alert.textContent).toContain('Branch spike forks from this task. Move or delete it first.')
  expect(alert.textContent).toContain('Branch other forks from this task. Move or delete it first.')
})

test('Esc closes, backdrop click closes, click inside does not', () => {
  const onClose = vi.fn()
  renderTask(graph(), onClose)
  fireEvent.mouseDown(screen.getByRole('dialog'))
  expect(onClose).not.toHaveBeenCalled()
  fireEvent.mouseDown(screen.getByTestId('popup-backdrop'))
  expect(onClose).toHaveBeenCalledTimes(1)
  fireEvent.keyDown(document, { key: 'Escape' })
  expect(onClose).toHaveBeenCalledTimes(2)
})

test('dialog is labelled and takes focus', () => {
  renderTask()
  const dialog = screen.getByRole('dialog')
  expect(dialog.getAttribute('aria-modal')).toBe('true')
  expect(screen.getByRole('dialog', { name: 'T-7' })).toBe(dialog)
  expect(document.activeElement).toBe(dialog)
})

test('blocker select excludes self and existing blockers; finished blockers are marked', () => {
  const g = graph()
  g.tasks[0] = task(7, { title: 'Design schema', blockedBy: [9] })
  g.tasks[1] = task(9, { title: 'Write API', state: 'done' })
  renderTask(g)
  const options = within(screen.getByLabelText('Add blocker')).getAllByRole('option').map((o) => o.textContent)
  expect(options).toContain('T-10 Write UI')
  expect(options).not.toContain('T-7 Design schema')
  expect(options).not.toContain('T-9 Write API')
  expect(screen.getByText(/\(done\)/)).toBeTruthy()
})

test('cycle refusal shows inline', async () => {
  vi.spyOn(api, 'addBlocker').mockRejectedValueOnce({ status: 409, message: 'would create a cycle' })
  renderTask()
  fireEvent.change(screen.getByLabelText('Add blocker'), { target: { value: 'T-10' } })
  expect((await screen.findByRole('alert')).textContent).toBe('would create a cycle')
})

test('unchanged title does not call the api; blank title error reverts', async () => {
  const update = vi.spyOn(api, 'updateTask').mockRejectedValue({ status: 400, message: 'title is required' })
  renderTask()
  const input = screen.getByLabelText('Title') as HTMLInputElement
  fireEvent.blur(input)
  expect(update).not.toHaveBeenCalled()
  fireEvent.change(input, { target: { value: '' } })
  fireEvent.blur(input)
  expect((await screen.findByRole('alert')).textContent).toBe('title is required')
  expect(input.value).toBe('Design schema')
})

test('popup closes when the task disappears from the graph', () => {
  const onClose = vi.fn()
  const g = graph()
  const { rerender } = render(<TaskPopup projectId={1} task={g.tasks[0]!} graph={g} onClose={onClose} />)
  const gone = { ...g, tasks: g.tasks.slice(1) }
  rerender(<TaskPopup projectId={1} task={g.tasks[0]!} graph={gone} onClose={onClose} />)
  expect(onClose).toHaveBeenCalled()
})

test('BranchPopup move-root excludes own and sub-branch tasks', () => {
  const g = graph()
  render(<BranchPopup projectId={1} branch={g.branches[1]!} graph={g} onClose={() => {}} onEditLinks={() => {}} />)
  const select = screen.getByLabelText('Root') as HTMLSelectElement
  const options = within(select).getAllByRole('option').map((o) => o.textContent)
  expect(options[0]).toBe('No root (top level)')
  expect(options.slice(1)).toEqual(['T-7 Design schema', 'T-9 Write API', 'T-10 Write UI', 'T-14 Task 14'])
  expect(select.value).toBe('T-7')
})

test('BranchPopup move root calls updateBranch', () => {
  const g = graph()
  const update = vi.spyOn(api, 'updateBranch').mockResolvedValue(g.branches[1]!)
  render(<BranchPopup projectId={1} branch={g.branches[1]!} graph={g} onClose={() => {}} onEditLinks={() => {}} />)
  fireEvent.change(screen.getByLabelText('Root'), { target: { value: '' } })
  expect(update).toHaveBeenCalledWith(1, 2, { rootTask: null })
})
