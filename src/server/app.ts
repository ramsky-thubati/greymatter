import { readFile } from 'node:fs/promises'
import { relative, join } from 'node:path'
import { serveStatic } from '@hono/node-server/serve-static'
import { type Context, Hono } from 'hono'
import { streamSSE } from 'hono/streaming'
import { z, ZodError } from 'zod'
import { addBlocker, removeBlocker } from '../core/blockers.js'
import { type Db, tx } from '../core/db.js'
import { DomainError } from '../core/errors.js'
import { getGraph } from '../core/graph.js'
import { parseTaskId } from '../core/ids.js'
import { moveTask, relinkBranch } from '../core/ordering.js'
import {
  createProject,
  deleteProject,
  findProjectByName,
  getProject,
  listProjects,
  setProjectStatus,
} from '../core/projects.js'
import { deleteBranch, deleteTask, moveRoot } from '../core/structure.js'
import { createCheckpoint, getLiveSummary, listSummaryVersions, updateLiveSummary } from '../core/summary.js'
import { createBranch, createTask, getTask, resumeTask, updateBranch, updateTask } from '../core/tasks.js'
import type { ProjectEvents } from './events.js'

const name = z.string().trim().min(1)
const taskRef = z.union([z.string(), z.number()])
const taskId = taskRef.transform((v) => parseTaskId(v))
const states = ['todo', 'in_progress', 'later', 'done', 'cancelled'] as const

const projectBody = z.object({ name })
const projectPatchBody = z.object({ status: z.enum(['in_progress', 'complete']) })
const branchCreateBody = z.object({ name, purpose: z.string().optional(), fromTask: taskId.optional() })
const branchPatchBody = z.object({
  name: name.optional(),
  purpose: z.string().optional(),
  color: z.string().optional(),
  rootTask: taskId.nullable().optional(),
})
const orderBody = z.object({
  order: z.array(
    z.union([
      z.object({ task: taskId }).transform((e) => ({ num: e.task })),
      z.object({ title: name }).transform((e) => ({ title: e.title })),
    ]),
  ),
})
const taskCreateBody = z.object({
  branchId: z.number().int().positive(),
  title: name,
  details: z.string().optional(),
  before: taskId.optional(),
  after: taskId.optional(),
})
const taskPatchBody = z.object({
  title: name.optional(),
  details: z.string().optional(),
  state: z.enum(states).optional(),
})
const moveBody = z.object({ before: taskId.optional(), after: taskId.optional() })
const blockerBody = z.object({ blocker: taskId })
const summaryBody = z.object({ body: z.string() })

function positiveInt(raw: string, what: string): number {
  const n = Number(raw)
  if (!/^\d+$/.test(raw) || !Number.isSafeInteger(n) || n < 1) {
    throw new DomainError('invalid', `Invalid ${what}: "${raw}"`)
  }
  return n
}

class HttpError extends Error {
  constructor(
    readonly status: 403 | 415,
    readonly code: 'forbidden' | 'invalid',
    message: string,
  ) {
    super(message)
  }
}

const LOCAL_HOSTS = ['localhost', '127.0.0.1', '[::1]']
const MUTATING = ['POST', 'PUT', 'PATCH', 'DELETE']

function hostnameOf(host: string): string | null {
  try {
    return new URL(`http://${host}`).hostname.toLowerCase()
  } catch {
    return null
  }
}

const STATUS = { invalid: 400, not_found: 404, conflict: 409 } as const

function errorBody(code: string, message: string, details?: unknown) {
  return { error: { code, message, ...(details === undefined ? {} : { details }) } }
}

async function readJson<S extends z.ZodType>(c: Context, schema: S): Promise<z.output<S>> {
  if (!(c.req.header('content-type') ?? '').toLowerCase().startsWith('application/json')) {
    throw new HttpError(415, 'invalid', 'Content-Type must be application/json')
  }
  let raw: unknown
  try {
    raw = await c.req.json()
  } catch {
    throw new DomainError('invalid', 'Request body must be valid JSON')
  }
  return schema.parse(raw)
}

