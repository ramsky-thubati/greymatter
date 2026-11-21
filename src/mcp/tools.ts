import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import type { Graph, GraphBranch } from '../core/graph.js'
import { formatTaskId, parseTaskId } from '../core/ids.js'
import type { Task } from '../core/types.js'
import { type ApiClient, ApiError } from './api-client.js'

const FLAG_NOTE = 'Note: a task this waited on was cancelled. Check it still makes sense.'

const STATES = ['todo', 'in_progress', 'later', 'done', 'cancelled'] as const

const project = z.string().describe('Project name, e.g. "Engine build"')
const task = z.string().describe('Task id like "T-14"')
const branch = z.string().describe('Branch name (case-insensitive) or numeric branch id')

type Result = { content: { type: 'text'; text: string }[]; isError?: boolean }

const ok = (text: string): Result => ({ content: [{ type: 'text', text }] })
const fail = (text: string): Result => ({ content: [{ type: 'text', text }], isError: true })

const tid = (raw: string) => formatTaskId(parseTaskId(raw))
const list = (nums: number[]) => nums.map(formatTaskId).join(', ')

function openBlockers(t: Graph['tasks'][number], graph: Graph): number[] {
  return t.blockedBy.filter((n) => {
    const state = graph.tasks.find((x) => x.num === n)?.state
    return state !== 'done' && state !== 'cancelled'
  })
}

function describeBranch(b: GraphBranch, graph: Graph): string {
  const root = b.rootTaskNum === null ? 'top-level' : `from ${formatTaskId(b.rootTaskNum)}`
  const flags = [b.stuck ? 'stuck' : '', b.finished ? 'finished' : ''].filter(Boolean)
  const purpose = b.purpose ? ` - ${b.purpose}` : ''
  const head = `${b.name} (id ${b.id}, ${root})${purpose}${flags.length ? ` [${flags.join(', ')}]` : ''}`
  const tasks = b.taskNums.map((n) => graph.tasks.find((t) => t.num === n)!)
  const lines = tasks.map((t) => {
    const open = t.blocked ? openBlockers(t, graph) : []
    const blocked = open.length ? ` (blocked by ${list(open)})` : ''
    return `  ${formatTaskId(t.num)} [${t.state}] ${t.title}${blocked}${t.flagged ? ' (flagged)' : ''}`
  })
  return [head, ...lines].join('\n')
}

function resolveBranch(graph: Graph, ref: string): GraphBranch {
  const key = ref.trim()
  const matches = /^\d+$/.test(key)
    ? graph.branches.filter((b) => b.id === Number(key))
    : graph.branches.filter((b) => b.name.trim().toLowerCase() === key.toLowerCase())
  if (matches.length === 0) {
    throw new ApiError(404, 'not_found', `Branch "${key}" not found in project "${graph.project.name}"`)
  }
  if (matches.length > 1) {
    throw new ApiError(
      409,
      'conflict',
      `Multiple branches named "${key}" in project "${graph.project.name}" (ids ${matches.map((b) => b.id).join(', ')}). Use the id.`,
    )
  }
  return matches[0]!
}

function taskText(t: Task): string {
  return [`${formatTaskId(t.num)} ${t.title}`, `State: ${t.state}${t.flagged ? ' (flagged)' : ''}`, '', t.details || '(no details)'].join('\n')
}

async function refuseText(api: ApiClient, pid: number, err: ApiError, what: string): Promise<string | null> {
  if (err.status !== 409) return null
  const d = (err.details ?? {}) as { dependents?: number[]; forkedBranches?: number[] }
  if (d.dependents?.length) {
    return `Not deleted: ${list(d.dependents)} wait on ${what}. Deleting drops those blockers. Call again with confirm: true only after the user agrees.`
  }
  if (d.forkedBranches?.length) {
    const graph = await api.getGraph(pid)
    const names = d.forkedBranches.map((id) => {
      const b = graph.branches.find((x) => x.id === id)
      return b ? `"${b.name}" (id ${id})` : `id ${id}`
    })
    return `Not deleted: ${what} is the fork point of ${names.join(', ')}. Move or delete those branches first.`
  }
  return null
}

