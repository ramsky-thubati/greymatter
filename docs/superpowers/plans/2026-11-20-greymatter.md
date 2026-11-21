# Greymatter Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a local, containerized web app plus stdio MCP server that tracks work as a metro-map graph of branches and tasks with one project-wide summary, so Claude Desktop and the browser share one state.

**Architecture:** One Node process (the app server) owns a SQLite database, enforces every rule in a pure `core` layer, exposes it over a JSON HTTP API with server-sent events for live updates, and serves the built React web app. The MCP server is a thin stdio process that maps Claude's tool calls to that HTTP API. Both ship in one Docker image; Compose keeps the app server running and Claude Desktop starts the MCP server with `docker exec -i`.

**Tech Stack:** Node 26, TypeScript, `node:sqlite` (built in, no native build), Hono + `@hono/node-server`, zod, `@modelcontextprotocol/sdk`, React 18 + Vite, Vitest (+ jsdom and @testing-library/react for web), Docker + Compose.

**Spec:** `docs/superpowers/specs/2026-11-20-greymatter-design.md`

## Global Constraints

- Task states, stored and sent as: `todo`, `in_progress`, `later`, `done`, `cancelled`. Shown in the UI as "todo", "in progress", "later", "done", "cancelled".
- Task IDs are per project, shown as `T-<n>`, assigned from a per-project counter, never reused.
- No links between projects: blockers, roots and moves never cross a project.
- Blocked is computed: a task is blocked while any blocker is not `done`. A `cancelled` blocker does not block; cancelling a task sets `flagged` on every task it was blocking.
- Next task of a branch = first task in branch order whose state is `todo` or `in_progress`. Branch is stuck when its next task is blocked. Branch is finished when every task is `done` or `cancelled`.
- One live summary version per project; older versions are read-only. Claude never makes a checkpoint unless asked.
- New project = one top-level branch named `main` and summary version 1 with an empty body.
- Server listens on port `4747`; DB path from env `DB_PATH` (default `./data/greymatter.db`); container name `greymatter`; host data folder `${GREYMATTER_DATA:-~/.greymatter}` mounted at `/data`.
- The host needs only Docker to run the app. Node is only for development.
- Commit messages use the `caveman-commit` skill.

## Review Focus

1. Task IDs typed loosely by Claude or me (`T-14`, `t-14`, `14`, `T14`) must all resolve; an unknown ID must say which project was searched. Pinned in Task 2 and Task 7.
2. Project names differing only in case or surrounding spaces (`Engine build` vs ` engine build`) are the same project, for lookup and for the duplicate check. Pinned in Task 1.
3. Container down while Claude calls a tool: the tool returns "Greymatter isn't running at http://127.0.0.1:4747. Start it with `docker compose up -d`." instead of a stack trace. Pinned in Task 8.
4. Blank or whitespace-only task titles, branch names and project names are rejected with 400, not saved. Pinned in Task 7.
5. Summary Markdown with backticks, code fences, emoji and trailing newlines round-trips byte for byte through save, checkpoint copy and read. Pinned in Task 6.

---

## File structure

```
package.json, tsconfig.json, vitest.config.ts, vite.config.ts
src/core/            pure rules over SQLite (no HTTP)
  db.ts              openDb, migrations, tx helper
  errors.ts          DomainError
  types.ts           shared types
  ids.ts             parseTaskId / formatTaskId
  projects.ts        create/list/find projects
  tasks.ts           branches + tasks create/update, resume
  sequence.ts        project-wide sequence helpers
  ordering.ts        relinkBranch, moveTask
  blockers.ts        add/remove blockers, cycle check
  structure.ts       deletes, moveRoot
  summary.ts         live summary, versions, checkpoints
  graph.ts           read model with derived state
src/server/          app.ts (Hono routes), events.ts (SSE bus), index.ts (entry)
src/mcp/             api-client.ts, tools.ts, instructions.ts, index.ts
src/web/             index.html, main.tsx, App.tsx, api.ts, useGraph.ts,
                     layout.ts, MetroMap.tsx, TaskPopup.tsx, BranchPopup.tsx,
                     CreatePopups.tsx, linkEditor.ts, LinkEditor.tsx,
                     SummaryTab.tsx, styles.css
tests/core, tests/server, tests/mcp, tests/web
Dockerfile, compose.yaml, .dockerignore, README.md
```

---

### Task 1: Scaffold, database, projects

**Files:**
- Create: `package.json`, `tsconfig.json`, `vitest.config.ts`, `src/core/db.ts`, `src/core/errors.ts`, `src/core/types.ts`, `src/core/projects.ts`
- Test: `tests/core/projects.test.ts`

**Interfaces:**
- Produces:
  - `type Db = DatabaseSync` (from `node:sqlite`); `openDb(path: string): Db` runs migrations and `PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL`; `tx<T>(db: Db, fn: () => T): T` wraps `BEGIN`/`COMMIT`/`ROLLBACK`.
  - `class DomainError extends Error { code: 'not_found' | 'conflict' | 'invalid'; details?: unknown }`
  - `types.ts`: `TaskState`, `Project { id: number; name: string }`, `Branch { id; projectId; name; purpose; rootTaskNum: number | null }`, `Task { projectId; num; branchId; title; details; state: TaskState; branchPos: number; seq: number; flagged: boolean }`
  - `createProject(db, name: string): Project`, `listProjects(db): Project[]`, `getProject(db, id: number): Project`, `findProjectByName(db, name: string): Project`

- [ ] **Step 1: Init the package**

`npm init -y`, set `"type": "module"`, scripts `test: vitest run`, `build: tsc -p tsconfig.json && vite build`, `start: node dist/server/index.js`. Install dev deps `typescript vitest @types/node`. tsconfig: `target ES2023`, `module NodeNext`, `outDir dist`, `rootDir src`, `strict`, `jsx react-jsx`, exclude `src/web` from tsc (Vite builds it).

- [ ] **Step 2: Write the schema in `db.ts`**