export function createApp(db: Db, events: ProjectEvents, opts: { staticDir?: string; allowedHosts?: string[] } = {}): Hono {
  const app = new Hono()

  const pidOf = (c: Context) => positiveInt(c.req.param('pid') ?? '', 'project id')
  const bidOf = (c: Context) => positiveInt(c.req.param('bid') ?? '', 'branch id')
  const taskOf = (c: Context) => parseTaskId(c.req.param('task') ?? '')
  const mutated = <T>(pid: number, result: T): T => {
    events.emit(pid)
    return result
  }

  const allowedHosts = new Set([...LOCAL_HOSTS, ...(opts.allowedHosts ?? []).map((h) => h.trim().toLowerCase())])

  app.onError((err, c) => {
    if (err instanceof HttpError) return c.json(errorBody(err.code, err.message), err.status)
    if (err instanceof DomainError) {
      return c.json(errorBody(err.code, err.message, err.details), STATUS[err.code])
    }
    if (err instanceof ZodError) {
      return c.json(errorBody('invalid', 'Invalid request', err.issues), 400)
    }
    console.error(err)
    return c.json(errorBody('internal', 'Internal server error'), 500)
  })

  app.use('/api/*', async (c, next) => {
    const host = c.req.header('host') ?? new URL(c.req.url).host
    const hostname = hostnameOf(host)
    if (!hostname || !allowedHosts.has(hostname)) throw new HttpError(403, 'forbidden', 'Host not allowed')
    const origin = c.req.header('origin')
    if (origin && MUTATING.includes(c.req.method)) {
      let originHost: string | null = null
      try {
        originHost = new URL(origin).host.toLowerCase()
      } catch {}
      if (originHost !== host.toLowerCase()) throw new HttpError(403, 'forbidden', 'Cross-origin request rejected')
    }
    await next()
  })

  app.get('/api/health', (c) => c.json({ ok: true }))

  app.get('/api/projects', (c) => c.json(listProjects(db)))
  app.post('/api/projects', async (c) => {
    const { name } = await readJson(c, projectBody)
    return c.json(createProject(db, name))
  })
  app.get('/api/projects/by-name/:name', (c) => c.json(findProjectByName(db, c.req.param('name'))))
  app.patch('/api/projects/:pid', async (c) => {
    const pid = pidOf(c)
    const { status } = await readJson(c, projectPatchBody)
    return c.json(mutated(pid, setProjectStatus(db, pid, status)))
  })
  app.delete('/api/projects/:pid', (c) => {
    const pid = pidOf(c)
    deleteProject(db, pid)
    mutated(pid, null)
    return c.body(null, 204)
  })

  app.use('/api/projects/:pid/*', async (c, next) => {
    getProject(db, pidOf(c))
    await next()
  })

  app.get('/api/projects/:pid/graph', (c) => c.json(getGraph(db, pidOf(c))))

  app.post('/api/projects/:pid/branches', async (c) => {
    const pid = pidOf(c)
    const body = await readJson(c, branchCreateBody)
    const branch = createBranch(db, pid, { name: body.name, purpose: body.purpose, fromTaskNum: body.fromTask })
    return c.json(mutated(pid, branch))
  })
  app.patch('/api/projects/:pid/branches/:bid', async (c) => {
    const pid = pidOf(c)
    const bid = bidOf(c)
    const body = await readJson(c, branchPatchBody)
    const branch = tx(db, () => {
      const renamed = updateBranch(db, pid, bid, { name: body.name, purpose: body.purpose, color: body.color })
      return body.rootTask === undefined ? renamed : moveRoot(db, pid, bid, body.rootTask)
    })
    return c.json(mutated(pid, branch))
  })
  app.delete('/api/projects/:pid/branches/:bid', (c) => {
    const pid = pidOf(c)
    deleteBranch(db, pid, bidOf(c), { confirm: c.req.query('confirm') === '1' })
    mutated(pid, null)
    return c.body(null, 204)
  })
  app.put('/api/projects/:pid/branches/:bid/order', async (c) => {
    const pid = pidOf(c)
    const bid = bidOf(c)
    const { order } = await readJson(c, orderBody)
    return c.json(mutated(pid, relinkBranch(db, pid, bid, order)))
  })

  app.post('/api/projects/:pid/tasks', async (c) => {
    const pid = pidOf(c)
    const body = await readJson(c, taskCreateBody)
    return c.json(mutated(pid, createTask(db, pid, body)))
  })
  app.get('/api/projects/:pid/tasks/:task', (c) => c.json(getTask(db, pidOf(c), taskOf(c))))
  app.patch('/api/projects/:pid/tasks/:task', async (c) => {
    const pid = pidOf(c)
    const num = taskOf(c)
    const body = await readJson(c, taskPatchBody)
    return c.json(mutated(pid, updateTask(db, pid, num, body)))
  })
  app.post('/api/projects/:pid/tasks/:task/move', async (c) => {
    const pid = pidOf(c)
    const num = taskOf(c)
    const body = await readJson(c, moveBody)
    moveTask(db, pid, num, body)
    mutated(pid, null)
    return c.body(null, 204)
  })
  app.post('/api/projects/:pid/tasks/:task/resume', (c) => {
    const pid = pidOf(c)
    return c.json(mutated(pid, resumeTask(db, pid, taskOf(c))))
  })
  app.delete('/api/projects/:pid/tasks/:task', (c) => {
    const pid = pidOf(c)
    deleteTask(db, pid, taskOf(c), { confirm: c.req.query('confirm') === '1' })
    mutated(pid, null)
    return c.body(null, 204)
  })
  app.post('/api/projects/:pid/tasks/:task/blockers', async (c) => {
    const pid = pidOf(c)
    const num = taskOf(c)
    const { blocker } = await readJson(c, blockerBody)
    addBlocker(db, pid, num, blocker)
    mutated(pid, null)
    return c.body(null, 204)
  })
  app.delete('/api/projects/:pid/tasks/:task/blockers/:blocker', (c) => {
    const pid = pidOf(c)
    removeBlocker(db, pid, taskOf(c), parseTaskId(c.req.param('blocker')))
    mutated(pid, null)
    return c.body(null, 204)
  })

  app.get('/api/projects/:pid/summary', (c) => c.json(getLiveSummary(db, pidOf(c))))
  app.put('/api/projects/:pid/summary', async (c) => {
    const pid = pidOf(c)
    const { body } = await readJson(c, summaryBody)
    return c.json(mutated(pid, updateLiveSummary(db, pid, body)))
  })
  app.get('/api/projects/:pid/summary/versions', (c) => c.json(listSummaryVersions(db, pidOf(c))))
  app.post('/api/projects/:pid/checkpoints', (c) => {
    const pid = pidOf(c)
    return c.json(mutated(pid, createCheckpoint(db, pid)))
  })

  app.get('/api/projects/:pid/events', (c) => {
    const pid = pidOf(c)
    return streamSSE(c, async (stream) => {
      const unsubscribe = events.subscribe(pid, () => {
        void stream.writeSSE({ event: 'changed', data: '' }).catch(() => {})
      })
      const ping = setInterval(() => {
        void stream.write(': ping\n\n').catch(() => {})
      }, 25_000)
      const closed = new Promise<void>((resolve) => stream.onAbort(resolve))
      try {
        await closed
      } finally {
        clearInterval(ping)
        unsubscribe()
      }
    })
  })

  const staticDir = opts.staticDir
  if (staticDir) {
    app.use('*', async (c, next) => {
      if (c.req.path.startsWith('/api/')) return next()
      return serveStatic({ root: relative(process.cwd(), staticDir) || '.' })(c, next)
    })
  }

  app.notFound(async (c) => {
    const isApi = c.req.path === '/api' || c.req.path.startsWith('/api/')
    if (staticDir && !isApi && c.req.method === 'GET') {
      try {
        return c.html(await readFile(join(staticDir, 'index.html'), 'utf8'))
      } catch {
        return c.json(errorBody('not_found', 'Not found'), 404)
      }
    }
    return c.json(errorBody('not_found', 'Not found'), 404)
  })

  return app
}
