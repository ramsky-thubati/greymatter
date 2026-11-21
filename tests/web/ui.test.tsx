// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'
import { ConfirmAlert } from '../../src/web/ui/ConfirmAlert.js'
import { Dialog } from '../../src/web/ui/Dialog.js'
import { StateMenu } from '../../src/web/ui/StateMenu.js'
import { StatusDot } from '../../src/web/ui/StatusDot.js'
import { ToastProvider, useToast } from '../../src/web/ui/Toast.js'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

test('Dialog closes at once when clean', () => {
  const onClose = vi.fn()
  render(
    <Dialog title="Task" dirty={false} onClose={onClose}>
      body
    </Dialog>,
  )
  fireEvent.click(screen.getByRole('button', { name: 'Close' }))
  expect(onClose).toHaveBeenCalledTimes(1)
})

test('Dialog asks before discarding', () => {
  const onClose = vi.fn()
  render(
    <Dialog title="Task" dirty onClose={onClose}>
      <input aria-label="Title" />
    </Dialog>,
  )
  fireEvent.keyDown(screen.getByLabelText('Title'), { key: 'Escape' })
  expect(onClose).not.toHaveBeenCalled()
  expect(screen.getByRole('alertdialog', { name: 'Discard changes?' })).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: 'Keep editing' }))
  expect(screen.queryByRole('alertdialog')).toBeNull()
  expect(screen.getByRole('dialog')).toBeTruthy()
  expect(onClose).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: 'Close' }))
  fireEvent.click(screen.getByRole('button', { name: 'Discard' }))
  expect(onClose).toHaveBeenCalledTimes(1)
})

test('Enter does not submit', () => {
  const save = vi.fn()
  render(
    <Dialog title="Task" dirty onClose={() => {}} footerEnd={<button onClick={save}>Save</button>}>
      <input aria-label="Title" />
    </Dialog>,
  )
  fireEvent.keyDown(screen.getByLabelText('Title'), { key: 'Enter' })
  expect(save).not.toHaveBeenCalled()
  expect(document.querySelector('form')).toBeNull()
})

test('ConfirmAlert single button', () => {
  const onConfirm = vi.fn()
  render(<ConfirmAlert title="Can't delete yet" confirmLabel="OK" cancelLabel={null} onConfirm={onConfirm} onCancel={() => {}} />)
  const dialog = screen.getByRole('alertdialog', { name: "Can't delete yet" })
  expect(dialog.querySelectorAll('button')).toHaveLength(1)
  fireEvent.click(screen.getByRole('button', { name: 'OK' }))
  expect(onConfirm).toHaveBeenCalled()
})

test('ConfirmAlert cancel', () => {
  const onCancel = vi.fn()
  render(<ConfirmAlert title="Remove dependency?" confirmLabel="Remove" destructive onConfirm={() => {}} onCancel={onCancel} />)
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
  expect(onCancel).toHaveBeenCalled()
})

test('StatusDot', () => {
  render(<StatusDot state="in_progress" />)
  const dot = screen.getByLabelText('In progress')
  expect(dot.className).toContain('dot-in_progress')
})

test('StateMenu', () => {
  const onChange = vi.fn()
  render(<StateMenu value="todo" onChange={onChange} trigger={<button>State</button>} />)
  fireEvent.pointerDown(screen.getByRole('button', { name: 'State' }), { button: 0, ctrlKey: false })
  const items = screen.getAllByRole('menuitemradio')
  expect(items.map((i) => i.textContent?.trim())).toEqual(['To do', 'In progress', 'Later', 'Done', 'Cancelled'])
  expect(items[0].getAttribute('aria-checked')).toBe('true')
  fireEvent.click(screen.getByRole('menuitemradio', { name: /Later/ }))
  expect(onChange).toHaveBeenCalledWith('later')
})

function Boom({ retry }: { retry?: () => void }) {
  const toast = useToast()
  return <button onClick={() => toast.error('Boom', retry)}>go</button>
}

test('Toast shows an error with retry', () => {
  const retry = vi.fn()
  render(
    <ToastProvider>
      <Boom retry={retry} />
    </ToastProvider>,
  )
  fireEvent.click(screen.getByRole('button', { name: 'go' }))
  expect(screen.getByText('Boom')).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
  expect(retry).toHaveBeenCalled()
})
