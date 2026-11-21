// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import type { Graph } from '../../src/core/graph.js'
import { api } from '../../src/web/api.js'
import { useGraph } from '../../src/web/useGraph.js'

class FakeSource {
  static all: FakeSource[] = []
  closed = false
  constructor(readonly url: string) {
    FakeSource.all.push(this)
  }
  addEventListener() {}
  close() {
    this.closed = true
  }
}

const g = (id: number) => ({ project: { id, name: `p${id}` }, branches: [], tasks: [], checkpoints: [], liveVersion: 1 }) as Graph

beforeEach(() => {
  FakeSource.all = []
  vi.stubGlobal('EventSource', FakeSource)
})
afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

test('a reload pending across a project switch never sets the old graph', async () => {
  const pending: Record<number, (v: Graph) => void> = {}
  const calls: number[] = []
  vi.spyOn(api, 'getGraph').mockImplementation(
    (id) =>
      new Promise<Graph>((resolve) => {
        calls.push(id)
        pending[calls.length] = resolve
      }),
  )
  const { result, rerender } = renderHook(({ id }) => useGraph(id), { initialProps: { id: 1 as number | null } })
  await act(async () => pending[1]!(g(1)))
  expect(result.current.graph?.project.id).toBe(1)

  act(() => result.current.reload())
  rerender({ id: 2 })
  await act(async () => pending[3]!(g(2)))
  await act(async () => pending[2]!(g(1)))
  expect(result.current.graph?.project.id).toBe(2)
  expect(FakeSource.all[0]!.closed).toBe(true)
})

test('out-of-order responses do not overwrite a newer one', async () => {
  const pending: ((v: Graph) => void)[] = []
  vi.spyOn(api, 'getGraph').mockImplementation(() => new Promise<Graph>((r) => pending.push(r)))
  const { result } = renderHook(() => useGraph(1))
  act(() => result.current.reload())
  const newer = { ...g(1), liveVersion: 9 }
  await act(async () => pending[1]!(newer))
  await act(async () => pending[0]!(g(1)))
  expect(result.current.graph?.liveVersion).toBe(9)
})
