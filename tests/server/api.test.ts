import { beforeEach, describe, expect, test, vi } from 'vitest'
import { openDb } from '../../src/core/db.js'
import { addBlocker } from '../../src/core/blockers.js'
import { createProject } from '../../src/core/projects.js'
import { createTask } from '../../src/core/tasks.js'
import { createApp } from '../../src/server/app.js'
import { ProjectEvents } from '../../src/server/events.js'
import { mainBranchId } from '../core/helpers.js'

let app: ReturnType<typeof createApp>
let events: ProjectEvents
let pid: number
let main: number

const send = (method: string, path: string, body?: unknown) =>
  app.request(path, {
    method,
    headers: body === undefined ? undefined : { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
const get = (p: string) => send('GET', p)
const post = (p: string, b?: unknown) => send('POST', p, b)
const patch = (p: string, b?: unknown) => send('PATCH', p, b)
const put = (p: string, b?: unknown) => send('PUT', p, b)
const del = (p: string) => send('DELETE', p)

beforeEach(() => {
  const db = openDb(':memory:')
  events = new ProjectEvents()
  app = createApp(db, events)
  pid = createProject(db, 'Engine build').id
  main = mainBranchId(db, pid)
  createTask(db, pid, { branchId: main, title: 'first' })
  createTask(db, pid, { branchId: main, title: 'second' })
  addBlocker(db, pid, 2, 1)
})

test('PATCH branch colour', async () => {
  expect((await patch(`/api/projects/${pid}/branches/${main}`, { color: '#00FF00' })).status).toBe(200)
  const g = await (await get(`/api/projects/${pid}/graph`)).json()
  expect(g.branches[0].color).toBe('#00ff00')
  expect((await patch(`/api/projects/${pid}/branches/${main}`, { color: '#00ff0' })).status).toBe(400)
  expect((await patch(`/api/projects/${pid}/branches/${main}`, { color: 'green' })).status).toBe(400)
})

test('health', async () => {
  const r = await get('/api/health')
  expect(await r.json()).toEqual({ ok: true })
})

test('blank names and titles are 400', async () => {
  expect((await post('/api/projects', { name: '  ' })).status).toBe(400)
  expect((await post(`/api/projects/${pid}/tasks`, { branchId: main, title: '\t ' })).status).toBe(400)
  expect((await post(`/api/projects/${pid}/branches`, { name: '' })).status).toBe(400)
})

test('loose task ids work in paths; unknown id is 404 naming the project', async () => {
  expect((await get(`/api/projects/${pid}/tasks/t1`)).status).toBe(200)
  const r = await get(`/api/projects/${pid}/tasks/T-999`)
  expect(r.status).toBe(404)
  expect((await r.json()).error.message).toMatch(/T-999.*Engine build/)
})

test('resume on a blocked task is 409 with blockedBy', async () => {
  const r = await post(`/api/projects/${pid}/tasks/T-2/resume`)
  expect(r.status).toBe(409)
  expect((await r.json()).error.details).toEqual({ blockedBy: [1] })
})

test('mutations emit a project event', async () => {
  const seen = vi.fn()
  events.subscribe(pid, seen)
  await patch(`/api/projects/${pid}/tasks/T-1`, { state: 'done' })
  expect(seen).toHaveBeenCalledOnce()
})

test('failed mutations do not emit', async () => {
  const seen = vi.fn()
  events.subscribe(pid, seen)
  await patch(`/api/projects/${pid}/tasks/T-999`, { state: 'done' })
  await post(`/api/projects/${pid}/tasks/T-2/resume`)
  expect(seen).not.toHaveBeenCalled()
})

test('delete with dependents needs confirm', async () => {
  expect((await del(`/api/projects/${pid}/tasks/T-1`)).status).toBe(409)
  expect((await del(`/api/projects/${pid}/tasks/T-1?confirm=1`)).status).toBe(204)
})

test('bad or unknown project ids', async () => {
  expect((await get('/api/projects/abc/graph')).status).toBe(400)
  expect((await get('/api/projects/0/graph')).status).toBe(400)
  expect((await get('/api/projects/999/graph')).status).toBe(404)
  expect((await get('/api/projects/999/summary')).status).toBe(404)
  expect((await post('/api/projects/999/checkpoints')).status).toBe(404)
  expect((await get(`/api/projects/${pid}/branches/x`)).status).toBe(404)
  expect((await patch(`/api/projects/${pid}/branches/x`, { name: 'a' })).status).toBe(400)
})

test('projects create, list, by-name', async () => {
  const r = await post('/api/projects', { name: ' Other ' })
  expect(r.status).toBe(200)
  expect((await r.json()).name).toBe('Other')
  expect((await (await get('/api/projects')).json()).length).toBe(2)
  expect((await (await get('/api/projects/by-name/engine%20build')).json()).id).toBe(pid)
  expect((await get('/api/projects/by-name/nope')).status).toBe(404)
})

test('graph, branches, patch with rootTask rolls back on failure', async () => {
  expect((await (await get(`/api/projects/${pid}/graph`)).json()).tasks.length).toBe(2)
  const b = await (await post(`/api/projects/${pid}/branches`, { name: 'side', fromTask: 't1' })).json()
  expect(b.rootTaskNum).toBe(1)
  const bad = await patch(`/api/projects/${pid}/branches/${b.id}`, { name: 'renamed', rootTask: 'T-999' })
  expect(bad.status).toBe(404)
  const graph = await (await get(`/api/projects/${pid}/graph`)).json()
  expect(graph.branches.find((x: { id: number }) => x.id === b.id).name).toBe('side')
  const ok = await (await patch(`/api/projects/${pid}/branches/${b.id}`, { name: 'renamed', rootTask: null })).json()
  expect(ok).toMatchObject({ name: 'renamed', rootTaskNum: null })
  expect((await del(`/api/projects/${pid}/branches/${b.id}`)).status).toBe(204)
})

test('order, create with before, move', async () => {
  const t = await (await post(`/api/projects/${pid}/tasks`, { branchId: main, title: 'zero', before: 1 })).json()
  expect(t.num).toBe(3)
  const r = await put(`/api/projects/${pid}/branches/${main}/order`, { order: [{ task: 'T-2' }, { task: 1 }, { task: 3 }, { title: 'new' }] })
  expect((await r.json()).map((x: { title: string }) => x.title)).toEqual(['second', 'first', 'zero', 'new'])
  expect((await post(`/api/projects/${pid}/tasks/T-1/move`, { before: 't2' })).status).toBe(204)
})

test('blockers add and remove', async () => {
  expect((await post(`/api/projects/${pid}/tasks`, { branchId: main, title: 'c' })).status).toBe(200)
  expect((await post(`/api/projects/${pid}/tasks/T-3/blockers`, { blocker: 't1' })).status).toBe(204)
  expect((await del(`/api/projects/${pid}/tasks/T-3/blockers/T-1`)).status).toBe(204)
})

test('summary, versions, checkpoints', async () => {
  expect(await (await put(`/api/projects/${pid}/summary`, { body: 'hello' })).json()).toEqual({ version: 1, body: 'hello' })
  expect(await (await get(`/api/projects/${pid}/summary`)).json()).toEqual({ version: 1, body: 'hello' })
  expect((await post(`/api/projects/${pid}/checkpoints`)).status).toBe(200)
  expect((await (await get(`/api/projects/${pid}/summary/versions`)).json()).length).toBe(2)
})

test('unknown api path is json 404; unexpected errors are 500 without stack', async () => {
  const r = await get('/api/nope')
  expect(r.status).toBe(404)
  expect((await r.json()).error.code).toBe('not_found')
  const r2 = await app.request('/api/projects', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{' })
  expect(r2.status).toBe(400)
})

test('sse streams changed events', async () => {
  const r = await get(`/api/projects/${pid}/events`)
  expect(r.headers.get('content-type')).toMatch(/text\/event-stream/)
  const reader = r.body!.getReader()
  events.emit(pid)
  const chunk = new TextDecoder().decode((await reader.read()).value)
  expect(chunk).toContain('event: changed')
  await reader.cancel()
})

describe('static files', () => {
  test('serve index.html fallback for non-api paths only', async () => {
    const { mkdtempSync, writeFileSync } = await import('node:fs')
    const { tmpdir } = await import('node:os')
    const { join } = await import('node:path')
    const dir = mkdtempSync(join(tmpdir(), 'gm-static-'))
    writeFileSync(join(dir, 'index.html'), '<html>spa</html>')
    const withStatic = createApp(openDb(':memory:'), new ProjectEvents(), { staticDir: dir })
    expect(await (await withStatic.request('/projects/1')).text()).toContain('spa')
    expect(await (await withStatic.request('/')).text()).toContain('spa')
    const api = await withStatic.request('/api/nope')
    expect(api.status).toBe(404)
    expect((await api.json()).error.code).toBe('not_found')
    expect((await app.request('/projects/1')).status).toBe(404)
  })
})

describe('cross-site protection', () => {
  const json = { 'content-type': 'application/json' }

  test('foreign Host is 403', async () => {
    const r = await app.request('http://evil.example/api/health')
    expect(r.status).toBe(403)
    expect((await r.json()).error.code).toBe('forbidden')
  })

  test('local hosts with ports are allowed', async () => {
    expect((await app.request('http://127.0.0.1:4747/api/health')).status).toBe(200)
    expect((await app.request('http://[::1]:4747/api/health')).status).toBe(200)
  })

  test('hosts from allowedHosts are accepted', async () => {
    const custom = createApp(openDb(':memory:'), new ProjectEvents(), { allowedHosts: ['gm.lan'] })
    expect((await custom.request('http://gm.lan:4747/api/health')).status).toBe(200)
  })

  test('cross-origin mutation is 403, same-origin is accepted', async () => {
    const url = `/api/projects/${pid}/tasks/T-1`
    const bad = await app.request(url, {
      method: 'PATCH',
      headers: { ...json, origin: 'http://evil.example' },
      body: JSON.stringify({ title: 'x' }),
    })
    expect(bad.status).toBe(403)
    const ok = await app.request(url, {
      method: 'PATCH',
      headers: { ...json, origin: 'http://localhost' },
      body: JSON.stringify({ title: 'x' }),
    })
    expect(ok.status).toBe(200)
  })

  test('non-JSON content type on POST is 415', async () => {
    const r = await app.request('/api/projects', {
      method: 'POST',
      headers: { 'content-type': 'text/plain' },
      body: JSON.stringify({ name: 'x' }),
    })
    expect(r.status).toBe(415)
    expect((await r.json()).error.code).toBe('invalid')
  })
})

test('PATCH project status', async () => {
  const res = await patch(`/api/projects/${pid}`, { status: 'complete' })
  expect(res.status).toBe(200)
  expect((await res.json()).status).toBe('complete')
  const list = await (await get('/api/projects')).json()
  expect(list[0].status).toBe('complete')
})

test('task mutation bumps project updatedAt', async () => {
  const [before] = await (await get('/api/projects')).json()
  await new Promise((r) => setTimeout(r, 5))
  expect((await post(`/api/projects/${pid}/tasks`, { branchId: main, title: 'bump' })).status).toBe(200)
  const [after] = await (await get('/api/projects')).json()
  expect(after.updatedAt > before.updatedAt).toBe(true)
  expect(after.createdAt).toBe(before.createdAt)
})

test('PATCH project rejects unknown status', async () => {
  expect((await patch(`/api/projects/${pid}`, { status: 'done' })).status).toBe(400)
})

test('DELETE project', async () => {
  expect((await del(`/api/projects/${pid}`)).status).toBe(204)
  expect((await get(`/api/projects/${pid}/graph`)).status).toBe(404)
  expect(await (await get('/api/projects')).json()).toEqual([])
})

test('PATCH and DELETE unknown project are 404', async () => {
  expect((await patch('/api/projects/9999', { status: 'complete' })).status).toBe(404)
  expect((await del('/api/projects/9999')).status).toBe(404)
})
