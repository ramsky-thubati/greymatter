# Project Status and Delete Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the user mark a project complete or in progress, or delete it, from a header menu, and group completed projects on Home under a collapsed "Completed" section.

**Architecture:** A `status` column on `projects`, set through `PATCH /api/projects/:pid` and exposed on `Project`. `DELETE /api/projects/:pid` removes the project and all its rows. On the web side, a Radix dropdown sits in the project header's `end` slot, and Home splits its list using a native `<details>`.

**Tech Stack:** TypeScript, node:sqlite, Hono + zod, React 19, @radix-ui/react-dropdown-menu, vitest + @testing-library/react.

**Spec:** `docs/superpowers/specs/2026-11-24-project-status-design.md`

## Global Constraints

- Status values are exactly `in_progress` and `complete`. The default is `in_progress`.
- Menu labels: `Mark as Complete`, `Mark as In Progress`, `Delete Project`. Only the status that isn't current shows. Delete comes after a separator and uses the `danger` class.
- Delete confirm: title `Delete "<name>"?`, body `This removes all its branches, tasks and summaries. It can't be undone.`, confirm label `Delete`, destructive.
- Home section label: `Completed (N)`, collapsed on every load, hidden when N is 0.
- A complete project stays fully editable. MCP tools don't change.
- No comments where the code is self-evident (user rule).

## Review Focus

1. **An existing DB with no `status` column.** It must migrate. The current `migrate()` returns early once `branches.color` exists, so a status migration added after that return would never run. Test in Task 1.
2. **Deleting a project that has tasks, blockers, checkpoints and several branches** must not hit a foreign key error (`branches.project_id` and `tasks.branch_id` are FKs). Test in Task 1.
3. **`DELETE` or `PATCH` on an unknown project id** returns 404. The `/api/projects/:pid/*` middleware doesn't match `/api/projects/:pid` itself, so the core functions must throw `not_found`. Test in Task 2.
4. **Every project complete:** Home must not show "No projects yet." The hint shows only when there are zero projects in total. Test in Task 4.
5. **An unknown status value** like `{ status: 'done' }` returns 400. Test in Task 2.

---

### Task 1: Core: status column, setProjectStatus, deleteProject

**Files:**
- Modify: `src/core/types.ts` (Project)
- Modify: `src/core/db.ts` (SCHEMA + `migrate`)
- Modify: `src/core/projects.ts`
- Test: `tests/core/projects.test.ts`

**Interfaces:**
- Produces:
  - `export type ProjectStatus = 'in_progress' | 'complete'` in `types.ts`
  - `Project` gains `status: ProjectStatus`
  - `setProjectStatus(db: Db, id: number, status: ProjectStatus): Project`, which throws `DomainError('not_found')` for an unknown id
  - `deleteProject(db: Db, id: number): void`, which throws `DomainError('not_found')` for an unknown id
  - `createProject`, `listProjects`, `getProject` and `findProjectByName` all return `status`

- [ ] **Step 1: Write the failing tests** in `tests/core/projects.test.ts`

```ts
test('new project is in_progress; status can be toggled', () => {
  const p = createProject(db, 'Status one')
  expect(p.status).toBe('in_progress')
  expect(setProjectStatus(db, p.id, 'complete').status).toBe('complete')
  expect(getProject(db, p.id).status).toBe('complete')
  expect(listProjects(db).find((x) => x.id === p.id)?.status).toBe('complete')
  expect(setProjectStatus(db, p.id, 'in_progress').status).toBe('in_progress')
})

test('deleteProject removes project and all its rows', () => {
  const p = createProject(db, 'Doomed')
  const main = mainBranchId(db, p.id)
  createTask(db, p.id, { branchId: main, title: 'a' })
  createTask(db, p.id, { branchId: main, title: 'b' })
  addBlocker(db, p.id, 2, 1)
  createBranch(db, p.id, { name: 'side', fromTaskNum: 1 })
  addCheckpoint(db, p.id, 99)
  deleteProject(db, p.id)
  expect(() => getProject(db, p.id)).toThrow(expect.objectContaining({ code: 'not_found' }))
  for (const table of ['branches', 'tasks', 'blockers', 'summary_versions', 'checkpoints'])
    expect(db.prepare(`SELECT COUNT(*) AS n FROM ${table} WHERE project_id=?`).get(p.id)).toEqual({ n: 0 })
})

test('unknown id is not_found for status and delete', () => {
  expect(() => setProjectStatus(db, 9999, 'complete')).toThrow(expect.objectContaining({ code: 'not_found' }))
  expect(() => deleteProject(db, 9999)).toThrow(expect.objectContaining({ code: 'not_found' }))
})

test('old db without status column migrates to in_progress', () => {
  const path = join(mkdtempSync(join(tmpdir(), 'gm-')), 'old.db')
  const raw = new DatabaseSync(path)
  raw.exec(`CREATE TABLE projects (id INTEGER PRIMARY KEY, name TEXT NOT NULL UNIQUE COLLATE NOCASE,
    next_task_num INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL);
    INSERT INTO projects (name, created_at) VALUES ('legacy', '2026-01-01')`)
  raw.close()
  expect(listProjects(openDb(path))).toEqual([{ id: 1, name: 'legacy', status: 'in_progress' }])
})
```