Tables (names are fixed, later tasks query them):
```sql
projects(id INTEGER PRIMARY KEY, name TEXT NOT NULL UNIQUE COLLATE NOCASE,
         next_task_num INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL)
branches(id INTEGER PRIMARY KEY, project_id INTEGER NOT NULL REFERENCES projects(id),
         name TEXT NOT NULL, purpose TEXT NOT NULL DEFAULT '', root_task_num INTEGER,
         created_at TEXT NOT NULL)
tasks(project_id INTEGER NOT NULL, num INTEGER NOT NULL, branch_id INTEGER NOT NULL REFERENCES branches(id),
      title TEXT NOT NULL, details TEXT NOT NULL DEFAULT '',
      state TEXT NOT NULL DEFAULT 'todo' CHECK (state IN ('todo','in_progress','later','done','cancelled')),
      branch_pos INTEGER NOT NULL, seq INTEGER NOT NULL, flagged INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (project_id, num))
blockers(project_id INTEGER NOT NULL, task_num INTEGER NOT NULL, blocker_num INTEGER NOT NULL,
         PRIMARY KEY (project_id, task_num, blocker_num))
summary_versions(project_id INTEGER NOT NULL, version INTEGER NOT NULL, body TEXT NOT NULL,
                 frozen_at TEXT, PRIMARY KEY (project_id, version))
checkpoints(project_id INTEGER NOT NULL, seq INTEGER NOT NULL, from_version INTEGER NOT NULL,
            to_version INTEGER NOT NULL, created_at TEXT NOT NULL)
```

- [ ] **Step 3: Write the failing tests**

```ts
// tests/core/projects.test.ts
const db = openDb(':memory:')
test('new project gets a main branch and empty summary v1', () => {
  const p = createProject(db, 'Engine build')
  const b = db.prepare('SELECT name, root_task_num FROM branches WHERE project_id=?').all(p.id)
  expect(b).toEqual([{ name: 'main', root_task_num: null }])
  const s = db.prepare('SELECT version, body, frozen_at FROM summary_versions WHERE project_id=?').all(p.id)
  expect(s).toEqual([{ version: 1, body: '', frozen_at: null }])
})
test('names are trimmed and matched case-insensitively', () => {
  createProject(db, 'Book idea')
  expect(findProjectByName(db, '  book IDEA ').name).toBe('Book idea')
  expect(() => createProject(db, 'BOOK IDEA ')).toThrow(expect.objectContaining({ code: 'conflict' }))
})
test('blank name is invalid; unknown name is not_found', () => {
  expect(() => createProject(db, '   ')).toThrow(expect.objectContaining({ code: 'invalid' }))
  expect(() => findProjectByName(db, 'nope')).toThrow(expect.objectContaining({ code: 'not_found' }))
})
```

- [ ] **Step 4: Run `npx vitest run tests/core/projects.test.ts`** — expect FAIL (modules missing).
- [ ] **Step 5: Implement `db.ts`, `errors.ts`, `types.ts`, `projects.ts`** — `createProject` runs inside `tx`.
- [ ] **Step 6: Run the test** — expect PASS.
- [ ] **Step 7: Commit**

---

### Task 2: Branches, tasks, sequence, resume

**Files:**
- Create: `src/core/ids.ts`, `src/core/sequence.ts`, `src/core/tasks.ts`
- Test: `tests/core/tasks.test.ts`, `tests/core/ids.test.ts`

**Interfaces:**
- Consumes: Task 1.
- Produces:
  - `parseTaskId(input: string | number): number` (accepts `T-14`, `t-14`, `T14`, `14`, ` 14 `; throws `invalid` otherwise); `formatTaskId(n: number): string` → `T-14`.
  - `nextSeq(db, projectId): number` = 1 + max seq across `tasks` and `checkpoints`; `shiftSeqFrom(db, projectId, seq: number): void` adds 1 to every task and checkpoint seq `>= seq`.
  - `createBranch(db, projectId, input: { name: string; purpose?: string; fromTaskNum?: number }): Branch`
  - `updateBranch(db, projectId, branchId, input: { name?: string; purpose?: string }): Branch`
  - `getBranch(db, projectId, branchId): Branch`
  - `createTask(db, projectId, input: { branchId: number; title: string; details?: string; before?: number; after?: number }): Task` — appends (`branch_pos` = last + 1, `seq = nextSeq`), then if `before`/`after` is given calls `moveTask` from Task 3. Until Task 3 lands, `before`/`after` throw `invalid`.
  - `getTask(db, projectId, num): Task`
  - `updateTask(db, projectId, num, input: { title?: string; details?: string; state?: TaskState }): Task` — any update clears `flagged` on that task.
  - `resumeTask(db, projectId, num): { task: Task; summary: string }` — throws `conflict` with `details: { blockedBy: number[] }` if blocked; otherwise sets `in_progress` and returns the task with the live summary body.

- [ ] **Step 1: Write the failing tests**

```ts
test('parseTaskId accepts loose forms', () => {
  for (const s of ['T-14', 't-14', 'T14', '14', ' 14 ']) expect(parseTaskId(s)).toBe(14)
  expect(() => parseTaskId('X-1')).toThrow(expect.objectContaining({ code: 'invalid' }))
})
test('task numbers count up per project and are never reused', () => {
  const p = createProject(db, 'A'); const main = mainBranchId(p.id)
  expect(createTask(db, p.id, { branchId: main, title: 'one' }).num).toBe(1)
  expect(createTask(db, p.id, { branchId: main, title: 'two' }).num).toBe(2)
  db.prepare('DELETE FROM tasks WHERE project_id=? AND num=2').run(p.id)
  expect(createTask(db, p.id, { branchId: main, title: 'three' }).num).toBe(3)
})
test('new tasks go to the end of branch and sequence', () => {
  const t = createTask(db, p.id, { branchId: main, title: 'x' })
  expect(t.seq).toBe(maxSeq(p.id)); expect(t.branchPos).toBe(maxBranchPos(main))
})
test('fork branch from a task in the same project only', () => {
  const b = createBranch(db, p.id, { name: 'Weld mounts', purpose: 'mounts', fromTaskNum: 1 })
  expect(b.rootTaskNum).toBe(1)
  expect(() => createBranch(db, other.id, { name: 'x', fromTaskNum: 1 })).toThrow(expect.objectContaining({ code: 'not_found' }))
})
test('updating a flagged task clears the flag', () => { /* set flagged=1 via SQL, updateTask details, expect flagged false */ })
test('resume sets in_progress and returns live summary', () => {
  expect(resumeTask(db, p.id, 1)).toMatchObject({ task: { state: 'in_progress' }, summary: '' })
})
test('unknown task names the project', () => {
  expect(() => getTask(db, p.id, 999)).toThrow(/T-999.*A/)
})
```
(`mainBranchId`, `maxSeq`, `maxBranchPos` are small SQL helpers in `tests/core/helpers.ts`.)

