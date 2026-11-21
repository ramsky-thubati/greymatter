import { useCallback, useEffect, useState } from 'react'
import type { Graph } from '../core/graph.js'
import { api } from './api.js'

export function useGraph(projectId: number | null): { graph: Graph | null; reload(): void } {
  const [graph, setGraph] = useState<Graph | null>(null)

  const reload = useCallback(() => {
    if (projectId === null) return
    api
      .getGraph(projectId)
      .then(setGraph)
      .catch(() => {})
  }, [projectId])

  useEffect(() => {
    setGraph(null)
    if (projectId === null) return
    let live = true
    const load = () => {
      api
        .getGraph(projectId)
        .then((g) => live && setGraph(g))
        .catch(() => {})
    }
    load()
    const source = new EventSource(`/api/projects/${projectId}/events`)
    let opened = false
    source.addEventListener('changed', load)
    source.addEventListener('open', () => {
      if (opened) load()
      opened = true
    })
    return () => {
      live = false
      source.close()
    }
  }, [projectId])

  return { graph, reload }
}
