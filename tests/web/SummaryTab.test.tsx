// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { api } from '../../src/web/api.js'
import { SummaryTab } from '../../src/web/SummaryTab.js'
import { ToastProvider } from '../../src/web/ui/Toast.js'

class FakeSource {
  static all: FakeSource[] = []
  listeners: Record<string, (() => void)[]> = {}
  closed = false
  constructor(readonly url: string) {
    FakeSource.all.push(this)
  }
  addEventListener(name: string, fn: () => void) {
    ;(this.listeners[name] ??= []).push(fn)
  }
  emit(name: string) {
    this.listeners[name]?.forEach((fn) => fn())
  }
  close() {
    this.closed = true
  }
}

const md = '# Notes\n\n```ts\nconst a = 1\n```\n\n🙂\n'
let confirmSpy: ReturnType<typeof vi.fn>

beforeEach(() => {
  FakeSource.all = []
  vi.stubGlobal('EventSource', FakeSource)
  confirmSpy = vi.fn().mockReturnValue(true)
  vi.stubGlobal('confirm', confirmSpy)
  vi.spyOn(api, 'getSummary').mockResolvedValue({ version: 1, body: md })
  vi.spyOn(api, 'listSummaryVersions').mockResolvedValue([{ version: 1, body: md, frozenAt: null }])
})
afterEach(() => {
  try {
    expect(confirmSpy).not.toHaveBeenCalled()
    expect(screen.queryByText(/Reload to see it/)).toBeNull()
    expect(screen.queryByText(/Overwrite\?/)).toBeNull()
  } finally {
    cleanup()
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  }
})

const mount = (projectId = 1, onDirtyChange?: (d: boolean) => void) => {
  const ui = (id: number) => (
    <ToastProvider>
      <SummaryTab projectId={id} onDirtyChange={onDirtyChange} />
    </ToastProvider>
  )
  const r = render(ui(projectId))
  return { rerenderWith: (id: number) => r.rerender(ui(id)) }
}

const loaded = async () => {
  const box = (await screen.findByRole('textbox', { name: 'Summary' })) as HTMLTextAreaElement
  await waitFor(() => expect(box.value).toBe(md))
  return box
}
const btn = (name: string) => screen.getByRole('button', { name }) as HTMLButtonElement

test('heading, actions on top, Save at the bottom', async () => {
  vi.mocked(api.getSummary).mockResolvedValue({ version: 3, body: md })
  mount()
  expect(await screen.findByRole('heading', { name: 'Summary v3' })).toBeTruthy()
  const top = document.querySelector('.summary-head')!
  expect(within(top as HTMLElement).getByRole('button', { name: 'Copy' })).toBeTruthy()
  expect(within(top as HTMLElement).getByRole('button', { name: 'Checkpoint' })).toBeTruthy()
  const foot = document.querySelector('.summary-foot')!
  expect(within(foot as HTMLElement).getByRole('button', { name: 'Save' })).toBeTruthy()
})

test('copy puts the exact live body on the clipboard', async () => {
  const writeText = vi.fn().mockResolvedValue(undefined)
  vi.stubGlobal('navigator', { clipboard: { writeText } })
  mount()
  await loaded()
  fireEvent.click(btn('Copy'))
  expect(writeText).toHaveBeenCalledWith(md)
})

test('unsaved edits are kept through a live update, with no notice', async () => {
  mount()
  const box = await loaded()
  fireEvent.change(box, { target: { value: 'my edit' } })
  vi.mocked(api.getSummary).mockResolvedValue({ version: 1, body: 'from claude' })
  const calls = vi.mocked(api.getSummary).mock.calls.length
  await act(async () => FakeSource.all[0]!.emit('changed'))
  await waitFor(() => expect(api.getSummary).toHaveBeenCalledTimes(calls + 1))
  expect(box.value).toBe('my edit')
})

test('a live update with no edits just reloads', async () => {
  mount()
  const box = await loaded()
  vi.mocked(api.getSummary).mockResolvedValue({ version: 1, body: 'from claude' })
  await act(async () => FakeSource.all[0]!.emit('changed'))
  await waitFor(() => expect(box.value).toBe('from claude'))
})

test('text typed while a background reload is in flight is kept', async () => {
  mount()
  const box = await loaded()
  let resolve!: (v: { version: number; body: string }) => void
  vi.mocked(api.getSummary).mockReturnValue(new Promise((r) => (resolve = r)))
  await act(async () => FakeSource.all[0]!.emit('changed'))
  fireEvent.change(box, { target: { value: 'typed meanwhile' } })
  await act(async () => resolve({ version: 1, body: 'from claude' }))
  expect(box.value).toBe('typed meanwhile')
})

test('checkpoint asks in an alert, then calls createCheckpoint', async () => {
  const create = vi.spyOn(api, 'createCheckpoint').mockResolvedValue({})
  mount()
  await loaded()
  fireEvent.click(btn('Checkpoint'))
  const alert = screen.getByRole('alertdialog', { name: 'Freeze v1 and start v2 as a copy?' })
  fireEvent.click(within(alert).getByRole('button', { name: 'Checkpoint' }))
  await waitFor(() => expect(create).toHaveBeenCalledWith(1))
  await waitFor(() => expect(api.getSummary).toHaveBeenCalledTimes(2))
  expect(screen.queryByRole('alertdialog')).toBeNull()
})