- [ ] **Step 2: Run** — expect FAIL.
- [ ] **Step 3: Implement `ids.ts`, `sequence.ts`, `tasks.ts`.** `resumeTask`'s blocked check reads `blockers` directly (`blocker state != 'done'` and `!= 'cancelled'`) so it works before Task 4.
- [ ] **Step 4: Run** — expect PASS.
- [ ] **Step 5: Commit**

---

### Task 3: Ordering (relink, move, insert)

**Files:**
- Create: `src/core/ordering.ts`
- Modify: `src/core/tasks.ts` (`createTask` uses `moveTask` for `before`/`after`)
- Test: `tests/core/ordering.test.ts`

**Interfaces:**
- Consumes: Task 2.
- Produces:
  - `relinkBranch(db, projectId, branchId, order: Array<{ num: number } | { title: string }>): Task[]` — the full new branch order. `{ title }` entries create tasks. Throws `invalid` unless the `num` entries are exactly the branch's current tasks, each once. Returns the branch's tasks in new order.
  - `moveTask(db, projectId, num, to: { before?: number; after?: number }): void` — exactly one of `before`/`after`, target on the same branch; builds the order and calls `relinkBranch`.

- [ ] **Step 1: Write the failing tests**

```ts
// Sequence before: T1(main) T2(main) T3(main), checkpoint at seq after T2
test('insert between T-1 and T-2 lands just before T-2 and shifts the rest', () => {
  const t = createTask(db, p.id, { branchId: main, title: 'new', before: 2 })
  expect(branchNums(main)).toEqual([1, t.num, 2, 3])
  expect(seqOrder(p.id)).toEqual(['T1', `T${t.num}`, 'T2', 'CP', 'T3'])
})
test('new last task via after lands just after its previous task', () => {
  const t = createTask(db, p.id, { branchId: main, title: 'tail', after: 3 })
  expect(seqOrder(p.id).at(-1)).toBe(`T${t.num}`)
})
test('relink with cut-and-rejoin keeps branch lines monotonic in seq', () => {
  relinkBranch(db, p.id, main, [{ num: 3 }, { num: 1 }, { title: 'mid' }, { num: 2 }])
  const seqs = branchSeqs(main); expect([...seqs].sort((a, b) => a - b)).toEqual(seqs)
})
test('relink rejects missing or duplicate tasks', () => {
  expect(() => relinkBranch(db, p.id, main, [{ num: 1 }, { num: 1 }])).toThrow(expect.objectContaining({ code: 'invalid' }))
})
test('inserting before a task left of a checkpoint lands left of it', () => {
  createTask(db, p.id, { branchId: main, title: 'old-insert', before: 2 })
  expect(seqOrder(p.id).indexOf('CP')).toBeGreaterThan(seqOrder(p.id).indexOf('T2'))
})
```
(`seqOrder` lists `T<num>`/`CP` by seq; `branchNums`/`branchSeqs` list by `branch_pos`.)

- [ ] **Step 2: Run** — expect FAIL.
- [ ] **Step 3: Implement `relinkBranch`** with this placement algorithm, all in one `tx`:

```
1. Create tasks for {title} entries (num from counter, seq temporarily null).
2. Write branch_pos = index for every entry.
3. Anchors: walk the new order; keep a task as anchor if it is not new and its seq
   is greater than the last anchor's seq. Everything else is "floating".
4. For each floating task, in branch order:
   - if a later anchor exists in branch order: s = anchor.seq; shiftSeqFrom(s); task.seq = s
     (the task takes the anchor's old slot; the anchor and everything after move up by one)
   - else: s = seq of the previous task in branch order; shiftSeqFrom(s + 1); task.seq = s + 1
5. Renumber seq to 1..n per project (tasks + checkpoints, stable by seq) to keep it compact.
```

- [ ] **Step 4: Run** — expect PASS.
- [ ] **Step 5: Commit**

---

### Task 4: Blockers and the graph read model

**Files:**
- Create: `src/core/blockers.ts`, `src/core/graph.ts`
- Modify: `src/core/tasks.ts` (`updateTask` to `cancelled` sets `flagged=1` on tasks it blocks)
- Test: `tests/core/blockers.test.ts`, `tests/core/graph.test.ts`

**Interfaces:**
- Consumes: Tasks 1–3.
- Produces:
  - `addBlocker(db, projectId, taskNum, blockerNum): void` — throws `invalid` for self-block or a cycle, `not_found` if either task isn't in the project.
  - `removeBlocker(db, projectId, taskNum, blockerNum): void`
  - `getGraph(db, projectId): Graph` where
    ```ts
    interface GraphTask extends Task { blockedBy: number[]; blocked: boolean }
    interface GraphBranch extends Branch { taskNums: number[]; nextTaskNum: number | null; stuck: boolean; finished: boolean }
    interface Graph { project: Project; branches: GraphBranch[]; tasks: GraphTask[];
                      checkpoints: { seq: number; fromVersion: number; toVersion: number }[]; liveVersion: number }
    ```
    Branches ordered by creation; tasks ordered by seq.

