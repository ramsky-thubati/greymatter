import { useCallback, useEffect, useRef, useState } from 'react'

export type Route = { name: 'home' } | { name: 'project'; projectId: number; tab: 'graph' | 'summary' }

export function parseHash(hash: string): Route {
  const m = /^#\/projects\/(\d+)(\/summary)?$/.exec(hash)
  if (!m) return { name: 'home' }
  return { name: 'project', projectId: Number(m[1]), tab: m[2] ? 'summary' : 'graph' }
}

export function routeHash(r: Route): string {
  if (r.name === 'home') return '#/'
  return `#/projects/${r.projectId}${r.tab === 'summary' ? '/summary' : ''}`
}

export function useRoute(canLeave: (from: Route, to: Route) => boolean): [Route, (r: Route) => void] {
  const [route, setRoute] = useState(() => parseHash(window.location.hash))
  const current = useRef(route)
  current.current = route
  const guard = useRef(canLeave)
  guard.current = canLeave

  useEffect(() => {
    const onHash = () => {
      const next = parseHash(window.location.hash)
      if (routeHash(next) === routeHash(current.current)) return
      if (!guard.current(current.current, next)) {
        window.history.replaceState(null, '', routeHash(current.current))
        return
      }
      current.current = next
      setRoute(next)
    }
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  const navigate = useCallback((r: Route) => {
    if (routeHash(r) === routeHash(current.current)) return
    if (!guard.current(current.current, r)) return
    current.current = r
    setRoute(r)
    window.location.hash = routeHash(r)
  }, [])

  return [route, navigate]
}
