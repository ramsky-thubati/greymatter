// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'
import type { Graph } from '../../src/core/graph.js'
import { GraphView } from '../../src/web/graph/GraphView.js'
import { ToastProvider } from '../../src/web/ui/Toast.js'
import { demoGraph, makeGraph } from './fixtures.js'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

const handlers = () => ({
  onOpenTask: vi.fn(),
  onOpenBranch: vi.fn(),
  onAddTask: vi.fn(),
  onNewBranch: vi.fn(),
  onDelete: vi.fn(),
})

function show(graph: Graph = demoGraph(), h = handlers()) {
  const r = render(
    <ToastProvider>
      <GraphView projectId={1} graph={graph} {...h} />
    </ToastProvider>,
  )
  return { ...r, h, card: (n: number) => r.container.querySelector<HTMLElement>(`[data-task="T-${n}"]`)! }
}

test('cards show id and title, no status words', () => {
  const { card } = show()
  for (const n of [1, 2, 3, 4, 5]) {
    const c = card(n)
    expect(c.textContent).toContain(`T-${n}`)
    expect(c.textContent).not.toMatch(/Done|In progress|To do|Later|Cancelled/)
  }
  expect(card(3).textContent).toContain('Paint the walls')
})

test('in-progress card has the class', () => {
  const { card } = show()
  expect(card(3).classList.contains('in-progress')).toBe(true)
  expect(card(1).classList.contains('in-progress')).toBe(false)
})

test('cancelled card has the class', () => {
  const g = makeGraph([{ id: 1, name: 'main' }], [{ num: 1, branchId: 1, seq: 1, state: 'cancelled' }])
  const { card } = show(g)
  expect(card(1).classList.contains('cancelled')).toBe(true)
})

test('padlock and flag follow the rules', () => {
  const { card } = show()
  const q = (n: number, name: string) => within(card(n)).queryByRole('button', { name })
  expect(q(3, 'Blocked')).toBeNull()
  expect(q(3, 'Blocks another task')).toBeTruthy()
  expect(q(5, 'Blocked')).toBeTruthy()
  expect(q(1, 'Blocks another task')).toBeNull()
})

test('clicking a card opens it', () => {
  const { card, h } = show()
  fireEvent.click(card(3))
  expect(h.onOpenTask).toHaveBeenCalledWith(3)
})

test('branch indicator only on fork points and not a button', () => {
  const { container, card } = show()
  const marks = container.querySelectorAll('[aria-label="Has a branch"]')
  expect(marks).toHaveLength(1)
  expect(card(2).contains(marks[0]!)).toBe(true)
  expect(marks[0]!.tagName).not.toBe('BUTTON')
})

test('branch pill opens the branch', () => {
  const { h } = show()
  fireEvent.click(screen.getByRole('button', { name: 'Lighting' }))
  expect(h.onOpenBranch).toHaveBeenCalledWith(2)
})

test('each lane has an add button', () => {
  const { h } = show()
  fireEvent.click(screen.getByRole('button', { name: 'Add task to Lighting' }))
  expect(h.onAddTask).toHaveBeenCalledWith(2)
  expect(screen.getByRole('button', { name: 'Add task to main' })).toBeTruthy()
})

test('stuck branch shows a pill', () => {
  const g = makeGraph([{ id: 1, name: 'main', stuck: true }], [{ num: 1, branchId: 1, seq: 1 }])
  show(g)
  expect(screen.getByText('stuck')).toBeTruthy()
})

test('flagged task shows a warning', () => {
  const g = makeGraph([{ id: 1, name: 'main' }], [{ num: 1, branchId: 1, seq: 1, flagged: true }])
  const { card } = show(g)
  expect(
    within(card(1)).getByTitle('A blocker was cancelled. Check this task still makes sense.'),
  ).toBeTruthy()
})

test('checkpoint label renders', () => {
  show()
  expect(screen.getByText('v1 → v2')).toBeTruthy()
})

test('legend lists states and markers', () => {
  const { container } = show()
  const legend = container.querySelector('.legend')!
  for (const s of ['To do', 'In progress', 'Later', 'Done', 'Cancelled', 'Being worked on', 'Blocked', 'Blocks another task'])
    expect(legend.textContent).toContain(s)
})

test('no blocker curves', () => {
  const { container } = show()
  expect(container.querySelectorAll('.blocker-curve')).toHaveLength(0)
})

test('empty project shows the pill and add button', () => {
  const { container } = show(makeGraph([{ id: 1, name: 'main' }], []))
  expect(screen.getByRole('button', { name: 'main' })).toBeTruthy()
  expect(screen.getByRole('button', { name: 'Add task to main' })).toBeTruthy()
  expect(container.querySelectorAll('[data-task]')).toHaveLength(0)
})

test('sizes are rem', () => {
  const { container, card } = show()
  const graph = container.querySelector<HTMLElement>('.graph')!
  expect(graph.style.width).toMatch(/rem$/)
  expect(card(1).style.left).toMatch(/rem$/)
  expect(container.innerHTML).not.toMatch(/\d px|\dpx/)
})
