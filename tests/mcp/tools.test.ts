import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { beforeEach, describe, expect, test } from 'vitest'
import { addBlocker } from '../../src/core/blockers.js'
import { type Db, openDb } from '../../src/core/db.js'
import { createBranch, createTask, updateTask } from '../../src/core/tasks.js'
import { createProject } from '../../src/core/projects.js'
import { createCheckpoint, updateLiveSummary } from '../../src/core/summary.js'
import { createApiClient } from '../../src/mcp/api-client.js'
import { INSTRUCTIONS } from '../../src/mcp/instructions.js'
import { registerTools } from '../../src/mcp/tools.js'
import { createApp } from '../../src/server/app.js'
import { ProjectEvents } from '../../src/server/events.js'
import { mainBranchId } from '../core/helpers.js'

let client: Client
let db: Db
let pid: number

const text = (r: unknown) => (r as { content: { text: string }[] }).content.map((c) => c.text).join('\n')
const call = async (name: string, args: Record<string, unknown>) =>
  (await client.callTool({ name, arguments: args })) as { isError?: boolean; content: { text: string }[] }

beforeEach(async () => {
  db = openDb(':memory:')
  const app = createApp(db, new ProjectEvents())
  pid = createProject(db, 'Engine build').id
  const main = mainBranchId(db, pid)
  createTask(db, pid, { branchId: main, title: 'first' })
  createTask(db, pid, { branchId: main, title: 'second' })
  addBlocker(db, pid, 2, 1)

  const server = new McpServer({ name: 'greymatter', version: '0' }, { instructions: INSTRUCTIONS })
  registerTools(server, createApiClient('http://localhost', (url, init) => app.request(url as string, init)))
  const [a, b] = InMemoryTransport.createLinkedPair()
  client = new Client({ name: 'test', version: '0' })
  await Promise.all([server.connect(a), client.connect(b)])
})

test('resume_task returns details and summary', async () => {
  const r = await call('resume_task', { project: 'engine build', task: 't-1' })
  expect(r.isError).toBeFalsy()
  expect(text(r)).toContain('T-1')
  expect(text(r)).toContain('Summary')
})

test('resume_task on blocked task says what it waits on', async () => {
  const r = await call('resume_task', { project: 'Engine build', task: 'T-2' })
  expect(r.isError).toBe(true)
  expect(text(r)).toMatch(/blocked by T-1/)
})

test('server down gives a readable message', async () => {
  const api = createApiClient('http://127.0.0.1:4747', () => Promise.reject(new TypeError('fetch failed')))
  await expect(api.listProjects()).rejects.toThrow(
    "Greymatter isn't running at http://127.0.0.1:4747. Start it with `docker compose up -d`.",
  )
})

test('instructions forbid unasked checkpoints and need a yes for branches', () => {
  expect(INSTRUCTIONS).toMatch(/Never call `create_checkpoint` unless/)
  expect(INSTRUCTIONS).toMatch(/only after the user says yes/)
})

describe('branch resolution', () => {
  test('matches by name case-insensitively and by id', async () => {
    const r = await call('create_task', { project: 'Engine build', branch: '  MAIN ', title: 'third' })
    expect(text(r)).toBe('Created T-3 "third" on branch main')
    const byId = await call('create_task', { project: 'Engine build', branch: String(mainBranchId(db, pid)), title: 'fourth' })
    expect(text(byId)).toBe('Created T-4 "fourth" on branch main')
  })

  test('duplicate names list ids', async () => {
    createBranch(db, pid, { name: 'Side' })
    createBranch(db, pid, { name: 'side' })
    const r = await call('create_task', { project: 'Engine build', branch: 'SIDE', title: 'x' })
    expect(r.isError).toBe(true)
    expect(text(r)).toMatch(/Multiple branches/)
    expect(text(r)).toMatch(/ids \d+, \d+/)
  })

  test('unknown branch names branch and project', async () => {
    const r = await call('create_task', { project: 'Engine build', branch: 'nope', title: 'x' })
    expect(r.isError).toBe(true)
    expect(text(r)).toContain('nope')
    expect(text(r)).toContain('Engine build')
  })
})

describe('delete refusals', () => {
  test('delete_task with dependents names waiting tasks and asks for confirm', async () => {
    const r = await call('delete_task', { project: 'Engine build', task: 'T-1' })
    expect(r.isError).toBe(true)
    expect(text(r)).toContain('T-2')
    expect(text(r)).toContain('confirm: true')
    expect(text(r)).toMatch(/user agrees/)
    const ok = await call('delete_task', { project: 'Engine build', task: 'T-1', confirm: true })
    expect(ok.isError).toBeFalsy()
    expect(text(ok)).toBe('Deleted T-1')
  })

  test('delete_branch with forked branches names them', async () => {
    createBranch(db, pid, { name: 'Spin', fromTaskNum: 1 })
    const r = await call('delete_branch', { project: 'Engine build', branch: 'main' })
    expect(r.isError).toBe(true)
    expect(text(r)).toContain('Spin')
  })
})

