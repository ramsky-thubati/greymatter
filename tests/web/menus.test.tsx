// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'
import type { Graph } from '../../src/core/graph.js'
import { api } from '../../src/web/api.js'
import { DeleteAlert } from '../../src/web/dialogs/DeleteAlert.js'
import { type DeleteTarget, GraphView } from '../../src/web/graph/GraphView.js'
import { ToastProvider } from '../../src/web/ui/Toast.js'
import { demoGraph, makeGraph } from './fixtures.js'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

function show() {
  const h = { onNewBranch: vi.fn(), onDelete: vi.fn(), onOpenTask: vi.fn() }
  const r = render(
    <ToastProvider>
      <GraphView projectId={1} graph={demoGraph()} onOpenBranch={() => {}} onAddTask={() => {}} {...h} />
    </ToastProvider>,
  )
  const card = (n: number) => r.container.querySelector<HTMLElement>(`[data-task="T-${n}"]`)!
  const bg = r.container.querySelector<HTMLElement>('.graph-wrap')!
  return { ...r, h, card, bg }
}

const menuItems = () => within(screen.getByRole('menu')).getAllByRole('menuitem').map((i) => i.textContent?.trim())

test('card menu items in order', () => {
  const { card } = show()
  fireEvent.contextMenu(card(1))
  expect(menuItems()).toEqual([expect.stringMatching(/^Status/), 'Branch from here', 'Delete'])
})

test('Status submenu changes state at once', async () => {
  const update = vi.spyOn(api, 'updateTask').mockResolvedValue({} as never)
  const { card } = show()
  fireEvent.contextMenu(card(1))
  fireEvent.keyDown(screen.getByRole('menuitem', { name: /Status/ }), { key: 'ArrowRight' })
  const later = await screen.findByRole('menuitemradio', { name: /Later/ })
  expect(screen.getAllByRole('menuitemradio').map((i) => i.textContent?.trim())).toEqual([
    'To do',
    'In progress',
    'Later',
    'Done',
    'Cancelled',
  ])
  fireEvent.click(later)
  await waitFor(() => expect(update).toHaveBeenCalledWith(1, 'T-1', { state: 'later' }))
})

test('Branch from here', () => {
  const { card, h } = show()
  fireEvent.contextMenu(card(2))
  fireEvent.click(screen.getByRole('menuitem', { name: 'Branch from here' }))
  expect(h.onNewBranch).toHaveBeenCalledWith(2)
})

test('Delete asks the parent', () => {
  const { card, h } = show()
  fireEvent.contextMenu(card(3))
  fireEvent.click(screen.getByRole('menuitem', { name: 'Delete' }))
  expect(h.onDelete).toHaveBeenCalledWith({ kind: 'task', num: 3 })
})

test('background menu has New branch', () => {
  const { bg, h } = show()
  fireEvent.contextMenu(bg)
  expect(menuItems()).toEqual(['New branch'])
  fireEvent.click(screen.getByRole('menuitem', { name: 'New branch' }))
  expect(h.onNewBranch).toHaveBeenCalledWith(undefined)
})

test('double-click on the background, not on a card', () => {
  const { bg, card, h } = show()
  fireEvent.doubleClick(card(1))
  expect(h.onNewBranch).not.toHaveBeenCalled()
  fireEvent.doubleClick(bg)
  expect(h.onNewBranch).toHaveBeenCalledWith(undefined)
})

function alert(graph: Graph, target: DeleteTarget) {
  const onDone = vi.fn()
  const onCancel = vi.fn()
  render(
    <ToastProvider>
      <DeleteAlert projectId={1} graph={graph} target={target} onDone={onDone} onCancel={onCancel} />
    </ToastProvider>,
  )
  return { onDone, onCancel, dialog: screen.getByRole('alertdialog') }
}

test('delete task with dependents', async () => {
  const del = vi.spyOn(api, 'deleteTask').mockResolvedValue(undefined)
  const { dialog, onDone } = alert(demoGraph(), { kind: 'task', num: 3 })
  expect(within(dialog).getByRole('heading').textContent).toBe('Delete T-3?')
  expect(dialog.textContent).toContain("T-5 is blocked by this task. This can't be undone.")
  fireEvent.click(within(dialog).getByRole('button', { name: 'Delete' }))
  await waitFor(() => expect(del).toHaveBeenCalledWith(1, 'T-3', { confirm: true }))
  await waitFor(() => expect(onDone).toHaveBeenCalled())
})

test('delete task without dependents', async () => {
  const del = vi.spyOn(api, 'deleteTask').mockResolvedValue(undefined)
  const { dialog } = alert(demoGraph(), { kind: 'task', num: 5 })
  expect(dialog.textContent).toContain("This can't be undone.")
  expect(dialog.textContent).not.toContain('blocked by')
  fireEvent.click(within(dialog).getByRole('button', { name: 'Delete' }))
  await waitFor(() => expect(del).toHaveBeenCalledWith(1, 'T-5'))
})

test('fork point cannot be deleted', () => {
  const del = vi.spyOn(api, 'deleteTask')
  const { dialog, onCancel } = alert(demoGraph(), { kind: 'task', num: 2 })
  expect(within(dialog).getByRole('heading').textContent).toBe("Can't delete yet")
  expect(dialog.textContent).toContain('Branch Lighting forks from this task. Move or delete it first.')
  expect(within(dialog).getAllByRole('button')).toHaveLength(1)
  fireEvent.click(within(dialog).getByRole('button', { name: 'OK' }))
  expect(onCancel).toHaveBeenCalled()
  expect(del).not.toHaveBeenCalled()
})

test('delete branch names its tasks', async () => {
  const del = vi.spyOn(api, 'deleteBranch').mockResolvedValue(undefined)
  const g = makeGraph(
    [
      { id: 1, name: 'main' },
      { id: 2, name: 'side' },
    ],
    [
      { num: 1, branchId: 2, seq: 1 },
      { num: 2, branchId: 2, seq: 2 },
      { num: 3, branchId: 1, seq: 3, blockedBy: [1] },
    ],
  )
  const { dialog } = alert(g, { kind: 'branch', branchId: 2 })
  expect(within(dialog).getByRole('heading').textContent).toBe('Delete branch side and its 2 tasks?')
  expect(dialog.textContent).toContain('T-3 is blocked by a task on this branch.')
  fireEvent.click(within(dialog).getByRole('button', { name: 'Delete' }))
  await waitFor(() => expect(del).toHaveBeenCalledWith(1, 2, { confirm: true }))
})

test('failed delete shows a toast', async () => {
  vi.spyOn(api, 'deleteTask').mockRejectedValue(new Error('gone'))
  const { dialog } = alert(demoGraph(), { kind: 'task', num: 5 })
  fireEvent.click(within(dialog).getByRole('button', { name: 'Delete' }))
  expect(await screen.findByText('gone')).toBeTruthy()
})