Imports: `createBranch` and `createTask` from `src/core/tasks.js`, `addBlocker` from `src/core/blockers.js`, `mainBranchId` and `addCheckpoint` from `./helpers.js`, `DatabaseSync` from `node:sqlite`, `mkdtempSync` from `node:fs`, `tmpdir` from `node:os` and `join` from `node:path`. The `branches` table `CREATE TABLE IF NOT EXISTS` runs after the legacy `projects` table, so the color migration also runs on this DB. That's fine.

- [ ] **Step 2: Run the tests and confirm they fail**

Run: `npx vitest run tests/core/projects.test.ts`
Expected: FAIL. `setProjectStatus` and `deleteProject` aren't exported, and `status` is undefined.

- [ ] **Step 3: Implement**
  - SCHEMA `projects` gets `status TEXT NOT NULL DEFAULT 'in_progress' CHECK (status IN ('in_progress','complete'))`.
  - Split `migrate()` into two independent checks, one for the `branches.color` migration as it is today and one that runs `ALTER TABLE projects ADD COLUMN status ...` with the same definition when `PRAGMA table_info(projects)` lacks `status`. Neither may early-return past the other.
  - Every project SELECT includes `status`, and `toProject` maps it.
  - `deleteProject` runs in `tx`, calls `getProject` first (for the not_found throw), then deletes from `blockers`, `tasks`, `checkpoints`, `summary_versions`, `branches` and `projects`, in that order.

- [ ] **Step 4: Run all core tests and confirm they pass**

Run: `npx vitest run tests/core`
Expected: PASS

- [ ] **Step 5: Commit** with message `feat(core): project status and delete`

---

### Task 2: API: PATCH and DELETE project, web client

**Files:**
- Modify: `src/server/app.ts`
- Modify: `src/web/api.ts`
- Test: `tests/server/api.test.ts`

**Interfaces:**
- Consumes: `setProjectStatus` and `deleteProject` from Task 1
- Produces:
  - `PATCH /api/projects/:pid` with body `{ status: 'in_progress' | 'complete' }` returns `200` and the `Project`
  - `DELETE /api/projects/:pid` returns `204`
  - `api.setProjectStatus(projectId: number, status: ProjectStatus): Promise<Project>`
  - `api.deleteProject(projectId: number): Promise<void>`

- [ ] **Step 1: Write the failing tests** in `tests/server/api.test.ts`

```ts
test('PATCH project status', async () => {
  const res = await patch(`/api/projects/${pid}`, { status: 'complete' })
  expect(res.status).toBe(200)
  expect((await res.json()).status).toBe('complete')
  const list = await (await get('/api/projects')).json()
  expect(list[0].status).toBe('complete')
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
```

- [ ] **Step 2: Run the tests and confirm they fail**

Run: `npx vitest run tests/server/api.test.ts`
Expected: FAIL with 404 on the new routes

- [ ] **Step 3: Implement the routes**

Add `projectPatchBody = z.object({ status: z.enum(['in_progress', 'complete']) })`. Both handlers call `mutated(pid, …)`, the same way the branch routes do, so open tabs refetch. Add the two methods to `api` in `src/web/api.ts`, next to `createProject`.

- [ ] **Step 4: Run the tests and confirm they pass**

Run: `npx vitest run tests/server`
Expected: PASS

- [ ] **Step 5: Commit** with message `feat(server): patch and delete project routes`

---

### Task 3: Web: project menu in header

**Files:**
- Create: `src/web/ProjectMenu.tsx`
- Modify: `src/web/ui/icons.tsx` (add `MoreIcon`: three dots, 16×16, same `base` style)
- Modify: `src/web/App.tsx` (header `end`, delete confirm, navigate home)
- Test: `tests/web/App.test.tsx`

**Interfaces:**
- Consumes: `api.setProjectStatus` and `api.deleteProject` from Task 2
- Produces: `ProjectMenu({ status, onStatus, onDelete }: { status: ProjectStatus; onStatus(s: ProjectStatus): void; onDelete(): void })`

- [ ] **Step 1: Write the failing tests** in `tests/web/App.test.tsx`

Add `status: 'in_progress'` to the `graph.project` and `listProjects` fixtures. Radix dropdowns open on `fireEvent.pointerDown(trigger, { button: 0 })`, the same as in `tests/web/TaskDialog.test.tsx`.

