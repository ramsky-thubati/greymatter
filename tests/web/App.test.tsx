// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import type { Graph } from '../../src/core/graph.js'
import { api } from '../../src/web/api.js'
import { App } from '../../src/web/App.js'

class FakeSource {
  addEventListener() {}
  close() {}
}

const graph: Graph = {
  project: { id: 1, name: 'demo' },
  branches: [
    { id: 1, projectId: 1, name: 'main', purpose: '', rootTaskNum: null, taskNums: [7, 9], nextTaskNum: 7, stuck: false, finished: false },
  ],
  tasks: [
    { projectId: 1, num: 7, branchId: 1, title: 'Design schema', details: '', state: 'todo', branchPos: 1, seq: 1, flagged: false, blockedBy: [], blocked: false },
    { projectId: 1, num: 9, branchId: 1, title: 'Write API', details: '', state: 'todo', branchPos: 2, seq: 2, flagged: false, blockedBy: [], blocked: false },
  ],
  checkpoints: [],
  liveVersion: 1,
}

beforeEach(() => {
  vi.stubGlobal('EventSource', FakeSource)
  vi.spyOn(api, 'listProjects').mockResolvedValue([{ id: 1, name: 'demo' }])
  vi.spyOn(api, 'getGraph').mockResolvedValue(graph)
})
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

test('clicking a stop opens the task popup, and Branch from here opens create-branch prefilled', async () => {
  const { container } = render(<App />)
  await waitFor(() => expect(container.querySelector('[data-task="T-9"]')).toBeTruthy())
  fireEvent.click(container.querySelector('[data-task="T-9"]')!)
  expect(screen.getByRole('dialog', { name: 'T-9' })).toBeTruthy()
  fireEvent.click(screen.getByText('Branch from here'))
  const dialog = await screen.findByRole('dialog', { name: 'New branch' })
  expect((within(dialog).getByLabelText('From task') as HTMLSelectElement).value).toBe('T-9')
})

const second = { ...graph, project: { id: 2, name: 'other' } }

test('summary edits survive switching to Graph and back', async () => {
  vi.spyOn(api, 'getSummary').mockResolvedValue({ version: 1, body: 'saved' })
  vi.spyOn(api, 'listSummaryVersions').mockResolvedValue([{ version: 1, body: 'saved', frozenAt: null }])
  render(<App />)
  fireEvent.click(await screen.findByRole('button', { name: 'Summary' }))
  const box = (await screen.findByLabelText('Summary')) as HTMLTextAreaElement
  await waitFor(() => expect(box.value).toBe('saved'))
  fireEvent.change(box, { target: { value: 'typed' } })
  fireEvent.click(screen.getByRole('button', { name: 'Graph' }))
  fireEvent.click(screen.getByRole('button', { name: 'Summary' }))
  expect((screen.getByLabelText('Summary') as HTMLTextAreaElement).value).toBe('typed')
})

test('switching project while the summary is dirty asks first, and cancel keeps the project', async () => {
  vi.mocked(api.listProjects).mockResolvedValue([
    { id: 1, name: 'demo' },
    { id: 2, name: 'other' },
  ])
  vi.mocked(api.getGraph).mockImplementation(async (id) => (id === 2 ? second : graph))
  vi.spyOn(api, 'getSummary').mockResolvedValue({ version: 1, body: 'saved' })
  vi.spyOn(api, 'listSummaryVersions').mockResolvedValue([{ version: 1, body: 'saved', frozenAt: null }])
  const confirm = vi.fn().mockReturnValue(false)
  vi.stubGlobal('confirm', confirm)
  render(<App />)
  fireEvent.click(await screen.findByRole('button', { name: 'Summary' }))
  const box = (await screen.findByLabelText('Summary')) as HTMLTextAreaElement
  await waitFor(() => expect(box.value).toBe('saved'))
  fireEvent.change(box, { target: { value: 'typed' } })
  const select = screen.getByLabelText('Project') as HTMLSelectElement
  fireEvent.change(select, { target: { value: '2' } })
  expect(confirm).toHaveBeenCalledWith('Discard unsaved summary edits?')
  expect(select.value).toBe('1')
  confirm.mockReturnValue(true)
  fireEvent.change(select, { target: { value: '2' } })
  await waitFor(() => expect(select.value).toBe('2'))
})
