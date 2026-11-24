// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import type { Graph } from '../../src/core/graph.js'
import { api } from '../../src/web/api.js'
import { App } from '../../src/web/App.js'

class FakeSource {
  addEventListener() {}
  close() {}
}

const graph: Graph = {
  project: { id: 1, name: 'demo', status: 'in_progress' },
  branches: [
    {
      id: 1,
      projectId: 1,
      name: 'main',
      purpose: '',
      rootTaskNum: null,
      color: '#613583',
      taskNums: [7],
      nextTaskNum: 7,
      stuck: false,
      finished: false,
    },
  ],
  tasks: [
    {
      projectId: 1,
      num: 7,
      branchId: 1,
      title: 'Design schema',
      details: '',
      state: 'todo',
      branchPos: 1,
      seq: 1,
      flagged: false,
      blockedBy: [],
      blocked: false,
    },
  ],
  checkpoints: [],
  liveVersion: 1,
}

beforeEach(() => {
  window.location.hash = ''
  vi.stubGlobal('EventSource', FakeSource)
  vi.spyOn(api, 'listProjects').mockResolvedValue([
    { id: 1, name: 'demo', status: 'in_progress' },
    { id: 2, name: 'other', status: 'in_progress' },
  ])
  vi.spyOn(api, 'getGraph').mockResolvedValue(graph)
  vi.spyOn(api, 'getSummary').mockResolvedValue({ version: 1, body: 'hello' })
  vi.spyOn(api, 'listSummaryVersions').mockResolvedValue([{ version: 1, body: 'hello', frozenAt: null }])
})
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  window.location.hash = ''
})

const openDemo = async () => {
  render(<App />)
  fireEvent.click(await screen.findByRole('button', { name: 'demo' }))
  await screen.findByRole('button', { name: 'Home' })
}

test('lands on Home and lists projects', async () => {
  const { container } = render(<App />)
  expect(await screen.findByRole('button', { name: 'demo' })).toBeTruthy()
  expect(screen.getByRole('button', { name: 'other' })).toBeTruthy()
  expect(screen.getByText('greymatter')).toBeTruthy()
  expect(container.querySelector('select')).toBeNull()
})

test('opening a project shows Home link, name and switcher', async () => {
  await openDemo()
  expect(window.location.hash).toBe('#/projects/1')
  expect(screen.getByText('demo')).toBeTruthy()
  expect(screen.getByRole('button', { name: 'Graph' }).getAttribute('aria-pressed')).toBe('true')
  expect(screen.getByRole('button', { name: 'Summary' })).toBeTruthy()
  expect(screen.queryByRole('button', { name: '+ Branch' })).toBeNull()
  expect(screen.queryByRole('button', { name: '+ Task' })).toBeNull()
})

test('Home button returns to the list', async () => {
  await openDemo()
  fireEvent.click(screen.getByRole('button', { name: 'Home' }))
  await waitFor(() => expect(window.location.hash).toBe('#/'))
  expect(await screen.findByRole('button', { name: 'other' })).toBeTruthy()
})

test('New project creates and opens it', async () => {
  vi.spyOn(api, 'createProject').mockResolvedValue({ id: 9, name: 'fresh', status: 'in_progress' })
  render(<App />)
  fireEvent.click(await screen.findByRole('button', { name: 'New project' }))
  const create = screen.getByRole('button', { name: 'Create project' }) as HTMLButtonElement
  expect(create.disabled).toBe(true)
  fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'fresh' } })
  fireEvent.click(create)
  await waitFor(() => expect(window.location.hash).toBe('#/projects/9'))
  expect(api.createProject).toHaveBeenCalledWith('fresh')
})

test('leaving with unsaved summary asks first', async () => {
  await openDemo()
  fireEvent.click(screen.getByRole('button', { name: 'Summary' }))
  await waitFor(() => expect(window.location.hash).toBe('#/projects/1/summary'))
  const box = (await screen.findByRole('textbox', { name: 'Summary' })) as HTMLTextAreaElement
  await waitFor(() => expect(box.value).toBe('hello'))
  fireEvent.change(box, { target: { value: 'hello edited' } })

  fireEvent.click(screen.getByRole('button', { name: 'Home' }))
  expect(screen.getByRole('alertdialog', { name: 'Discard changes?' })).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: 'Keep editing' }))
  expect(window.location.hash).toBe('#/projects/1/summary')

  fireEvent.click(screen.getByRole('button', { name: 'Graph' }))
  expect(screen.getByRole('alertdialog', { name: 'Discard changes?' })).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: 'Discard' }))
  await waitFor(() => expect(window.location.hash).toBe('#/projects/1'))
})

test('no localStorage use', async () => {
  const set = vi.spyOn(Storage.prototype, 'setItem')
  await openDemo()
  expect(set).not.toHaveBeenCalled()
})

