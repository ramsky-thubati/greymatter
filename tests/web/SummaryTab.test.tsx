// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { api } from '../../src/web/api.js'
import { SummaryTab } from '../../src/web/SummaryTab.js'

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

beforeEach(() => {
  FakeSource.all = []
  vi.stubGlobal('EventSource', FakeSource)
  vi.spyOn(api, 'getSummary').mockResolvedValue({ version: 1, body: md })
  vi.spyOn(api, 'listSummaryVersions').mockResolvedValue([{ version: 1, body: md, frozenAt: null }])
})
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

const textarea = () => screen.findByRole('textbox') as Promise<HTMLTextAreaElement>

test('copy puts the exact live body on the clipboard', async () => {
  const writeText = vi.fn().mockResolvedValue(undefined)
  vi.stubGlobal('navigator', { clipboard: { writeText } })
  render(<SummaryTab projectId={1} />)
  const box = await textarea()
  await waitFor(() => expect(box.value).toBe(md))
  fireEvent.click(screen.getByRole('button', { name: 'Copy' }))
  expect(writeText).toHaveBeenCalledWith(md)
})

test('unsaved edits are not overwritten by a live update', async () => {
  render(<SummaryTab projectId={1} />)
  const box = await textarea()
  await waitFor(() => expect(box.value).toBe(md))
  fireEvent.change(box, { target: { value: 'my edit' } })
  vi.mocked(api.getSummary).mockResolvedValue({ version: 1, body: 'from claude' })
  await act(async () => FakeSource.all[0]!.emit('changed'))
  expect(box.value).toBe('my edit')
  expect(await screen.findByText('Claude updated the summary. Reload to see it.')).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: 'Reload' }))
  await waitFor(() => expect(box.value).toBe('from claude'))
  expect(screen.queryByText('Claude updated the summary. Reload to see it.')).toBeNull()
})

test('a live update with no edits just reloads', async () => {
  render(<SummaryTab projectId={1} />)
  const box = await textarea()
  await waitFor(() => expect(box.value).toBe(md))
  vi.mocked(api.getSummary).mockResolvedValue({ version: 1, body: 'from claude' })
  await act(async () => FakeSource.all[0]!.emit('changed'))
  await waitFor(() => expect(box.value).toBe('from claude'))
  expect(screen.queryByText('Claude updated the summary. Reload to see it.')).toBeNull()
})

test('checkpoint asks first and then calls createCheckpoint', async () => {
  const confirm = vi.fn().mockReturnValue(true)
  vi.stubGlobal('confirm', confirm)
  const create = vi.spyOn(api, 'createCheckpoint').mockResolvedValue({})
  render(<SummaryTab projectId={1} />)
  await waitFor(() => expect((screen.getByRole('textbox') as HTMLTextAreaElement).value).toBe(md))
  fireEvent.click(screen.getByRole('button', { name: 'Checkpoint' }))
  expect(confirm).toHaveBeenCalledWith('Freeze v1 and start v2 as a copy?')
  await waitFor(() => expect(create).toHaveBeenCalledWith(1))
  await waitFor(() => expect(api.getSummary).toHaveBeenCalledTimes(2))
})

test('cancelling the checkpoint confirm does not call createCheckpoint', async () => {
  vi.stubGlobal('confirm', vi.fn().mockReturnValue(false))
  const create = vi.spyOn(api, 'createCheckpoint').mockResolvedValue({})
  render(<SummaryTab projectId={1} />)
  await waitFor(() => expect((screen.getByRole('textbox') as HTMLTextAreaElement).value).toBe(md))
  fireEvent.click(screen.getByRole('button', { name: 'Checkpoint' }))
  expect(create).not.toHaveBeenCalled()
})

test('older versions render newest first and exclude the live one', async () => {
  const writeText = vi.fn().mockResolvedValue(undefined)
  vi.stubGlobal('navigator', { clipboard: { writeText } })
  vi.mocked(api.getSummary).mockResolvedValue({ version: 3, body: 'live' })
  vi.mocked(api.listSummaryVersions).mockResolvedValue([
    { version: 3, body: 'live', frozenAt: null },
    { version: 2, body: 'second', frozenAt: '2026-01-02' },
    { version: 1, body: 'first', frozenAt: '2026-01-01' },
  ])
  render(<SummaryTab projectId={1} />)
  const items = await screen.findAllByRole('listitem')
  expect(items).toHaveLength(2)
  expect(items[0]!.textContent).toContain('v2')
  expect(items[0]!.textContent).toContain('second')
  expect(items[1]!.textContent).toContain('v1')
  expect(screen.queryByText('v3')).toBeNull()
  fireEvent.click(within(items[1]!).getByRole('button', { name: 'Copy' }))
  expect(writeText).toHaveBeenCalledWith('first')
})

test('save sends the text, and a failed save shows an alert and keeps the text', async () => {
  const update = vi.spyOn(api, 'updateSummary').mockRejectedValueOnce(new Error('boom'))
  render(<SummaryTab projectId={1} />)
  const box = await textarea()
  await waitFor(() => expect(box.value).toBe(md))
  const save = screen.getByRole('button', { name: 'Save' }) as HTMLButtonElement
  expect(save.disabled).toBe(true)
  fireEvent.change(box, { target: { value: 'new' } })
  expect(save.disabled).toBe(false)
  fireEvent.click(save)
  expect((await screen.findByRole('alert')).textContent).toContain('boom')
  expect(box.value).toBe('new')
  update.mockResolvedValueOnce(undefined as never)
  fireEvent.click(save)
  await waitFor(() => expect(save.disabled).toBe(true))
  expect(update).toHaveBeenLastCalledWith(1, 'new')
  expect(screen.queryByRole('alert')).toBeNull()
})

