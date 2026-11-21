// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'
import type { Graph } from '../../src/core/graph.js'
import { api } from '../../src/web/api.js'
import { BranchDialog } from '../../src/web/dialogs/BranchDialog.js'
import { NewBranchDialog } from '../../src/web/dialogs/NewBranchDialog.js'
import { ToastProvider } from '../../src/web/ui/Toast.js'
import { demoGraph, makeGraph } from './fixtures.js'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

const nested = (): Graph =>
  makeGraph(
    [
      { id: 1, name: 'main' },
      { id: 2, name: 'Lighting', root: 2, color: '#613583' },
      { id: 3, name: 'Lamps', root: 4 },
    ],
    [
      { num: 1, branchId: 1, seq: 1, title: 'Clear' },
      { num: 2, branchId: 1, seq: 2, title: 'Measure' },
      { num: 4, branchId: 2, seq: 3, title: 'Buy lamps' },
      { num: 6, branchId: 3, seq: 4, title: 'Wire lamps' },
    ],
  )

function show(graph: Graph = nested(), branchId = 2) {
  const h = { onClose: vi.fn(), onDelete: vi.fn() }
  const ui = (g: Graph) => (
    <ToastProvider>
      <BranchDialog projectId={1} graph={g} branchId={branchId} {...h} />
    </ToastProvider>
  )
  const r = render(ui(graph))
  return { h, rerenderWith: (g: Graph) => r.rerender(ui(g)) }
}

const save = () => screen.getByRole('button', { name: 'Save' }) as HTMLButtonElement
const hexInput = () => {
  fireEvent.click(screen.getByRole('button', { name: 'Choose colour' }))
  return screen.getByLabelText('Hex') as HTMLInputElement
}
const openFrom = () => fireEvent.pointerDown(screen.getByRole('button', { name: /Branches from/ }), { button: 0 })

test('fields render with the hex in the colour row', () => {
  show()
  expect(screen.getByRole('heading').textContent).toBe('Branch')
  expect((screen.getByLabelText('Name') as HTMLInputElement).value).toBe('Lighting')
  expect(screen.getByLabelText('Purpose')).toBeTruthy()
  expect(screen.getByText('#613583')).toBeTruthy()
  expect(screen.getByRole('button', { name: /Branches from/ }).textContent).toContain('Measure')
  expect(screen.queryByText(/Edit links/)).toBeNull()
  expect(save().disabled).toBe(true)
})

test('Branches from skips own and sub-branch tasks', () => {
  show()
  openFrom()
  const names = screen.getAllByRole('menuitemradio').map((i) => i.textContent ?? '')
  expect(names[0]).toContain('Nothing (top level)')
  expect(names.some((n) => n.includes('Clear'))).toBe(true)
  expect(names.some((n) => n.includes('Buy lamps'))).toBe(false)
  expect(names.some((n) => n.includes('Wire lamps'))).toBe(false)
})

test('hex input sets the colour and Save sends only it', async () => {
  const update = vi.spyOn(api, 'updateBranch').mockResolvedValue({} as never)
  const { h } = show()
  fireEvent.change(hexInput(), { target: { value: '#00ff00' } })
  expect((document.querySelector('.preview-pill') as HTMLElement).style.backgroundColor).toBe('rgb(0, 255, 0)')
  fireEvent.click(save())
  await waitFor(() => expect(update).toHaveBeenCalledWith(1, 2, { color: '#00ff00' }))
  await waitFor(() => expect(h.onClose).toHaveBeenCalled())
})

test('partial hex keeps Save off; upper case is sent lower case', async () => {
  const update = vi.spyOn(api, 'updateBranch').mockResolvedValue({} as never)
  show()
  const input = hexInput()
  fireEvent.change(input, { target: { value: '#12' } })
  expect(input.value).toBe('#12')
  expect(save().disabled).toBe(true)
  fireEvent.change(input, { target: { value: '#ABCDEF' } })
  expect(save().disabled).toBe(false)
  fireEvent.click(save())
  await waitFor(() => expect(update).toHaveBeenCalledWith(1, 2, { color: '#abcdef' }))
})

test('Nothing (top level) sends rootTask null', async () => {
  const update = vi.spyOn(api, 'updateBranch').mockResolvedValue({} as never)
  show()
  openFrom()
  fireEvent.click(screen.getByRole('menuitemradio', { name: /Nothing \(top level\)/ }))
  fireEvent.click(save())
  await waitFor(() => expect(update).toHaveBeenCalledWith(1, 2, { rootTask: null }))
})

test('picking a fork task sends its id', async () => {
  const update = vi.spyOn(api, 'updateBranch').mockResolvedValue({} as never)
  show()
  openFrom()
  fireEvent.click(screen.getByRole('menuitemradio', { name: /Clear/ }))
  fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Lights' } })
  fireEvent.click(save())
  await waitFor(() => expect(update).toHaveBeenCalledWith(1, 2, { name: 'Lights', rootTask: 'T-1' }))
})

test('closing while dirty asks first', () => {
  const { h } = show()
  fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Lights' } })
  fireEvent.click(screen.getByRole('button', { name: 'Close' }))
  expect(screen.getByRole('alertdialog', { name: 'Discard changes?' })).toBeTruthy()
  expect(h.onClose).not.toHaveBeenCalled()
})

test('Delete asks the parent', () => {
  const { h } = show()
  fireEvent.click(screen.getByRole('button', { name: 'Delete' }))
  expect(h.onDelete).toHaveBeenCalledWith({ kind: 'branch', branchId: 2 })
})

test('refresh keeps the draft; branch gone closes', () => {
  const { rerenderWith, h } = show()
  fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Mine' } })
  const g = nested()
  rerenderWith({ ...g, branches: g.branches.map((b) => (b.id === 2 ? { ...b, purpose: 'from Claude' } : b)) })
  expect((screen.getByLabelText('Name') as HTMLInputElement).value).toBe('Mine')
  rerenderWith({ ...g, branches: g.branches.filter((b) => b.id !== 2) })
  expect(h.onClose).toHaveBeenCalled()
})

function showNew(fromTask?: number) {
  const create = vi.spyOn(api, 'createBranch').mockResolvedValue({} as never)
  const onClose = vi.fn()
  render(
    <ToastProvider>
      <NewBranchDialog projectId={1} fromTask={fromTask} onClose={onClose} />
    </ToastProvider>,
  )
  expect(screen.getByRole('heading').textContent).toBe('New branch')
  expect(screen.queryByText(/Branches from/)).toBeNull()
  const btn = screen.getByRole('button', { name: 'Create branch' }) as HTMLButtonElement
  expect(btn.disabled).toBe(true)
  fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Wiring' } })
  fireEvent.click(btn)
  return { create, onClose }
}

test('New branch from a card forks from it', async () => {
  const { create, onClose } = showNew(2)
  await waitFor(() => expect(create).toHaveBeenCalledWith(1, { name: 'Wiring', fromTask: 'T-2' }))
  await waitFor(() => expect(onClose).toHaveBeenCalled())
})

test('New branch from the background is top level', async () => {
  const { create } = showNew()
  await waitFor(() => expect(create).toHaveBeenCalledWith(1, { name: 'Wiring' }))
})

test('demo graph main branch has no fork', () => {
  show(demoGraph(), 1)
  expect(screen.getByRole('button', { name: /Branches from/ }).textContent).toContain('Nothing (top level)')
})