test('project list failure shows a toast', async () => {
  vi.mocked(api.listProjects).mockRejectedValue(new Error('server down'))
  render(<App />)
  expect(await screen.findByText('server down')).toBeTruthy()
  expect(document.querySelector('.error')).toBeNull()
})

test('card opens the task dialog; + opens New task', async () => {
  window.location.hash = '#/projects/1'
  render(<App />)
  fireEvent.click(await screen.findByText('Design schema'))
  expect((screen.getByLabelText('Title') as HTMLInputElement).value).toBe('Design schema')
  fireEvent.click(screen.getByRole('button', { name: 'Close' }))
  fireEvent.click(screen.getByRole('button', { name: 'Add task to main' }))
  expect(screen.getByRole('heading', { name: 'New task' })).toBeTruthy()
})

test('lane label opens Branch; double-click opens New branch', async () => {
  window.location.hash = '#/projects/1'
  render(<App />)
  fireEvent.click(await screen.findByRole('button', { name: 'main' }))
  expect(screen.getByRole('heading', { name: 'Branch' })).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: 'Close' }))
  fireEvent.doubleClick(document.querySelector('.graph-wrap')!)
  expect(screen.getByRole('heading', { name: 'New branch' })).toBeTruthy()
})

test('project menu marks complete', async () => {
  const set = vi.spyOn(api, 'setProjectStatus').mockResolvedValue({ id: 1, name: 'demo', status: 'complete' })
  window.location.hash = '#/projects/1'
  render(<App />)
  fireEvent.pointerDown(await screen.findByRole('button', { name: 'Project menu' }), { button: 0 })
  expect(screen.queryByRole('menuitem', { name: 'Mark as In Progress' })).toBeNull()
  fireEvent.click(screen.getByRole('menuitem', { name: 'Mark as Complete' }))
  await waitFor(() => expect(set).toHaveBeenCalledWith(1, 'complete'))
})

test('project menu on a complete project offers In Progress', async () => {
  vi.mocked(api.getGraph).mockResolvedValue({ ...graph, project: { ...graph.project, status: 'complete' } })
  window.location.hash = '#/projects/1'
  render(<App />)
  fireEvent.pointerDown(await screen.findByRole('button', { name: 'Project menu' }), { button: 0 })
  expect(screen.getByRole('menuitem', { name: 'Mark as In Progress' })).toBeTruthy()
  expect(screen.queryByRole('menuitem', { name: 'Mark as Complete' })).toBeNull()
})

test('delete project confirms then goes home', async () => {
  const del = vi.spyOn(api, 'deleteProject').mockResolvedValue()
  window.location.hash = '#/projects/1'
  render(<App />)
  fireEvent.pointerDown(await screen.findByRole('button', { name: 'Project menu' }), { button: 0 })
  fireEvent.click(screen.getByRole('menuitem', { name: 'Delete Project' }))
  expect(screen.getByText('Delete "demo"?')).toBeTruthy()
  expect(del).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: 'Delete' }))
  await waitFor(() => expect(del).toHaveBeenCalledWith(1))
  await waitFor(() => expect(window.location.hash).toBe('#/'))
})

test('home groups completed projects in a collapsed section', async () => {
  vi.mocked(api.listProjects).mockResolvedValue([
    { id: 1, name: 'demo', status: 'in_progress' },
    { id: 2, name: 'other', status: 'complete' },
  ])
  render(<App />)
  const summary = await screen.findByText('Completed (1)')
  expect((summary.closest('details') as HTMLDetailsElement).open).toBe(false)
  expect(summary.closest('details')?.textContent).toContain('other')
  expect(screen.getByText('demo').closest('details')).toBeNull()
})

test('no empty hint when every project is complete', async () => {
  vi.mocked(api.listProjects).mockResolvedValue([{ id: 2, name: 'other', status: 'complete' }])
  render(<App />)
  await screen.findByText('Completed (1)')
  expect(screen.queryByText('No projects yet.')).toBeNull()
})

test('no Completed section when nothing is complete', async () => {
  render(<App />)
  await screen.findByText('demo')
  expect(screen.queryByText(/^Completed/)).toBeNull()
})

test('deleting with unsaved summary edits goes straight home', async () => {
  vi.spyOn(api, 'deleteProject').mockResolvedValue()
  await openDemo()
  fireEvent.click(screen.getByRole('button', { name: 'Summary' }))
  const box = (await screen.findByRole('textbox', { name: 'Summary' })) as HTMLTextAreaElement
  await waitFor(() => expect(box.value).toBe('hello'))
  fireEvent.change(box, { target: { value: 'hello edited' } })
  fireEvent.pointerDown(screen.getByRole('button', { name: 'Project menu' }), { button: 0 })
  fireEvent.click(screen.getByRole('menuitem', { name: 'Delete Project' }))
  fireEvent.click(screen.getByRole('button', { name: 'Delete' }))
  await waitFor(() => expect(window.location.hash).toBe('#/'))
  expect(screen.queryByRole('alertdialog', { name: 'Discard changes?' })).toBeNull()
})