test('cancelling the checkpoint alert does nothing', async () => {
  const create = vi.spyOn(api, 'createCheckpoint').mockResolvedValue({})
  mount()
  await loaded()
  fireEvent.click(btn('Checkpoint'))
  fireEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Cancel' }))
  expect(create).not.toHaveBeenCalled()
  expect(screen.queryByRole('alertdialog')).toBeNull()
})

test('checkpoint is disabled while there are unsaved edits and re-enabled after save', async () => {
  vi.spyOn(api, 'updateSummary').mockResolvedValue(undefined as never)
  mount()
  const box = await loaded()
  expect(btn('Checkpoint').disabled).toBe(false)
  fireEvent.change(box, { target: { value: 'typed' } })
  expect(btn('Checkpoint').disabled).toBe(true)
  expect(btn('Checkpoint').title).toBe('Save first')
  fireEvent.click(btn('Save'))
  await waitFor(() => expect(btn('Checkpoint').disabled).toBe(false))
})

test('older versions are collapsed rows, newest first, with Copy', async () => {
  const writeText = vi.fn().mockResolvedValue(undefined)
  vi.stubGlobal('navigator', { clipboard: { writeText } })
  vi.mocked(api.getSummary).mockResolvedValue({ version: 3, body: 'live' })
  vi.mocked(api.listSummaryVersions).mockResolvedValue([
    { version: 3, body: 'live', frozenAt: null },
    { version: 2, body: 'second', frozenAt: '2026-01-02' },
    { version: 1, body: 'first', frozenAt: '2026-01-01' },
  ])
  mount()
  const items = await screen.findAllByRole('listitem')
  expect(items).toHaveLength(2)
  expect(items[0]!.textContent).toContain('v2')
  expect(items[1]!.textContent).toContain('v1')
  expect(screen.queryByText('second')).toBeNull()
  const toggle = within(items[0]!).getByRole('button', { name: 'v2' })
  expect(toggle.getAttribute('aria-expanded')).toBe('false')
  fireEvent.click(toggle)
  expect(toggle.getAttribute('aria-expanded')).toBe('true')
  expect(within(items[0]!).getByText('second')).toBeTruthy()
  fireEvent.click(within(items[1]!).getByRole('button', { name: 'Copy' }))
  expect(writeText).toHaveBeenCalledWith('first')
})

test('save sends the text; a failed save toasts and keeps the text', async () => {
  const update = vi.spyOn(api, 'updateSummary').mockRejectedValueOnce(new Error('boom'))
  mount()
  const box = await loaded()
  expect(btn('Save').disabled).toBe(true)
  fireEvent.change(box, { target: { value: 'new' } })
  expect(btn('Save').disabled).toBe(false)
  fireEvent.click(btn('Save'))
  expect(await screen.findByText('boom')).toBeTruthy()
  expect(document.querySelector('.toast')).toBeTruthy()
  expect(box.value).toBe('new')
  update.mockResolvedValueOnce(undefined as never)
  fireEvent.click(btn('Save'))
  await waitFor(() => expect(btn('Save').disabled).toBe(true))
  expect(update).toHaveBeenLastCalledWith(1, 'new')
})

test('saving after Claude changed it just saves', async () => {
  const update = vi.spyOn(api, 'updateSummary').mockResolvedValue(undefined as never)
  mount()
  const box = await loaded()
  fireEvent.change(box, { target: { value: 'my edit' } })
  vi.mocked(api.getSummary).mockResolvedValue({ version: 1, body: 'from claude' })
  await act(async () => FakeSource.all[0]!.emit('changed'))
  fireEvent.click(btn('Save'))
  await waitFor(() => expect(update).toHaveBeenCalledWith(1, 'my edit'))
})

test('switching project reloads and closes the old stream', async () => {
  const { rerenderWith } = mount()
  await loaded()
  rerenderWith(2)
  await waitFor(() => expect(api.getSummary).toHaveBeenCalledWith(2))
  expect(FakeSource.all[0]!.closed).toBe(true)
  expect(FakeSource.all[1]!.url).toBe('/api/projects/2/events')
})

test('a failed load toasts with Retry; editor is read-only until it recovers', async () => {
  vi.mocked(api.getSummary).mockRejectedValueOnce(new Error('offline'))
  mount()
  const box = (await screen.findByRole('textbox', { name: 'Summary' })) as HTMLTextAreaElement
  expect(await screen.findByText('offline')).toBeTruthy()
  expect(box.readOnly).toBe(true)
  for (const name of ['Save', 'Checkpoint', 'Copy']) expect(btn(name).disabled).toBe(true)
  fireEvent.click(btn('Retry'))
  await waitFor(() => expect(box.value).toBe(md))
  expect(box.readOnly).toBe(false)
  expect(document.querySelector('.summary-error')).toBeNull()
})

test('an event stream reconnect reloads, but the first open does not', async () => {
  mount()
  const box = await loaded()
  const calls = vi.mocked(api.getSummary).mock.calls.length
  await act(async () => FakeSource.all[0]!.emit('open'))
  expect(api.getSummary).toHaveBeenCalledTimes(calls)
  vi.mocked(api.getSummary).mockResolvedValue({ version: 1, body: 'after reconnect' })
  await act(async () => FakeSource.all[0]!.emit('open'))
  await waitFor(() => expect(box.value).toBe('after reconnect'))
})

test('onDirtyChange reports unsaved edits', async () => {
  const onDirty = vi.fn()
  mount(1, onDirty)
  const box = await loaded()
  fireEvent.change(box, { target: { value: 'x' } })
  expect(onDirty).toHaveBeenLastCalledWith(true)
})
