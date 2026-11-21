import { expect, test } from 'vitest'
import { parseHash, routeHash } from '../../src/web/route.js'

test('parseHash', () => {
  expect(parseHash('')).toEqual({ name: 'home' })
  expect(parseHash('#/')).toEqual({ name: 'home' })
  expect(parseHash('#/nope')).toEqual({ name: 'home' })
  expect(parseHash('#/projects/abc')).toEqual({ name: 'home' })
  expect(parseHash('#/projects/3')).toEqual({ name: 'project', projectId: 3, tab: 'graph' })
  expect(parseHash('#/projects/3/summary')).toEqual({ name: 'project', projectId: 3, tab: 'summary' })
})

test('routeHash is the inverse', () => {
  expect(routeHash({ name: 'home' })).toBe('#/')
  expect(routeHash({ name: 'project', projectId: 3, tab: 'graph' })).toBe('#/projects/3')
  expect(routeHash({ name: 'project', projectId: 3, tab: 'summary' })).toBe('#/projects/3/summary')
  for (const h of ['#/', '#/projects/3', '#/projects/3/summary']) expect(routeHash(parseHash(h))).toBe(h)
})