describe('update_branch root_task', () => {
  test('moves root, clears with null, omitted leaves alone', async () => {
    const b = createBranch(db, pid, { name: 'Side' })
    const moved = await call('update_branch', { project: 'Engine build', branch: 'Side', root_task: 'T-1' })
    expect(moved.isError).toBeFalsy()
    const g1 = await call('get_graph', { project: 'Engine build' })
    expect(text(g1)).toMatch(/Side.*from T-1/)
    await call('update_branch', { project: 'Engine build', branch: 'Side', purpose: 'p' })
    expect(text(await call('get_graph', { project: 'Engine build' }))).toMatch(/Side.*from T-1/)
    await call('update_branch', { project: 'Engine build', branch: String(b.id), root_task: null })
    expect(text(await call('get_graph', { project: 'Engine build' }))).toMatch(/Side.*top-level/)
  })
})

test('get_graph lists branches and tasks', async () => {
  const r = await call('get_graph', { project: 'Engine build' })
  expect(text(r)).toContain('T-1 [todo] first')
  expect(text(r)).toContain('T-2 [todo] second (blocked by T-1)')
})

test('resume_task success text shape', async () => {
  const r = await call('resume_task', { project: 'Engine build', task: 'T-1' })
  expect(text(r)).toMatch(/T-1.*first[\s\S]*in_progress[\s\S]*Summary/)
})

test('mutations confirm in one line', async () => {
  const r = await call('update_task', { project: 'Engine build', task: 'T-1', state: 'done' })
  expect(text(r)).toBe('T-1 → done')
})

test('get_graph shows only open blockers', async () => {
  createTask(db, pid, { branchId: mainBranchId(db, pid), title: 'third' })
  addBlocker(db, pid, 3, 1)
  addBlocker(db, pid, 3, 2)
  updateTask(db, pid, 1, { state: 'done' })
  const out = text(await call('get_graph', { project: 'Engine build' }))
  expect(out).toContain('T-3 [todo] third (blocked by T-2)')
  expect(out).not.toMatch(/blocked by T-1/)
  expect(out).not.toMatch(/T-2 \[todo\] second \(blocked/)
})

test('get_graph hides a cancelled blocker', async () => {
  updateTask(db, pid, 1, { state: 'cancelled' })
  const out = text(await call('get_graph', { project: 'Engine build' }))
  expect(out).toContain('T-2 [todo] second (flagged)')
  expect(out).not.toContain('blocked by')
})

describe('summary versions', () => {
  beforeEach(() => {
    updateLiveSummary(db, pid, 'first body')
    createCheckpoint(db, pid)
    updateLiveSummary(db, pid, 'second body')
  })

  test('list_summary_versions marks live and shows frozen dates', async () => {
    const out = text(await call('list_summary_versions', { project: 'Engine build' }))
    expect(out).toMatch(/^v2 \(live\)$/m)
    expect(out).toMatch(/^v1 \(frozen \d{4}-\d{2}-\d{2}/m)
  })

  test('get_summary_version returns the body, unknown version is an error', async () => {
    expect(text(await call('get_summary_version', { project: 'Engine build', version: 1 }))).toBe('first body')
    const r = await call('get_summary_version', { project: 'Engine build', version: 9 })
    expect(r.isError).toBe(true)
    expect(text(r)).toBe('Summary v9 not found')
  })

  test('instructions mention both tools', () => {
    expect(INSTRUCTIONS).toContain('list_summary_versions')
    expect(INSTRUCTIONS).toContain('get_summary_version')
  })
})

test('resume_task tells Claude when a cancelled blocker flagged the task', async () => {
  updateTask(db, pid, 1, { state: 'cancelled' })
  const r = await call('resume_task', { project: 'Engine build', task: 'T-2' })
  expect(r.isError).toBeFalsy()
  expect(text(r)).toContain('Note: a task this waited on was cancelled. Check it still makes sense.')
  const again = await call('resume_task', { project: 'Engine build', task: 'T-2' })
  expect(text(again)).not.toContain('Note: a task this waited on was cancelled')
})

test('resume_task has no note when not flagged', async () => {
  expect(text(await call('resume_task', { project: 'Engine build', task: 'T-1' }))).not.toContain('Note:')
})