test('switching project reloads and closes the old stream', async () => {
  const { rerender } = render(<SummaryTab projectId={1} />)
  await textarea()
  rerender(<SummaryTab projectId={2} />)
  await waitFor(() => expect(api.getSummary).toHaveBeenCalledWith(2))
  expect(FakeSource.all[0]!.closed).toBe(true)
  expect(FakeSource.all[1]!.url).toBe('/api/projects/2/events')
})

test('checkpoint is disabled while there are unsaved edits and re-enabled after save', async () => {
  vi.spyOn(api, 'updateSummary').mockResolvedValue(undefined as never)
  render(<SummaryTab projectId={1} />)
  const box = await textarea()
  await waitFor(() => expect(box.value).toBe(md))
  const cp = screen.getByRole('button', { name: 'Checkpoint' }) as HTMLButtonElement
  expect(cp.disabled).toBe(false)
  fireEvent.change(box, { target: { value: 'typed' } })
  expect(cp.disabled).toBe(true)
  expect(cp.title).toBe('Save or reload first')
  fireEvent.click(screen.getByRole('button', { name: 'Save' }))
  await waitFor(() => expect(cp.disabled).toBe(false))
})

test('text typed while a background reload is in flight is kept and the notice shows', async () => {
  render(<SummaryTab projectId={1} />)
  const box = await textarea()
  await waitFor(() => expect(box.value).toBe(md))
  let resolve!: (v: { version: number; body: string }) => void
  vi.mocked(api.getSummary).mockReturnValue(new Promise((r) => (resolve = r)))
  await act(async () => FakeSource.all[0]!.emit('changed'))
  fireEvent.change(box, { target: { value: 'typed meanwhile' } })
  await act(async () => resolve({ version: 1, body: 'from claude' }))
  expect(box.value).toBe('typed meanwhile')
  expect(await screen.findByText('Claude updated the summary. Reload to see it.')).toBeTruthy()
})

test('a failed load makes the editor read-only, disables actions, and Retry recovers', async () => {
  vi.mocked(api.getSummary).mockRejectedValueOnce(new Error('offline'))
  render(<SummaryTab projectId={1} />)
  const box = await textarea()
  expect((await screen.findByRole('alert')).textContent).toContain('offline')
  expect(box.readOnly).toBe(true)
  for (const name of ['Save', 'Checkpoint', 'Copy']) {
    expect((screen.getByRole('button', { name }) as HTMLButtonElement).disabled).toBe(true)
  }
  fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
  await waitFor(() => expect(box.value).toBe(md))
  expect(box.readOnly).toBe(false)
  expect(screen.queryByRole('alert')).toBeNull()
  expect(screen.queryByRole('button', { name: 'Retry' })).toBeNull()
})

test('an event stream reconnect reloads, but the first open does not', async () => {
  render(<SummaryTab projectId={1} />)
  const box = await textarea()
  await waitFor(() => expect(box.value).toBe(md))
  const calls = vi.mocked(api.getSummary).mock.calls.length
  await act(async () => FakeSource.all[0]!.emit('open'))
  expect(api.getSummary).toHaveBeenCalledTimes(calls)
  vi.mocked(api.getSummary).mockResolvedValue({ version: 1, body: 'after reconnect' })
  await act(async () => FakeSource.all[0]!.emit('open'))
  await waitFor(() => expect(box.value).toBe('after reconnect'))
})

test('a changed event whose summary body is unchanged shows no notice', async () => {
  render(<SummaryTab projectId={1} />)
  const box = await textarea()
  await waitFor(() => expect(box.value).toBe(md))
  fireEvent.change(box, { target: { value: 'my edit' } })
  const calls = vi.mocked(api.listSummaryVersions).mock.calls.length
  await act(async () => FakeSource.all[0]!.emit('changed'))
  await waitFor(() => expect(api.listSummaryVersions).toHaveBeenCalledTimes(calls + 1))
  expect(box.value).toBe('my edit')
  expect(screen.queryByText('Claude updated the summary. Reload to see it.')).toBeNull()
})

test('save while stale asks first; cancel does not save, confirm saves and clears the notice', async () => {
  const confirm = vi.fn().mockReturnValue(false)
  vi.stubGlobal('confirm', confirm)
  const update = vi.spyOn(api, 'updateSummary').mockResolvedValue(undefined as never)
  render(<SummaryTab projectId={1} />)
  const box = await textarea()
  await waitFor(() => expect(box.value).toBe(md))
  fireEvent.change(box, { target: { value: 'my edit' } })
  vi.mocked(api.getSummary).mockResolvedValue({ version: 1, body: 'from claude' })
  await act(async () => FakeSource.all[0]!.emit('changed'))
  await screen.findByText('Claude updated the summary. Reload to see it.')
  fireEvent.click(screen.getByRole('button', { name: 'Save' }))
  expect(confirm).toHaveBeenCalledWith('Claude changed the summary since you started editing. Overwrite?')
  expect(update).not.toHaveBeenCalled()
  confirm.mockReturnValue(true)
  fireEvent.click(screen.getByRole('button', { name: 'Save' }))
  await waitFor(() => expect(update).toHaveBeenCalledWith(1, 'my edit'))
  await waitFor(() => expect(screen.queryByText('Claude updated the summary. Reload to see it.')).toBeNull())
})

test('onDirtyChange reports unsaved edits', async () => {
  const onDirty = vi.fn()
  render(<SummaryTab projectId={1} onDirtyChange={onDirty} />)
  const box = await textarea()
  await waitFor(() => expect(box.value).toBe(md))
  fireEvent.change(box, { target: { value: 'x' } })
  expect(onDirty).toHaveBeenLastCalledWith(true)
})