- [ ] **Step 1: Write the failing tests**

```ts
test('cross-branch blocker makes the branch stuck', () => {
  // main: T1 in_progress; weld (forked from T1): T2 todo blocked by T1
  addBlocker(db, p.id, 2, 1)
  const g = getGraph(db, p.id)
  expect(task(g, 2)).toMatchObject({ blocked: true, blockedBy: [1] })
  expect(branch(g, 'weld')).toMatchObject({ nextTaskNum: 2, stuck: true })
})
test('later is skipped for next task and does not make a branch stuck', () => {
  updateTask(db, p.id, 2, { state: 'later' })
  expect(branch(getGraph(db, p.id), 'weld')).toMatchObject({ nextTaskNum: 3, stuck: false, finished: false })
})
test('cancelled blocker stops blocking and flags the waiting task', () => {
  updateTask(db, p.id, 1, { state: 'cancelled' })
  expect(task(getGraph(db, p.id), 2)).toMatchObject({ blocked: false, flagged: true })
})
test('finished when all tasks done or cancelled', () => { /* set states, expect finished true */ })
test('cycles and self-blocks are rejected', () => {
  addBlocker(db, p.id, 3, 2)
  expect(() => addBlocker(db, p.id, 2, 3)).toThrow(expect.objectContaining({ code: 'invalid' }))
  expect(() => addBlocker(db, p.id, 2, 2)).toThrow(expect.objectContaining({ code: 'invalid' }))
})
test('blocker from another project is not found', () => {
  expect(() => addBlocker(db, p.id, 2, 99)).toThrow(expect.objectContaining({ code: 'not_found' }))
})
```

- [ ] **Step 2: Run** — expect FAIL.
- [ ] **Step 3: Implement** `blockers.ts` (cycle check = DFS from `blockerNum` over existing blockers looking for `taskNum`) and `graph.ts`.
- [ ] **Step 4: Run** — expect PASS.
- [ ] **Step 5: Commit**

---

### Task 5: Deletes and moving a branch root

**Files:**
- Create: `src/core/structure.ts`
- Test: `tests/core/structure.test.ts`