```ts
test('project menu marks complete', async () => {
  const set = vi.spyOn(api, 'setProjectStatus').mockResolvedValue({ id: 1, name: 'demo', status: 'complete' })
  window.location.hash = '#/projects/1'
  render(<App />)
  fireEvent.pointerDown(await screen.findByRole('button', { name: 'Project menu' }), { button: 0 })
  expect(screen.queryByRole('menuitem', { name: 'Mark as In Progress' })).toBeNull()
  fireEvent.click(screen.getByRole('menuitem', { name: 'Mark as Complete' }))
  await waitFor(() => expect(set).toHaveBeenCalledWith(1, 'complete'))
})

test('delete project confirms then goes home', async () => {
  const del = vi.spyOn(api, 'deleteProject').mockResolvedValue()
  window.location.hash = '#/projects/1'
  render(<App />)
  fireEvent.pointerDown(await screen.findByRole('button', { name: 'Project menu' }), { button: 0 })
  fireEvent.click(screen.getByRole('menuitem', { name: 'Delete Project' }))
  expect(screen.getByText('Delete "demo"?')).toBeTruthy()
  expect(del).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: 'Delete' }))
  await waitFor(() => expect(del).toHaveBeenCalledWith(1))
  await waitFor(() => expect(window.location.hash).toBe('#/'))
})
```

- [ ] **Step 2: Run the tests and confirm they fail**

Run: `npx vitest run tests/web/App.test.tsx`
Expected: FAIL. There's no "Project menu" button.

- [ ] **Step 3: Implement**
  - `ProjectMenu` follows the `StateMenu` structure: `Menu.Root modal={false}`, with the trigger being `<button className="btn flat" aria-label="Project menu"><MoreIcon /></button>` and the content using `align="end"`. It holds one `Menu.Item` for the opposite status, then `Menu.Separator className="menu-sep"`, then a `Menu.Item className="menu-item danger"`.
  - In `App.tsx`, pass `end={graph && <ProjectMenu …/>}`. `onStatus` calls `api.setProjectStatus`, with `.catch` going to `toast.error(errorText(e))`. `onDelete` sets new state `deletingProject`, which renders `ConfirmAlert` with the copy from Global Constraints. On confirm it awaits `api.deleteProject` and calls `navigate({ name: 'home' })`, with errors going to a toast.
  - Clear `deletingProject` in the existing `[projectId]` reset effect.

- [ ] **Step 4: Run the web tests and confirm they pass**

Run: `npx vitest run tests/web`
Expected: PASS

- [ ] **Step 5: Commit** with message `feat(web): project menu for status and delete`

---

### Task 4: Web: Completed section on Home

**Files:**
- Modify: `src/web/Home.tsx`
- Modify: `src/web/styles/components.css` (style the `<details>` summary like `.group-title`, with a chevron that rotates when open)
- Test: `tests/web/App.test.tsx`

**Interfaces:**
- Consumes: `Project.status` from Task 1

- [ ] **Step 1: Write the failing tests**

```ts
test('home groups completed projects in a collapsed section', async () => {
  vi.mocked(api.listProjects).mockResolvedValue([
    { id: 1, name: 'demo', status: 'in_progress' },
    { id: 2, name: 'other', status: 'complete' },
  ])
  render(<App />)
  const summary = await screen.findByText('Completed (1)')
  expect((summary.closest('details') as HTMLDetailsElement).open).toBe(false)
  expect(summary.closest('details')?.textContent).toContain('other')
  expect(screen.getByText('demo').closest('details')).toBeNull()
})

test('no Completed section when none complete; no empty hint when all complete', async () => {
  vi.mocked(api.listProjects).mockResolvedValue([{ id: 2, name: 'other', status: 'complete' }])
  render(<App />)
  await screen.findByText('Completed (1)')
  expect(screen.queryByText('No projects yet.')).toBeNull()
  cleanup()
  vi.mocked(api.listProjects).mockResolvedValue([{ id: 1, name: 'demo', status: 'in_progress' }])
  render(<App />)
  await screen.findByText('demo')
  expect(screen.queryByText(/^Completed/)).toBeNull()
})
```

- [ ] **Step 2: Run the tests and confirm they fail**

Run: `npx vitest run tests/web/App.test.tsx`
Expected: FAIL. "Completed (1)" isn't found.

- [ ] **Step 3: Implement**

Split `projects` by `status`. In-progress projects render in the existing `.boxed` list, which is skipped when empty. The complete ones render in `<details className="completed"><summary>Completed (N)</summary><div className="boxed">…rows…</div></details>`. There's no `open` attribute, so it starts collapsed. Pull the row button out into a local `ProjectRow` so both lists share it. Keep "No projects yet." only for `projects.length === 0`.

- [ ] **Step 4: Run the full suite and typecheck, and confirm both pass**

Run: `npm test && npm run typecheck`
Expected: all PASS, no type errors

- [ ] **Step 5: Commit** with message `feat(web): completed projects section on home`