export function registerTools(server: McpServer, api: ApiClient): void {
  const run = async (fn: () => Promise<string>): Promise<Result> => {
    try {
      return ok(await fn())
    } catch (e) {
      return fail(e instanceof Error ? e.message : String(e))
    }
  }

  const withProject = async <T>(name: string, fn: (pid: number, projectName: string) => Promise<T>): Promise<T> => {
    const p = await api.projectByName(name)
    return fn(p.id, p.name)
  }

  server.registerTool(
    'list_projects',
    { description: 'List all projects by name.' },
    () =>
      run(async () => {
        const ps = await api.listProjects()
        return ps.length ? ps.map((p) => p.name).join('\n') : 'No projects yet.'
      }),
  )

  server.registerTool(
    'create_project',
    { description: 'Create a project.', inputSchema: { name: z.string().describe('Name for the new project') } },
    ({ name }) =>
      run(async () => {
        const p = await api.createProject(name)
        return `Created project "${p.name}"`
      }),
  )

  server.registerTool(
    'get_graph',
    {
      description: 'Show the project as branches with their tasks, states and blockers.',
      inputSchema: { project },
    },
    (a) =>
      run(() =>
        withProject(a.project, async (pid) => {
          const graph = await api.getGraph(pid)
          return graph.branches.map((b) => describeBranch(b, graph)).join('\n\n')
        }),
      ),
  )

  server.registerTool(
    'resume_task',
    {
      description: 'Start work on a task: marks it in progress and returns its details and the live summary. Fails if the task is blocked.',
      inputSchema: { project, task },
    },
    (a) =>
      run(() =>
        withProject(a.project, async (pid) => {
          const wasFlagged = (await api.getTask(pid, a.task)).flagged
          const r = await api.resumeTask(pid, a.task)
          const note = wasFlagged ? `\n\n${FLAG_NOTE}` : ''
          return `${taskText(r.task)}${note}\n\nSummary\n${r.summary}`
        }),
      ),
  )

  server.registerTool(
    'get_task',
    { description: 'Read a task without changing it.', inputSchema: { project, task } },
    (a) => run(() => withProject(a.project, async (pid) => taskText(await api.getTask(pid, a.task)))),
  )

  server.registerTool(
    'create_branch',
    {
      description: 'Create a branch for a side thread, optionally forked from a task.',
      inputSchema: {
        project,
        name: z.string().describe('Branch name'),
        purpose: z.string().describe('One sentence on what the branch is for'),
        from_task: z.string().optional().describe('Task id the branch forks from, e.g. "T-3"; omit for a top-level branch'),
      },
    },
    (a) =>
      run(() =>
        withProject(a.project, async (pid) => {
          const b = await api.createBranch(pid, { name: a.name, purpose: a.purpose, fromTask: a.from_task })
          return `Created branch "${b.name}" (id ${b.id})${a.from_task ? ` from ${tid(a.from_task)}` : ''}`
        }),
      ),
  )

  server.registerTool(
    'update_branch',
    {
      description: 'Rename a branch, change its purpose, or move its root.',
      inputSchema: {
        project,
        branch,
        name: z.string().optional().describe('New name'),
        purpose: z.string().optional().describe('New purpose'),
        root_task: z
          .string()
          .nullable()
          .optional()
          .describe('Task id to fork the branch from, or null to make it top-level; omit to leave unchanged'),
      },
    },
    (a) =>
      run(() =>
        withProject(a.project, async (pid) => {
          const b = resolveBranch(await api.getGraph(pid), a.branch)
          const body: { name?: string; purpose?: string; rootTask?: string | null } = {}
          if (a.name !== undefined) body.name = a.name
          if (a.purpose !== undefined) body.purpose = a.purpose
          if (a.root_task !== undefined) body.rootTask = a.root_task
          const u = await api.updateBranch(pid, b.id, body)
          return `Updated branch "${u.name}"`
        }),
      ),
  )

  server.registerTool(
    'create_task',
    {
      description: 'Add a task to a branch. Without before/after it goes at the end.',
      inputSchema: {
        project,
        branch,
        title: z.string().describe('Task title'),
        details: z.string().optional().describe('Task details'),
        before: z.string().optional().describe('Place before this task id, e.g. "T-3"'),
        after: z.string().optional().describe('Place after this task id, e.g. "T-3"'),
      },
    },
    (a) =>
      run(() =>
        withProject(a.project, async (pid) => {
          const b = resolveBranch(await api.getGraph(pid), a.branch)
          const t = await api.createTask(pid, {
            branchId: b.id,
            title: a.title,
            details: a.details,
            before: a.before,
            after: a.after,
          })
          return `Created ${formatTaskId(t.num)} "${t.title}" on branch ${b.name}`
        }),
      ),
  )

  server.registerTool(
    'update_task',
    {
      description: 'Change a task title, details or state.',
      inputSchema: {
        project,
        task,
        title: z.string().optional().describe('New title'),
        details: z.string().optional().describe('New details; replaces the old text'),
        state: z.enum(STATES).optional().describe('New state'),
      },
    },
    (a) =>
      run(() =>
        withProject(a.project, async (pid) => {
          const body: { title?: string; details?: string; state?: (typeof STATES)[number] } = {}
          if (a.title !== undefined) body.title = a.title
          if (a.details !== undefined) body.details = a.details
          if (a.state !== undefined) body.state = a.state
          const t = await api.updateTask(pid, a.task, body)
          return a.state && !a.title && a.details === undefined
            ? `${formatTaskId(t.num)} → ${t.state}`
            : `Updated ${formatTaskId(t.num)}`
        }),
      ),
  )

  server.registerTool(
    'move_task',
    {
      description: 'Reorder a task relative to another task.',
      inputSchema: {
        project,
        task,
        before: z.string().optional().describe('Place before this task id'),
        after: z.string().optional().describe('Place after this task id'),
      },
    },
    (a) =>
      run(() =>
        withProject(a.project, async (pid) => {
          await api.moveTask(pid, a.task, { before: a.before, after: a.after })
          return `Moved ${tid(a.task)}`
        }),
      ),
  )

  server.registerTool(
    'add_blocker',
    {
      description: 'Make a task wait on another task.',
      inputSchema: { project, task, blocker: z.string().describe('Task id that must finish first') },
    },
    (a) =>
      run(() =>
        withProject(a.project, async (pid) => {
          await api.addBlocker(pid, a.task, a.blocker)
          return `${tid(a.task)} is blocked by ${tid(a.blocker)}`
        }),
      ),
  )

  server.registerTool(
    'remove_blocker',
    {
      description: 'Stop a task waiting on another task.',
      inputSchema: { project, task, blocker: z.string().describe('Task id to remove as blocker') },
    },
    (a) =>
      run(() =>
        withProject(a.project, async (pid) => {
          await api.removeBlocker(pid, a.task, a.blocker)
          return `${tid(a.task)} is no longer blocked by ${tid(a.blocker)}`
        }),
      ),
  )

  server.registerTool(
    'delete_task',
    {
      description: 'Delete a task. Refused if other tasks wait on it unless confirm is true.',
      inputSchema: {
        project,
        task,
        confirm: z.boolean().optional().describe('Set true only after the user agreed to drop the blockers of waiting tasks'),
      },
    },
    (a) =>
      run(() =>
        withProject(a.project, async (pid) => {
          try {
            await api.deleteTask(pid, a.task, a.confirm === true)
          } catch (e) {
            const msg = e instanceof ApiError ? await refuseText(api, pid, e, tid(a.task)) : null
            throw msg ? new Error(msg) : e
          }
          return `Deleted ${tid(a.task)}`
        }),
      ),
  )

  server.registerTool(
    'delete_branch',
    {
      description: 'Delete a branch and its tasks. Refused if tasks wait on them unless confirm is true.',
      inputSchema: {
        project,
        branch,
        confirm: z.boolean().optional().describe('Set true only after the user agreed to drop the blockers of waiting tasks'),
      },
    },
    (a) =>
      run(() =>
        withProject(a.project, async (pid) => {
          const b = resolveBranch(await api.getGraph(pid), a.branch)
          try {
            await api.deleteBranch(pid, b.id, a.confirm === true)
          } catch (e) {
            const msg = e instanceof ApiError ? await refuseText(api, pid, e, `branch "${b.name}"`) : null
            throw msg ? new Error(msg) : e
          }
          return `Deleted branch "${b.name}"`
        }),
      ),
  )

  server.registerTool(
    'get_summary',
    { description: 'Read the live project summary.', inputSchema: { project } },
    (a) => run(() => withProject(a.project, async (pid) => (await api.getSummary(pid)).body || '(empty)')),
  )

  server.registerTool(
    'list_summary_versions',
    { description: 'List the versions of the project summary, newest first.', inputSchema: { project } },
    (a) =>
      run(() =>
        withProject(a.project, async (pid) =>
          (await api.listSummaryVersions(pid))
            .map((v) => (v.frozenAt ? `v${v.version} (frozen ${v.frozenAt.slice(0, 10)})` : `v${v.version} (live)`))
            .join('\n'),
        ),
      ),
  )

  server.registerTool(
    'get_summary_version',
    {
      description: 'Read one version of the project summary, including frozen older ones.',
      inputSchema: { project, version: z.number().int().describe('Version number, e.g. 2') },
    },
    (a) =>
      run(() =>
        withProject(a.project, async (pid) => {
          const v = (await api.listSummaryVersions(pid)).find((x) => x.version === a.version)
          if (!v) throw new Error(`Summary v${a.version} not found`)
          return v.body || '(empty)'
        }),
      ),
  )

  server.registerTool(
    'update_summary',
    {
      description: 'Replace the live project summary with new text.',
      inputSchema: { project, body: z.string().describe('Full new summary text, replacing the old one') },
    },
    (a) =>
      run(() =>
        withProject(a.project, async (pid) => {
          await api.updateSummary(pid, a.body)
          return 'Summary updated'
        }),
      ),
  )

  server.registerTool(
    'create_checkpoint',
    {
      description: 'Freeze the current summary as a checkpoint. Only when the user asks for one.',
      inputSchema: { project },
    },
    (a) =>
      run(() =>
        withProject(a.project, async (pid) => {
          const c = await api.createCheckpoint(pid)
          return `Checkpoint created; summary now at v${c.toVersion}`
        }),
      ),
  )
}
