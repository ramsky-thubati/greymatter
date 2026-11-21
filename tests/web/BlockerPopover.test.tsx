// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'
import { api } from '../../src/web/api.js'
import { GraphView } from '../../src/web/graph/GraphView.js'
import { ToastProvider } from '../../src/web/ui/Toast.js'
import { demoGraph } from './fixtures.js'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

function show() {
  const onOpenTask = vi.fn()
  const r = render(
    <ToastProvider>
      <GraphView
        projectId={1}
        graph={demoGraph()}
        onOpenTask={onOpenTask}
        onOpenBranch={() => {}}
        onAddTask={() => {}}
        onNewBranch={() => {}}
        onDelete={() => {}}
      />
    </ToastProvider>,
  )
  const icon = (n: number, name: string) =>
    within(r.container.querySelector<HTMLElement>(`[data-task="T-${n}"]`)!).getByRole('button', { name })
  return { ...r, onOpenTask, icon }
}

const popover = () => screen.getByRole('dialog')

test('flag shows both sections, finished relations included', () => {
  const { icon, onOpenTask } = show()
  fireEvent.click(icon(3, 'Blocks another task'))
  expect(onOpenTask).not.toHaveBeenCalled()
  const p = popover()
  expect(p.textContent).toContain('Blocks')
  expect(p.textContent).toContain('Blocked by')
  const rows = within(p).getAllByRole('listitem')
  expect(rows.map((r) => r.textContent)).toEqual([
    expect.stringMatching(/Make sure garage is empty.*Done/),
    expect.stringMatching(/Pack away loose stuff.*To do/),
  ])
})

test('no Blocks heading when nothing is blocked', () => {
  const { icon } = show()
  fireEvent.click(icon(5, 'Blocked'))
  const p = popover()
  expect(within(p).getByText('Blocked by')).toBeTruthy()
  expect(within(p).queryByText('Blocks')).toBeNull()
})

test('clicking a row opens that task and closes the popover', async () => {
  const { icon, onOpenTask } = show()
  fireEvent.click(icon(3, 'Blocks another task'))
  fireEvent.click(within(popover()).getByRole('button', { name: /^(?!Remove).*Pack away loose stuff/ }))
  expect(onOpenTask).toHaveBeenCalledWith(5)
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
})

test('remove asks first, then removes', async () => {
  const remove = vi.spyOn(api, 'removeBlocker').mockResolvedValue(undefined)
  const { icon } = show()
  fireEvent.click(icon(3, 'Blocks another task'))
  fireEvent.click(within(popover()).getByRole('button', { name: 'Remove dependency on Pack away loose stuff' }))
  const alert = screen.getByRole('alertdialog', { name: 'Remove dependency?' })
  expect(alert.textContent).toContain('“Pack away loose stuff” will no longer be blocked by “Paint the walls”.')
  fireEvent.click(within(alert).getByRole('button', { name: 'Cancel' }))
  expect(remove).not.toHaveBeenCalled()

  fireEvent.click(within(popover()).getByRole('button', { name: 'Remove dependency on Pack away loose stuff' }))
  fireEvent.click(screen.getByRole('button', { name: 'Remove' }))
  await waitFor(() => expect(remove).toHaveBeenCalledWith(1, 'T-5', 'T-3'))
})

test('removing from the Blocked by side passes this task first', async () => {
  const remove = vi.spyOn(api, 'removeBlocker').mockResolvedValue(undefined)
  const { icon } = show()
  fireEvent.click(icon(3, 'Blocks another task'))
  fireEvent.click(within(popover()).getByRole('button', { name: 'Remove dependency on Make sure garage is empty' }))
  fireEvent.click(screen.getByRole('button', { name: 'Remove' }))
  await waitFor(() => expect(remove).toHaveBeenCalledWith(1, 'T-3', 'T-1'))
})

test('failed remove shows a toast', async () => {
  vi.spyOn(api, 'removeBlocker').mockRejectedValue(new Error('nope'))
  const { icon } = show()
  fireEvent.click(icon(3, 'Blocks another task'))
  fireEvent.click(within(popover()).getByRole('button', { name: 'Remove dependency on Pack away loose stuff' }))
  fireEvent.click(screen.getByRole('button', { name: 'Remove' }))
  expect(await screen.findByText('nope')).toBeTruthy()
})
