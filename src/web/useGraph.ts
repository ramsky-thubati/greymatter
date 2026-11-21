import { useCallback, useEffect, useRef, useState } from 'react'
import type { Graph } from '../core/graph.js'
import { api } from './api.js'
import { errorText } from './errors.js'
import { useToast } from './ui/Toast.js'

export function useGraph(projectId: number | null): { graph: Graph | null; reload(): void } {
  const [graph, setGraph] = useState<Graph | null>(null)
  const latest = useRef(0)
  const loaded = useRef(false)
  const toast = useToast()

  const load = useCallback(() => {
    if (projectId === null) return
    const ticket = ++latest.current
    api
      .getGraph(projectId)
      .then((g) => {
        if (ticket !== latest.current) return
        loaded.current = true
        setGraph(g)
      })
      .catch((e) => {
        if (ticket === latest.current && !loaded.current) toast.error(errorText(e), load)
      })
  }, [projectId, toast])

  useEffect(() => {
    latest.current++
    loaded.current = false
    setGraph(null)
    if (projectId === null) return
    load()
    const source = new EventSource(`/api/projects/${projectId}/events`)
    let opened = false
    source.addEventListener('changed', load)
    source.addEventListener('open', () => {
      if (opened) load()
      opened = true
    })
    return () => {
      latest.current++
      source.close()
    }
  }, [projectId, load])

  return { graph, reload: load }
}
