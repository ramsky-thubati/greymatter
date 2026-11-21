// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'
import type { Graph, GraphBranch, GraphTask } from '../../src/core/graph.js'
import { api } from '../../src/web/api.js'
import { LinkEditor } from '../../src/web/LinkEditor.js'

const task = (num: number, title: string): GraphTask => ({
  projectId: 1,
  num,
  branchId: 1,
  title,
  details: '',
  state: 'todo',
  branchPos: num,
  seq: num,
  flagged: false,
  blockedBy: [],
  blocked: false,
})

const branch: GraphBranch = {
  id: 1,
  projectId: 1,
  name: 'main',
  purpose: '',
  rootTaskNum: null,
  taskNums: [3, 4],
  nextTaskNum: null,
  stuck: false,
  finished: false,
}

const graph: Graph = {
  project: { id: 1, name: 'demo' },
  branches: [branch],
  tasks: [task(3, 'alpha'), task(4, 'beta')],
  checkpoints: [],
  liveVersion: 1,
}

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

const setup = () => {
  const onClose = vi.fn()
  render(<LinkEditor projectId={1} branch={branch} graph={graph} onClose={onClose} />)
  return onClose
}

test('shows chips, and Save is disabled after a cut with a hint', () => {
  setup()
  expect(screen.getByRole('dialog', { name: 'Edit links — main' })).toBeTruthy()
  expect((screen.getByRole('button', { name: 'Save' }) as HTMLButtonElement).disabled).toBe(false)
  expect(screen.queryByText('Link all pieces into one chain to save.')).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'Cut after T-3 alpha' }))
  expect((screen.getByRole('button', { name: 'Save' }) as HTMLButtonElement).disabled).toBe(true)
  expect(screen.getByText('Link all pieces into one chain to save.')).toBeTruthy()
})

test('inserting a new task and relinking enables Save and saves the order', async () => {
  const save = vi.spyOn(api, 'setBranchOrder').mockResolvedValue([])
  const onClose = setup()
  fireEvent.click(screen.getByRole('button', { name: 'Cut after T-3 alpha' }))
  fireEvent.change(screen.getByLabelText('New task title'), { target: { value: 'clean holes' } })
  fireEvent.click(screen.getByRole('button', { name: '+ New task' }))
  expect(screen.getByRole('button', { name: 'Remove new: clean holes' })).toBeTruthy()
  fireEvent.change(screen.getByLabelText('Link new: clean holes after'), { target: { value: '0' } })
  fireEvent.change(screen.getByLabelText('Link T-4 beta after'), { target: { value: '0' } })
  const saveButton = screen.getByRole('button', { name: 'Save' }) as HTMLButtonElement
  expect(saveButton.disabled).toBe(false)
  fireEvent.click(saveButton)
  await waitFor(() => expect(onClose).toHaveBeenCalled())
  expect(save).toHaveBeenCalledWith(1, 1, [{ task: 3 }, { title: 'clean holes' }, { task: 4 }])
})

test('a server error shows inline and the editor stays open', async () => {
  vi.spyOn(api, 'setBranchOrder').mockRejectedValue(new Error('branch changed'))
  const onClose = setup()
  fireEvent.click(screen.getByRole('button', { name: 'Save' }))
  expect((await screen.findByRole('alert')).textContent).toBe('branch changed')
  expect(onClose).not.toHaveBeenCalled()
  expect(screen.getByRole('dialog')).toBeTruthy()
})

test('Cancel closes without saving', () => {
  const save = vi.spyOn(api, 'setBranchOrder')
  const onClose = setup()
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
  expect(onClose).toHaveBeenCalled()
  expect(save).not.toHaveBeenCalled()
})

test('a new task can be removed before saving', () => {
  setup()
  fireEvent.change(screen.getByLabelText('New task title'), { target: { value: 'oops' } })
  fireEvent.click(screen.getByRole('button', { name: '+ New task' }))
  fireEvent.click(screen.getByRole('button', { name: 'Remove new: oops' }))
  expect(screen.queryByText('new: oops')).toBeNull()
})

test('an empty branch can get a first task and save it', async () => {
  const save = vi.spyOn(api, 'setBranchOrder').mockResolvedValue([])
  const empty = { ...branch, taskNums: [] }
  const onClose = vi.fn()
  render(<LinkEditor projectId={1} branch={empty} graph={{ ...graph, branches: [empty], tasks: [] }} onClose={onClose} />)
  fireEvent.change(screen.getByLabelText('New task title'), { target: { value: 'x' } })
  fireEvent.click(screen.getByRole('button', { name: '+ New task' }))
  const saveButton = screen.getByRole('button', { name: 'Save' }) as HTMLButtonElement
  expect(saveButton.disabled).toBe(false)
  fireEvent.click(saveButton)
  await waitFor(() => expect(onClose).toHaveBeenCalled())
  expect(save).toHaveBeenCalledWith(1, 1, [{ title: 'x' }])
})