**Interfaces:**
- Consumes: Tasks 1–4.
- Produces:
  - `deleteTask(db, projectId, num, opts: { confirm?: boolean }): void` — throws `conflict` `{ forkedBranches: number[] }` if any branch roots on it (always, confirm doesn't override); throws `conflict` `{ dependents: number[] }` if other tasks are blocked by it and `!confirm`; with `confirm`, removes those blocker rows. Re-packs `branch_pos` of its branch.
  - `deleteBranch(db, projectId, branchId, opts: { confirm?: boolean }): void` — refuses with `conflict { forkedBranches }` if another branch roots on one of its tasks; `conflict { dependents }` (tasks outside the branch blocked by its tasks) unless `confirm`; deletes its tasks and their blocker rows.
  - `moveRoot(db, projectId, branchId, rootTaskNum: number | null): Branch` — `null` makes it top-level. Throws `invalid` if the target task is in this branch or any branch forked from it, directly or further down.

- [ ] **Step 1: Write the failing tests**

```ts
test('deleting a blocker task warns, then drops the blocker on confirm', () => {
  expect(() => deleteTask(db, p.id, 1, {})).toThrow(expect.objectContaining({ code: 'conflict', details: { dependents: [2] } }))
  deleteTask(db, p.id, 1, { confirm: true })
  expect(task(getGraph(db, p.id), 2).blockedBy).toEqual([])
})
test('cannot delete a task or branch another branch forks from', () => {
  expect(() => deleteTask(db, p.id, 1, { confirm: true })).toThrow(expect.objectContaining({ details: { forkedBranches: [weld.id] } }))
  expect(() => deleteBranch(db, p.id, main, { confirm: true })).toThrow(expect.objectContaining({ code: 'conflict' }))
})
test('deleting a branch deletes its tasks', () => {
  deleteBranch(db, p.id, weld.id, { confirm: true })
  expect(getGraph(db, p.id).tasks.some(t => t.branchId === weld.id)).toBe(false)
})
test('moveRoot rejects its own tasks and sub-branch tasks', () => {
  // supplier forked from weld T2
  expect(() => moveRoot(db, p.id, weld.id, 2)).toThrow(expect.objectContaining({ code: 'invalid' }))
  expect(() => moveRoot(db, p.id, weld.id, supplierTaskNum)).toThrow(expect.objectContaining({ code: 'invalid' }))
  expect(moveRoot(db, p.id, weld.id, 3).rootTaskNum).toBe(3) // 3 is on main
})
```

- [ ] **Step 2: Run** — expect FAIL.
- [ ] **Step 3: Implement `structure.ts`.**
- [ ] **Step 4: Run** — expect PASS.
- [ ] **Step 5: Commit**

---

### Task 6: Summary and checkpoints

**Files:**
- Create: `src/core/summary.ts`
- Test: `tests/core/summary.test.ts`

**Interfaces:**
- Consumes: Tasks 1–2 (`nextSeq`).
- Produces:
  - `getLiveSummary(db, projectId): { version: number; body: string }`
  - `updateLiveSummary(db, projectId, body: string): { version: number; body: string }`
  - `listSummaryVersions(db, projectId): { version: number; body: string; frozenAt: string | null }[]` newest first
  - `createCheckpoint(db, projectId): { seq: number; fromVersion: number; toVersion: number }` — freezes live (`frozen_at = now`), inserts `version+1` with the same body, inserts a checkpoint row at `nextSeq`.

- [ ] **Step 1: Write the failing tests**

```ts
const md = '# Engine\n\n```ts\nconst a = `x`\n```\n\nMounts done ✅\n\n'
test('summary round-trips exactly', () => {
  updateLiveSummary(db, p.id, md)
  expect(getLiveSummary(db, p.id)).toEqual({ version: 1, body: md })
})
test('checkpoint freezes v1 and starts v2 as an exact copy at the end of the sequence', () => {
  const cp = createCheckpoint(db, p.id)
  expect(cp).toMatchObject({ fromVersion: 1, toVersion: 2 })
  expect(getLiveSummary(db, p.id)).toEqual({ version: 2, body: md })
  expect(listSummaryVersions(db, p.id)[1]).toMatchObject({ version: 1, body: md, frozenAt: expect.any(String) })
  expect(cp.seq).toBe(maxSeq(p.id))
})
test('updates after a checkpoint only touch the live version', () => {
  updateLiveSummary(db, p.id, 'short')
  expect(listSummaryVersions(db, p.id).map(v => v.body)).toEqual(['short', md])
})
```

- [ ] **Step 2: Run** — expect FAIL.
- [ ] **Step 3: Implement `summary.ts`.**
- [ ] **Step 4: Run** — expect PASS.
- [ ] **Step 5: Commit**

---

### Task 7: HTTP API and live events

**Files:**
- Create: `src/server/app.ts`, `src/server/events.ts`, `src/server/index.ts`
- Test: `tests/server/api.test.ts`

**Interfaces:**
- Consumes: all of `src/core`.
- Produces:
  - `class ProjectEvents { emit(projectId: number): void; subscribe(projectId: number, fn: () => void): () => void }`
  - `createApp(db: Db, events: ProjectEvents, opts?: { staticDir?: string }): Hono`
  - Routes (JSON; errors as `{ error: { code, message, details? } }` with `invalid`→400, `not_found`→404, `conflict`→409). `:task` accepts any `parseTaskId` form. Every mutating route calls `events.emit(projectId)` after success.

| Method | Path | Body / query | Returns |
|---|---|---|---|
| GET | `/api/health` | | `{ ok: true }` |
| GET / POST | `/api/projects` | `{ name }` | `Project[]` / `Project` |
| GET | `/api/projects/by-name/:name` | | `Project` |
| GET | `/api/projects/:pid/graph` | | `Graph` |
| POST | `/api/projects/:pid/branches` | `{ name, purpose?, fromTask? }` | `Branch` |
| PATCH | `/api/projects/:pid/branches/:bid` | `{ name?, purpose?, rootTask?: string\|number\|null }` | `Branch` |
| DELETE | `/api/projects/:pid/branches/:bid` | `?confirm=1` | 204 |
| PUT | `/api/projects/:pid/branches/:bid/order` | `{ order: ({ task } \| { title })[] }`, `task` parsed with `parseTaskId` into `{ num }` | `Task[]` |
| POST | `/api/projects/:pid/tasks` | `{ branchId, title, details?, before?, after? }` | `Task` |
| GET / PATCH | `/api/projects/:pid/tasks/:task` | `{ title?, details?, state? }` | `Task` |
| POST | `/api/projects/:pid/tasks/:task/move` | `{ before? , after? }` | 204 |
| POST | `/api/projects/:pid/tasks/:task/resume` | | `{ task, summary }` |
| DELETE | `/api/projects/:pid/tasks/:task` | `?confirm=1` | 204 |
| POST | `/api/projects/:pid/tasks/:task/blockers` | `{ blocker }` | 204 |
| DELETE | `/api/projects/:pid/tasks/:task/blockers/:blocker` | | 204 |
| GET / PUT | `/api/projects/:pid/summary` | `{ body }` | `{ version, body }` |
| GET | `/api/projects/:pid/summary/versions` | | versions |
| POST | `/api/projects/:pid/checkpoints` | | checkpoint |
| GET | `/api/projects/:pid/events` | | SSE, `event: changed` on each emit, `: ping` every 25 s |

  - `index.ts`: `openDb(process.env.DB_PATH ?? './data/greymatter.db')` (create parent dir), `serve({ fetch: app.fetch, port: Number(process.env.PORT ?? 4747), hostname: '0.0.0.0' })`, static files from `dist/web` with SPA fallback to `index.html`.

- [ ] **Step 1: Install** `hono @hono/node-server zod`.
- [ ] **Step 2: Write the failing tests** (use `app.request()`, no network)

```ts
test('blank names and titles are 400', async () => {
  expect((await post('/api/projects', { name: '  ' })).status).toBe(400)
  expect((await post(`/api/projects/${pid}/tasks`, { branchId: main, title: '\t ' })).status).toBe(400)
  expect((await post(`/api/projects/${pid}/branches`, { name: '' })).status).toBe(400)
})
test('loose task ids work in paths; unknown id is 404 naming the project', async () => {
  expect((await get(`/api/projects/${pid}/tasks/t1`)).status).toBe(200)
  const r = await get(`/api/projects/${pid}/tasks/T-999`)
  expect(r.status).toBe(404); expect((await r.json()).error.message).toMatch(/T-999.*Engine build/)
})
test('resume on a blocked task is 409 with blockedBy', async () => {
  const r = await post(`/api/projects/${pid}/tasks/T-2/resume`)
  expect(r.status).toBe(409); expect((await r.json()).error.details).toEqual({ blockedBy: [1] })
})
test('mutations emit a project event', async () => {
  const seen = vi.fn(); events.subscribe(pid, seen)
  await patch(`/api/projects/${pid}/tasks/T-1`, { state: 'done' })
  expect(seen).toHaveBeenCalledOnce()
})
test('delete with dependents needs confirm', async () => {
  expect((await del(`/api/projects/${pid}/tasks/T-1`)).status).toBe(409)
  expect((await del(`/api/projects/${pid}/tasks/T-1?confirm=1`)).status).toBe(204)
})
```

- [ ] **Step 3: Run** — expect FAIL.
- [ ] **Step 4: Implement** `events.ts` (Node `EventEmitter`), `app.ts` (zod schemas with `.trim().min(1)` on names/titles; one `onError` that maps `DomainError` and `ZodError`), `index.ts`.
- [ ] **Step 5: Run** — expect PASS.
- [ ] **Step 6: Smoke run** `npx tsx src/server/index.ts` then `curl -s localhost:4747/api/health` → `{"ok":true}`.
- [ ] **Step 7: Commit**

---

### Task 8: MCP server

**Files:**
- Create: `src/mcp/api-client.ts`, `src/mcp/tools.ts`, `src/mcp/instructions.ts`, `src/mcp/index.ts`
- Test: `tests/mcp/tools.test.ts`

**Interfaces:**
- Consumes: Task 7 routes.
- Produces:
  - `createApiClient(baseUrl: string, fetchFn?: typeof fetch): ApiClient` — one method per route; throws `ApiError { status, code, message, details }`; a network failure throws `ApiError` with message ``Greymatter isn't running at <baseUrl>. Start it with `docker compose up -d`.``
  - `registerTools(server: McpServer, api: ApiClient): void`
  - `INSTRUCTIONS: string` passed as the server's `instructions`.
  - `index.ts`: `new McpServer({ name: 'greymatter', version }, { instructions: INSTRUCTIONS })`, `StdioServerTransport`, base URL from `GREYMATTER_URL` default `http://127.0.0.1:4747`.

Tools (every tool except `list_projects`/`create_project` takes `project: string`, the name; tasks are `task: string` like `T-14`). Tool results are short text; errors return `isError: true` with the API message.

`list_projects`, `create_project(name)`, `get_graph(project)` (text listing branches with stuck/finished and tasks as `T-n [state] title (blocked by T-x)`), `resume_task(project, task)`, `get_task`, `create_branch(project, name, purpose, from_task?)`, `update_branch(project, branch, name?, purpose?, root_task?)`, `create_task(project, branch, title, details?, before?, after?)`, `update_task(project, task, title?, details?, state?)`, `move_task(project, task, before?, after?)`, `add_blocker(project, task, blocker)`, `remove_blocker`, `delete_task(project, task, confirm?)`, `delete_branch(project, branch, confirm?)`, `get_summary(project)`, `update_summary(project, body)`, `create_checkpoint(project)`. `branch` is the branch name (case-insensitive) or id; if two branches share the name, return an error listing their ids.

`INSTRUCTIONS` must state, in plain sentences:
1. At the start of a chat, ask which project unless the user named one; use it for the rest of the chat unless they name another.
2. When you notice a side thread, suggest a branch and create it only after the user says yes.
3. "Resume T-n": call `resume_task`; if blocked, say which task it waits on and stop. Read only the returned task details and summary.
4. "Take notes": rewrite the summary with `update_summary` so it describes the project as it stands now. Shrink finished work to its outcome; before shrinking, move the detail into that task's details with `update_task`. Keep only what would matter to the next task someone picks up. If the user stopped mid-task, add a "Where I stopped" section to that task's details.
5. Never call `create_checkpoint` unless the user asks for one. If asked to decide, give your call and wait for yes.
6. Don't list open tasks in chat; the user watches the web app.

- [ ] **Step 1: Install** `@modelcontextprotocol/sdk`.
- [ ] **Step 2: Write the failing tests** (wire `createApiClient('http://x', (url, init) => app.request(url, init))` against an in-memory app, and call tools through an in-memory MCP `Client` + `InMemoryTransport.createLinkedPair()`)

```ts
test('resume_task returns details and summary', async () => {
  const r = await call('resume_task', { project: 'engine build', task: 't-1' })
  expect(text(r)).toContain('T-1'); expect(text(r)).toContain('Summary')
})
test('resume_task on blocked task says what it waits on', async () => {
  const r = await call('resume_task', { project: 'Engine build', task: 'T-2' })
  expect(r.isError).toBe(true); expect(text(r)).toMatch(/blocked by T-1/)
})
test('server down gives a readable message', async () => {
  const api = createApiClient('http://127.0.0.1:4747', () => Promise.reject(new TypeError('fetch failed')))
  await expect(api.listProjects()).rejects.toThrow("Greymatter isn't running at http://127.0.0.1:4747. Start it with `docker compose up -d`.")
})
test('instructions forbid unasked checkpoints and need a yes for branches', () => {
  expect(INSTRUCTIONS).toMatch(/Never call `create_checkpoint` unless/)
  expect(INSTRUCTIONS).toMatch(/only after the user says yes/)
})
```

- [ ] **Step 3: Run** — expect FAIL.
- [ ] **Step 4: Implement** the four files. Resolve `project` with `/api/projects/by-name/:name`.
- [ ] **Step 5: Run** — expect PASS.
- [ ] **Step 6: Commit**

---

### Task 9: Web app shell, metro map, live updates

**Files:**
- Create: `vite.config.ts`, `src/web/index.html`, `src/web/main.tsx`, `src/web/App.tsx`, `src/web/api.ts`, `src/web/useGraph.ts`, `src/web/layout.ts`, `src/web/MetroMap.tsx`, `src/web/styles.css`
- Test: `tests/web/layout.test.ts`

**Interfaces:**
- Consumes: Task 7 routes and the `Graph` type (import from `src/core/types.ts` / `graph.ts` as type-only).
- Produces:
  - `web/api.ts`: typed fetch wrappers mirroring Task 7, throwing `{ status, code, message, details }`.
  - `useGraph(projectId: number | null): { graph: Graph | null; reload(): void }` — fetches `/graph`, opens `EventSource('/api/projects/:pid/events')`, reloads on `changed`.
  - `computeLayout(graph: Graph): Layout` where
    ```ts
    interface Layout { width: number; height: number;
      lanes: { branchId: number; y: number; label: string; color: string; stuck: boolean }[];
      stops: { num: number; x: number; y: number }[];
      forks: { branchId: number; from: { x: number; y: number }; to: { x: number; y: number } }[];
      checkpoints: { x: number; label: string }[] }   // label like 'v1 → v2'
    ```
    Columns: merge tasks and checkpoints sorted by `seq`; column = rank. `x = 190 + col * 110`. Lane order: each top-level branch (by creation) followed depth-first by branches forked from its tasks. `y = 40 + laneIndex * 90`. Colors cycle `['#5c7cfa','#cc5de8','#20c997','#ff922b','#f06595','#339af0']` by lane.
  - `MetroMap({ graph, onTaskClick(num), onBranchClick(branchId) })` — SVG per the spec's map rules and the mockup `.superpowers/brainstorm/28390-1795220277/content/checkpoint.html` option A (state colours, blocked red ring + "blocked by T-x" label, red dashed blocker curves, stuck chip, dashed vertical checkpoint line with label). Horizontal scroll when wider than the window.
  - `App` — top bar: project dropdown (projects + "New project…"), tabs `Graph` / `Summary`, buttons `+ Branch` / `+ Task`. Remembers last project in `localStorage` (try/catch).

- [ ] **Step 1: Install** `react react-dom vite @vitejs/plugin-react jsdom @testing-library/react @types/react @types/react-dom`. Vite: `root: 'src/web'`, `build.outDir: '../../dist/web'`, dev proxy `/api` → `http://127.0.0.1:4747`.
- [ ] **Step 2: Write the failing tests**

```ts
test('checkpoint sits between the tasks it separates', () => {
  // seq: T1=1, T2=2, CP=3, T3=4
  const L = computeLayout(g)
  expect(L.checkpoints[0]).toEqual({ x: 190 + 2 * 110, label: 'v1 → v2' })
  expect(stop(L, 3).x).toBe(190 + 3 * 110)
})
test('forked branch lane comes right after its parent, before the next top-level branch', () => {
  // branches: main, paint (top-level, created 2nd), weld (forked from main T1, created 3rd)
  expect(computeLayout(g).lanes.map(l => l.label)).toEqual(['main', 'weld', 'paint'])
})
test('fork curve starts at the root stop', () => {
  const L = computeLayout(g)
  expect(L.forks[0].from).toEqual({ x: stop(L, 1).x, y: stop(L, 1).y })
})
```

- [ ] **Step 3: Run** — expect FAIL.
- [ ] **Step 4: Implement** the files above.
- [ ] **Step 5: Run** — expect PASS.
- [ ] **Step 6: Manual check** — `npx tsx src/server/index.ts` and `npx vite` in two terminals; create a project via `curl -X POST localhost:4747/api/projects -H 'content-type: application/json' -d '{"name":"Engine build"}'`, add tasks with curl, and confirm the map redraws without refresh after each curl.
- [ ] **Step 7: Commit**

---

### Task 10: Task, branch and create popups

**Files:**
- Create: `src/web/Popup.tsx`, `src/web/TaskPopup.tsx`, `src/web/BranchPopup.tsx`, `src/web/CreatePopups.tsx`
- Modify: `src/web/App.tsx`
- Test: `tests/web/TaskPopup.test.tsx`

**Interfaces:**
- Consumes: Task 9 (`api`, `Graph`).
- Produces:
  - `Popup({ title, onClose, children })` — centered modal, closes on Esc and backdrop click.
  - `TaskPopup({ projectId, task: GraphTask, graph, onClose })` — ID, editable title, state select, details textarea (save on blur), blockers list with remove and an "add blocker" select of other tasks, flagged notice ("A blocker was cancelled. Check this task still makes sense."), buttons `Branch from here` (opens create-branch with `fromTask`) and `Delete`. Delete: on 409 `dependents`, show "T-x, T-y wait on this task. Delete anyway?" then retry with `confirm`; on 409 `forkedBranches`, show "Branch <name> forks from this task. Move or delete it first."
  - `BranchPopup({ projectId, branch: GraphBranch, graph, onClose, onEditLinks })` — rename, edit purpose, move root (select of allowed tasks + "No root (top level)"), `Edit links`, `Delete` with the same 409 handling.
  - `CreateTaskPopup`, `CreateBranchPopup({ fromTask? })`, `CreateProjectPopup`.

- [ ] **Step 1: Write the failing test**

```ts
// @vitest-environment jsdom
test('changing state calls updateTask', async () => {
  const update = vi.spyOn(api, 'updateTask').mockResolvedValue(task)
  render(<TaskPopup projectId={1} task={task} graph={g} onClose={() => {}} />)
  fireEvent.change(screen.getByLabelText('State'), { target: { value: 'done' } })
  expect(update).toHaveBeenCalledWith(1, 'T-7', { state: 'done' })
})
test('delete with dependents asks before confirming', async () => {
  vi.spyOn(api, 'deleteTask').mockRejectedValueOnce({ status: 409, details: { dependents: [9] } }).mockResolvedValueOnce(undefined)
  render(<TaskPopup … />); fireEvent.click(screen.getByText('Delete'))
  expect(await screen.findByText('T-9 waits on this task. Delete anyway?')).toBeTruthy()
})
```

- [ ] **Step 2: Run** — expect FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** — expect PASS.
- [ ] **Step 5: Manual check** in the browser: click a stop → popup; change state → map colour updates; branch from a task → new lane appears.
- [ ] **Step 6: Commit**

---

### Task 11: Link edit mode

**Files:**
- Create: `src/web/linkEditor.ts`, `src/web/LinkEditor.tsx`
- Modify: `src/web/App.tsx`
- Test: `tests/web/linkEditor.test.ts`

**Interfaces:**
- Consumes: Task 10 (`BranchPopup.onEditLinks`), `api.setBranchOrder(projectId, branchId, order)`.
- Produces:
  - `type Item = { num: number; title: string } | { tempId: string; title: string }`
  - `type EditorState = { pieces: Item[][] }` (one piece = a chain)
  - `initEditor(tasks: { num: number; title: string }[]): EditorState` → one piece.
  - `editorReducer(s, action)` with actions `{ type: 'cut', piece: number, after: number }` (split after index), `{ type: 'add', title: string }` (new one-item piece), `{ type: 'link', fromPiece: number, toPiece: number }` (append `toPiece` to the end of `fromPiece`).
  - `canSave(s): boolean` = exactly one piece. `toOrder(s): ({ task: number } | { title: string })[]`.
  - `LinkEditor({ projectId, branch, graph, onClose })` — each piece is a row of chips joined by link marks with a ✂ between chips; each piece after the first has "Link after…" choosing which piece's end it attaches to; "+ New task" input; `Save` disabled unless `canSave`.

- [ ] **Step 1: Write the failing tests**

```ts
test('cut, add, relink gives the inserted order', () => {
  let s = initEditor([{ num: 3, title: 'a' }, { num: 4, title: 'b' }])
  s = editorReducer(s, { type: 'cut', piece: 0, after: 0 })      // [3] [4]
  s = editorReducer(s, { type: 'add', title: 'clean holes' })      // [3] [4] [new]
  expect(canSave(s)).toBe(false)
  s = editorReducer(s, { type: 'link', fromPiece: 0, toPiece: 2 }) // [3,new] [4]
  s = editorReducer(s, { type: 'link', fromPiece: 0, toPiece: 1 }) // [3,new,4]
  expect(canSave(s)).toBe(true)
  expect(toOrder(s)).toEqual([{ task: 3 }, { title: 'clean holes' }, { task: 4 }])
})
test('cannot link a piece to itself', () => {
  const s = initEditor([{ num: 1, title: 'a' }])
  expect(editorReducer(s, { type: 'link', fromPiece: 0, toPiece: 0 })).toBe(s)
})
```

- [ ] **Step 2: Run** — expect FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** — expect PASS.
- [ ] **Step 5: Manual check**: insert a task between two others on a branch; the new stop appears between them and later stops shift right.
- [ ] **Step 6: Commit**

---

### Task 12: Summary tab

**Files:**
- Create: `src/web/SummaryTab.tsx`
- Modify: `src/web/App.tsx`
- Test: `tests/web/SummaryTab.test.tsx`

**Interfaces:**
- Consumes: `api.getSummary`, `api.updateSummary`, `api.listSummaryVersions`, `api.createCheckpoint`.
- Produces: `SummaryTab({ projectId })` — live version as a Markdown textarea (raw text, my call) with `Save`, `Copy` (`navigator.clipboard.writeText(body)`), and `Checkpoint` (confirm dialog "Freeze v<n> and start v<n+1> as a copy?"). Below: older versions, newest first, each read-only with its own `Copy`. Reloads on the project's `changed` events so Claude's notes appear live; if I have unsaved edits when an event arrives, keep my text and show "Claude updated the summary. Reload to see it." instead of overwriting.

- [ ] **Step 1: Write the failing tests**

```ts
// @vitest-environment jsdom
test('copy puts the exact live body on the clipboard', async () => { /* mock getSummary → md; click Copy; expect writeText called with md */ })
test('unsaved edits are not overwritten by a live update', async () => { /* type, fire changed, expect textarea keeps typed text and notice shows */ })
test('checkpoint asks first and then calls createCheckpoint', async () => { /* confirm → true; expect createCheckpoint(1) */ })
```
(Write each with concrete `expect` calls as described in the comment; values are the strings above.)

- [ ] **Step 2: Run** — expect FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** — expect PASS.
- [ ] **Step 5: Commit**

---

### Task 13: Container and Claude Desktop setup

**Files:**
- Create: `Dockerfile`, `.dockerignore`, `compose.yaml`
- Modify: `README.md`

**Interfaces:**
- Consumes: `npm run build` output: `dist/server/index.js`, `dist/mcp/index.js`, `dist/web/`.
- Produces: image `greymatter`, container `greymatter`, port `127.0.0.1:4747`, volume `${GREYMATTER_DATA:-~/.greymatter}:/data`, env `DB_PATH=/data/greymatter.db`, `restart: unless-stopped`, healthcheck `node -e "fetch('http://127.0.0.1:4747/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"`.

- [ ] **Step 1: Write the Dockerfile** — two stages on `node:26-slim`: build (`npm ci`, `npm run build`, `npm prune --omit=dev`), runtime (copy `dist`, `node_modules`, `package.json`; `USER node`; `CMD ["node","dist/server/index.js"]`). `.dockerignore`: `node_modules dist data .git .superpowers`.
- [ ] **Step 2: Write `compose.yaml`** with the values above.
- [ ] **Step 3: Build and run**

Run: `docker compose up -d --build && sleep 5 && curl -s localhost:4747/api/health`
Expected: `{"ok":true}`

- [ ] **Step 4: Check data survives a rebuild**

Run: `curl -s -X POST localhost:4747/api/projects -H 'content-type: application/json' -d '{"name":"Smoke"}' && docker compose down && docker compose up -d && sleep 5 && curl -s localhost:4747/api/projects`
Expected: list contains `"name":"Smoke"`.

- [ ] **Step 5: Check the MCP server over stdio**

Run: `printf '%s\n' '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"smoke","version":"0"}}}' | docker exec -i greymatter node dist/mcp/index.js | head -c 300`
Expected: a JSON response containing `"serverInfo":{"name":"greymatter"`.

- [ ] **Step 6: Write README** — what it is (two lines), `docker compose up -d --build`, open `http://localhost:4747`, and Claude Desktop config:

macOS (`~/Library/Application Support/Claude/claude_desktop_config.json`):
```json
{ "mcpServers": { "greymatter": { "command": "docker", "args": ["exec", "-i", "greymatter", "node", "dist/mcp/index.js"] } } }
```
Windows + WSL (`%APPDATA%\Claude\claude_desktop_config.json`):
```json
{ "mcpServers": { "greymatter": { "command": "wsl", "args": ["docker", "exec", "-i", "greymatter", "node", "dist/mcp/index.js"] } } }
```
Plus: data lives in `~/.greymatter` (override with `GREYMATTER_DATA`); back it up by copying that folder while the container is stopped.

- [ ] **Step 7: Delete the smoke project data** (`docker compose down`, remove `~/.greymatter/greymatter.db*` only if it holds nothing but the smoke project), then commit.
