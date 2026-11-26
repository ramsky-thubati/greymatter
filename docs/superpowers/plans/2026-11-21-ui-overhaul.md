# UI Overhaul Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the greymatter web UI so it looks and behaves like a native GNOME/Ubuntu app, scales with the screen, and follows one set of rules everywhere.

**Architecture:** A server change adds a stored colour per branch. The web app gets CSS tokens in rem, a small set of UI primitives built on Radix (dialog, alert, menus, popover, toast), hash routing with a Home screen, and a graph made of HTML task cards placed over an SVG line layer. Dialogs keep a local draft and only write on Save.

**Tech Stack:** React 19, TypeScript, Vite 8, Vitest 5 + Testing Library (jsdom), Hono server, node:sqlite, Radix UI primitives, `@fontsource/ubuntu-sans`.

**Spec:** `docs/superpowers/specs/2026-11-21-ui-overhaul-design.md` (read it first; this plan argues from it).

## Global Constraints

- No `px` in any web CSS or inline style. Root size: `html { font-size: clamp(0.9rem, 0.6rem + 0.5vw, 1.25rem); }`. Everything else in `rem` (or `em` for text-relative sizes). Graph layout numbers are rem.
- Accent `#e95420`. Status colours: done `#26a269`, in progress `#3584e4`, to do `#77767b` (hollow ring), later `#e5a50a`, cancelled `#c0bfbc`. Destructive/blocked red `#c01c28`.
- Font: Ubuntu Sans from `@fontsource/ubuntu-sans`, bundled. No network font loading.
- Light and dark themes, dark via `prefers-color-scheme`.
- No `window.confirm`, no `alert()`, no red error bar anywhere in `src/web`.
- Dialogs: ✕ top-right, no Cancel button, Save bottom-right (disabled until dirty), Delete bottom-left, Enter never submits, nothing persists before Save, closing while dirty asks "Discard changes?" (**Keep editing** / **Discard**).
- Every dialog and alert dims the window. Menus and popovers don't.
- State labels (exact copy): `To do`, `In progress`, `Later`, `Done`, `Cancelled`. Menu order: To do, In progress, Later, Done, Cancelled.
- MCP tools don't change. The branch order endpoint (`PUT …/order`) stays on the server; only the web link editor goes.
- Code comments only where the code doesn't already say it (user rule).
- Commit messages: Conventional Commits, compressed (user uses the `caveman-commit` style), ending with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **Very long branch names and task titles.** A 60-character branch name must not overlap cards; titles clamp to two lines. Test in Task 4.
2. **Branches with no tasks, and a brand-new project with only an empty `main`.** The graph shows the pill and the add-task circle and nothing crashes. Tests in Tasks 4 and 5.
3. **The graph refreshes (SSE) while a dialog has unsaved edits.** The draft must survive the refresh, and the dialog must close if its task or branch disappears. Tests in Tasks 8 and 9.
4. **Partial save failure** (title saved, blocker add rejected as a cycle). The saved part stops showing as dirty, the rejected part stays in the draft, and a toast shows the error. Test in Task 8.
5. **Bad colour input** (a hex like `#12`, or uppercase `#ABCDEF`). Save stays disabled for invalid hex; uppercase is accepted and stored lowercase. Tests in Tasks 1 and 9.

---

## File Map

Server and core:
- Create `src/core/colors.ts`: branch colour rotation and hex check.
- Modify `src/core/db.ts`: add the `color` column with a one-off backfill.
- Modify `src/core/types.ts`, `src/core/tasks.ts`, `src/core/projects.ts`, `src/core/graph.ts`, `src/server/app.ts`.

Web (new layout):
- `src/web/styles/tokens.css`, `src/web/styles/components.css`, `src/web/styles/graph.css` replace `src/web/styles.css`.
- `src/web/ui/`: `Dialog.tsx`, `ConfirmAlert.tsx`, `Toast.tsx`, `StatusDot.tsx`, `StateMenu.tsx`, `icons.tsx`.
- `src/web/route.ts`, `src/web/HeaderBar.tsx`, `src/web/Home.tsx`, `src/web/App.tsx` (rewrite).
- `src/web/layout.ts` (rewrite), `src/web/blockers.ts` (extend), `src/web/impact.ts`.
- `src/web/graph/`: `GraphView.tsx`, `TaskCard.tsx`, `BlockerPopover.tsx`, `CardMenu.tsx`, `Legend.tsx`.
- `src/web/dialogs/`: `TaskDialog.tsx`, `NewTaskDialog.tsx`, `BranchDialog.tsx`, `NewBranchDialog.tsx`, `NewProjectDialog.tsx`, `ColorPicker.tsx`, `DeleteAlert.tsx`.
- `src/web/taskDraft.ts`, `src/web/color.ts`.
- `src/web/SummaryTab.tsx` (rework).

Deleted: `src/web/MetroMap.tsx`, `src/web/Popup.tsx`, `src/web/TaskPopup.tsx`, `src/web/BranchPopup.tsx`, `src/web/CreatePopups.tsx`, `src/web/LinkEditor.tsx`, `src/web/editorState.ts`, `src/web/styles.css`, `tests/web/LinkEditor.test.tsx`, `tests/web/editorState.test.ts`, `tests/web/TaskPopup.test.tsx`.

---

### Task 1: Branch colour on the server

**Files:**
- Create: `src/core/colors.ts`
- Modify: `src/core/db.ts`, `src/core/types.ts`, `src/core/tasks.ts:13-98`, `src/core/projects.ts:23`, `src/core/graph.ts:79-95`, `src/server/app.ts:25-30,165-173`
- Test: `tests/core/colors.test.ts`, `tests/core/db.test.ts`, `tests/core/tasks.test.ts`, `tests/server/api.test.ts`

**Interfaces:**
- Produces: `BRANCH_COLORS: readonly string[]` = `['#613583', '#c061cb', '#865e3c', '#0e7c86', '#813d9c', '#a8507a']`; `isHexColor(s: string): boolean` (`/^#[0-9a-f]{6}$/i`); `Branch.color: string` (always lowercase `#rrggbb`); `updateBranch(db, pid, bid, { name?, purpose?, color? })`; PATCH `/api/projects/:pid/branches/:bid` accepts `color`; `GraphBranch.color` via `Branch`.

- [ ] **Step 1: Write failing tests**

  - `tests/core/colors.test.ts` → `test('rotation avoids status colours')`: none of `BRANCH_COLORS` equals `#26a269`, `#3584e4`, `#77767b`, `#e5a50a`, `#c0bfbc`, `#c01c28`, `#e95420`; all pass `isHexColor`. `test('isHexColor')`: true for `#abcdef` and `#ABCDEF`, false for `#12`, `abcdef`, `#abcdeg`.
  - `tests/core/tasks.test.ts` → `test('new branches take the next rotation colour')`: in a new project, `main` (from `createProject`) has `BRANCH_COLORS[0]`; the next two `createBranch` calls get `[1]` and `[2]`; the 7th branch wraps to `[0]`.
  - `tests/core/tasks.test.ts` → `test('updateBranch stores colour lowercase')`: `updateBranch(..., { color: '#ABCDEF' }).color === '#abcdef'`.
  - `tests/core/db.test.ts` → `test('backfills colour on an old database')`: create a file DB, run the old schema by hand (branches without `color`), insert two projects with 2 and 3 branches, then `openDb` it. Each project's branches, ordered by `created_at, id`, have `BRANCH_COLORS[0..n-1]`. Opening a second time changes nothing.
  - `tests/server/api.test.ts` → `test('PATCH branch colour')`: `{ color: '#00ff00' }` gives 200 and `color: '#00ff00'` in `/graph`; `{ color: '#00ff0' }` and `{ color: 'green' }` give 400.

- [ ] **Step 2: Run `npx vitest run tests/core tests/server` and confirm the new tests fail.**

- [ ] **Step 3: Implement**

  - `src/core/colors.ts`: the constant and `isHexColor`.
  - `src/core/db.ts`: after `db.exec(SCHEMA)`, call `migrate(db)`. If `PRAGMA table_info(branches)` has no `color`, then in one `tx`: run `ALTER TABLE branches ADD COLUMN color TEXT`, and for each project set colours by rotation over `ORDER BY created_at, id`. Add `color TEXT` to the `CREATE TABLE branches` text too, so new DBs have it from the start (the migration then sees the column and skips).
  - `Branch` gets `color: string`. `BranchRow` gets `color: string | null`; `toBranch` maps a null colour to `BRANCH_COLORS[0]` (it can't happen after migration).
  - `createBranch` and the `main` insert in `createProject` store `BRANCH_COLORS[count % length]`, where `count` is the number of existing branches in the project.
  - `updateBranch` accepts `color`. It throws `DomainError('invalid', 'Colour must be #rrggbb')` when `!isHexColor`, and stores `toLowerCase()`.
  - `graph.ts` maps `color` into `GraphBranch`.
  - `branchPatchBody` gets `color: z.string().optional()`; the handler passes it to `updateBranch` (core does the validation, which already maps `invalid` to 400).

- [ ] **Step 4: Run `npx vitest run` and expect everything to pass.** `tests/mcp/tools.test.ts` may need `color` added to fixture branches; add it there and nothing else in MCP.

- [ ] **Step 5: Commit** `feat(core): stored branch colour`

---

### Task 2: Foundations: deps, tokens, UI primitives, remove link editor

**Files:**
- Modify: `package.json`, `vitest.config.ts`, `src/web/main.tsx`
- Create: `tests/web/setup.ts`, `src/web/styles/tokens.css`, `src/web/styles/components.css`, `src/web/ui/Dialog.tsx`, `src/web/ui/ConfirmAlert.tsx`, `src/web/ui/Toast.tsx`, `src/web/ui/StatusDot.tsx`, `src/web/ui/StateMenu.tsx`, `src/web/ui/icons.tsx`
- Test: `tests/web/ui.test.tsx`

**Interfaces:**
- Produces:
  - `Dialog(props: { title?: ReactNode; headerStart?: ReactNode; dirty: boolean; onClose(): void; footerStart?: ReactNode; footerEnd?: ReactNode; children: ReactNode })`. It is always open while mounted. ✕, Esc and an outside click call `onClose` directly when `!dirty`; when dirty they open the discard alert, and **Discard** calls `onClose`.
  - `ConfirmAlert(props: { title: string; body?: ReactNode; confirmLabel: string; cancelLabel?: string | null; destructive?: boolean; onConfirm(): void; onCancel(): void })`. Always open while mounted. `cancelLabel` defaults to `'Cancel'`; `null` means a single confirm button.
  - `ToastProvider({ children })` and `useToast(): { error(message: string, retry?: () => void): void }`.
  - `STATES: readonly TaskState[]` (spec order), `STATE_LABEL: Record<TaskState, string>`, `StatusDot({ state }: { state: TaskState })`, which renders `<i class="dot dot-<state>" aria-label={STATE_LABEL[state]}>`.
  - `StateMenu({ value, onChange, trigger }: { value: TaskState; onChange(s: TaskState): void; trigger: ReactNode })`: a Radix DropdownMenu listing `STATES`, each with a dot and a tick on `value`.
  - `icons.tsx`: `PadlockIcon`, `FlagIcon`, `BranchIcon`, `PlusIcon`, `CloseIcon`, `WarnIcon`, as inline SVGs sized `1em`.
  - CSS classes the later tasks use: `.btn`, `.btn.flat`, `.btn.suggested`, `.btn.destructive`, `.btn.destructive-text`, `.btn.circular`, `.boxed`, `.row`, `.row.area`, `.field-label`, `.group-title`, `.headerbar`, `.dlg`, `.dlg-footer`, `.alert`, `.menu`, `.menu-item`, `.menu-sep`, `.popover`, `.toast`, `.dot`, `.dot-<state>`, `.dim`.

- [ ] **Step 1: Install**

  ```bash
  npm i @radix-ui/react-dialog @radix-ui/react-alert-dialog @radix-ui/react-dropdown-menu @radix-ui/react-context-menu @radix-ui/react-popover @radix-ui/react-toast @fontsource/ubuntu-sans
  ```

  In `tests/web/setup.ts`, add jsdom polyfills that Radix needs: `ResizeObserver`, `Element.prototype.hasPointerCapture`/`releasePointerCapture`/`scrollIntoView`, and `DOMRect`. Guard each with `typeof window !== 'undefined'`. Register it in `vitest.config.ts` as `setupFiles`.

- [ ] **Step 2: Write failing tests in `tests/web/ui.test.tsx`**
  - `Dialog closes at once when clean`: render with `dirty={false}`, click the ✕ (`getByRole('button', { name: 'Close' })`), and `onClose` is called once.
  - `Dialog asks before discarding`: with `dirty`, press Escape. `onClose` isn't called and an alertdialog named "Discard changes?" shows. **Keep editing** leaves the dialog open with `onClose` still uncalled. **Discard** calls `onClose`.
  - `Enter does not submit`: a dialog containing `<input>` and `footerEnd={<button onClick={save}>Save</button>}`; pressing Enter in the input doesn't call `save`.
  - `ConfirmAlert single button`: with `cancelLabel={null}`, only one button renders.
  - `StateMenu`: open the trigger (`fireEvent.pointerDown(trigger, { button: 0 })`). There are five `menuitemradio` (or `menuitem`) entries in spec order with the spec labels. Clicking `Later` calls `onChange('later')`.
  - `Toast`: `error('Boom')` from a child shows the text "Boom"; with a retry, the "Retry" button calls it.

- [ ] **Step 3: Run `npx vitest run tests/web/ui.test.tsx` and confirm failures.**

- [ ] **Step 4: Implement the primitives and the CSS**

  - Tokens: the root clamp, type scale, spacing scale, radii, control height (`2.1rem`), shadows, and status/accent colours as custom properties, with a dark-mode block. Values come from mockup v5–v8 (`.superpowers/brainstorm/44059-1795264694/content/`).
  - Import `@fontsource/ubuntu-sans/400.css`, `500.css`, `600.css` and `700.css` in `main.tsx`.
  - `Dialog` uses Radix Dialog with `.dim` as its overlay, and `onEscapeKeyDown`/`onPointerDownOutside`/`onInteractOutside` call `e.preventDefault()` when dirty and open the discard alert instead.
  - `ConfirmAlert` uses Radix AlertDialog.
  - Don't wire anything into `App` yet. The old `styles.css` stays imported until Task 3, so the current app keeps working.

- [ ] **Step 5: Run `npx vitest run` and expect a pass** (old web tests untouched).

- [ ] **Step 6: Commit** `feat(web): radix ui primitives, rem tokens`

---

### Task 3: Routing, header bar, Home, app shell

**Files:**
- Create: `src/web/route.ts`, `src/web/HeaderBar.tsx`, `src/web/Home.tsx`, `src/web/dialogs/NewProjectDialog.tsx`
- Modify (rewrite): `src/web/App.tsx`
- Test: `tests/web/route.test.ts`, `tests/web/App.test.tsx` (rewrite)

**Interfaces:**
- Consumes: `Dialog`, `ToastProvider`/`useToast` (Task 2).
- Produces:
  - `type Route = { name: 'home' } | { name: 'project'; projectId: number; tab: 'graph' | 'summary' }`
  - `parseHash(hash: string): Route`: `''`, `'#/'` and anything unknown give home; `'#/projects/3'` gives graph; `'#/projects/3/summary'` gives summary.
  - `routeHash(r: Route): string`, the inverse.
  - `useRoute(): [Route, (r: Route) => void]`, which listens to `hashchange`.
  - `HeaderBar({ start, center, end }: { start?: ReactNode; center?: ReactNode; end?: ReactNode })`.
  - `App` keeps `summaryDirty` and asks through `ConfirmAlert` ("Discard changes?") before leaving a dirty summary (Home click, Graph click, or browser back). On back, it restores the hash if the user keeps editing.
  - `App` renders `<GraphView>` (Task 5) and `<SummaryTab>`. Until Task 5 lands, render a placeholder `<div data-testid="graph">`.

- [ ] **Step 1: Write failing tests**
  - `route.test.ts`: the parse/format pairs above, and `parseHash('#/projects/abc')` gives home.
  - `App.test.tsx`:
    - `lands on Home and lists projects`: there's a list row "demo", and no `<select>` exists.
    - `opening a project shows Home link, name and switcher`: click "demo", and the hash becomes `#/projects/1`. There's a "Home" button, the text "demo", and Graph and Summary buttons. No "+ Branch" or "+ Task" buttons exist.
    - `Home button returns to the list`.
    - `New project`: click "New project", type a name, click "Create project". `api.createProject` is called and the hash moves to the new project.
    - `leaving with unsaved summary asks first`: mark the summary dirty (type into the Summary textarea), click Home, and "Discard changes?" shows. Keep editing stays; Discard navigates. Clicking Graph while dirty asks the same.
    - `no localStorage use`: spy on `Storage.prototype.setItem` and it's never called.

- [ ] **Step 2: Run and confirm failures.**

- [ ] **Step 3: Implement.** Delete `src/web/Popup.tsx`, `TaskPopup.tsx`, `BranchPopup.tsx`, `CreatePopups.tsx`, `LinkEditor.tsx`, `editorState.ts`, `styles.css` and the tests `TaskPopup.test.tsx`, `LinkEditor.test.tsx`, `editorState.test.ts`. Move `subtreeBranchIds` from `BranchPopup.tsx` into `src/web/branchTree.ts` first (Task 9 uses it). `main.tsx` imports the new `styles/*.css` instead. Their replacements arrive in Tasks 7–9, so App stops importing them now. Wrap the app in `ToastProvider`. Errors from the project list go to `toast.error`.

- [ ] **Step 4: Run `npx vitest run tests/web/route.test.ts tests/web/App.test.tsx` and expect a pass.**

- [ ] **Step 5: Commit** `feat(web): hash routing, home screen, header bar`

---

### Task 4: Graph layout in rem

**Files:**
- Modify (rewrite): `src/web/layout.ts`
- Test: `tests/web/layout.test.ts` (rewrite)

**Interfaces:**
- Produces:

  ```ts
  export const CARD_W = 10, CARD_H = 4.75, STEP = 12, LANE_H = 8, TOP = 3.5, LABEL_GAP = 1.25, ADD_GAP = 3
  export function labelWidth(name: string): number   // 1.8 + 0.55 * name.length, rem
  export interface Layout {
    width: number; height: number
    lanes: { branchId: number; y: number; color: string; stuck: boolean
             labelX: number; labelW: number; lineEndX: number; addX: number }[]
    cards: { num: number; x: number; y: number }[]          // x = left edge, y = centre
    forks: { branchId: number; from: { x: number; y: number }; to: { x: number; y: number } }[]
    checkpoints: { x: number; label: string }[]              // label "v1 → v2"
  }
  export function computeLayout(graph: Graph): Layout
  ```

- [ ] **Step 1: Write failing tests** (build `Graph` fixtures inline, like today's `layout.test.ts`)
  - `lanes follow tree order`: lane rows are tree order (top-level branches by `created_at`, children after their parent), with y = `TOP + i * LANE_H`.
  - `lane colour comes from the branch`: `lanes[i].color === branch.color`.
  - `cards never overlap`: for every pair of cards in one lane, `Math.abs(a.x - b.x) >= CARD_W`. Check it across a fixture of 3 branches and 9 tasks.
  - `label sits left of the first card`: for each lane with tasks, `labelX + labelW + LABEL_GAP <= firstCard.x`.
  - `forked label starts after the fork point`: `labelX > parentCard.x + CARD_W / 2`.
  - `long branch name pushes cards right` (Review Focus 1): a branch forked from T-1 with a 60-character name whose first task is the very next sequence still satisfies the two label tests above.
  - `empty branch` (Review Focus 2): a project with only `main` and no tasks gives `cards.length === 0`, one lane, and `addX > labelX + labelW`. No throw.
  - `add circle after last card`: `addX === lastCard.x + CARD_W + ADD_GAP`.
  - `checkpoint gets its own column`: a checkpoint between seq 2 and 3 has `x` strictly between those two cards' `x`, and label `'v1 → v2'`.
  - `size depends on screen-independent units only`: `width` and `height` are finite numbers, with no px conversion anywhere (assert `computeLayout` output for the 3-branch fixture equals a snapshot).

- [ ] **Step 2: Run and confirm failures.**

- [ ] **Step 3: Implement `computeLayout`**

  Walk the columns (tasks and checkpoints merged by `seq`) left to right with a running `x`. For each column:

  ```
  x = prevX + STEP                                   (first column: 0)
  if the column is the first task of its branch:
      labelX = branch is forked ? parentCardX + CARD_W/2 + 1.5 : 0.5
      x = max(x, labelX + labelWidth(name) + LABEL_GAP)
  ```

  Then for empty branches put `labelX` after the parent card (or `0.5`) and `addX = labelX + labelW + ADD_GAP`. Forks go from the parent card's bottom-centre to `(labelX, laneY)`. A checkpoint column takes `x + CARD_W / 2` as its line position. `width = max(addX) + 2`, `height = TOP + lanes * LANE_H`.

- [ ] **Step 4: Run `npx vitest run tests/web/layout.test.ts` and expect a pass.**

- [ ] **Step 5: Commit** `feat(web): rem graph layout with label room`

---

### Task 5: Graph view, cards, legend

**Files:**
- Create: `src/web/graph/GraphView.tsx`, `src/web/graph/TaskCard.tsx`, `src/web/graph/Legend.tsx`, `src/web/styles/graph.css`
- Modify: `src/web/blockers.ts`, `src/web/App.tsx` (swap the placeholder for `GraphView`)
- Delete: `src/web/MetroMap.tsx`
- Test: `tests/web/blockers.test.ts`, `tests/web/GraphView.test.tsx`

**Interfaces:**
- Consumes: `computeLayout`, `Layout`, the constants (Task 4); `StatusDot`, the icons (Task 2).
- Produces:
  - `blockers.ts`: `isFinished(s: TaskState): boolean`, `openBlockers(graph, task): number[]` (keep), `blocks(graph, num): GraphTask[]` (tasks whose `blockedBy` includes `num`), `showsPadlock(graph, task): boolean` (`openBlockers(...).length > 0`), `showsFlag(graph, task): boolean` (`!isFinished(task.state) && blocks(graph, task.num).some(t => !isFinished(t.state))`), `hasFork(graph, num): boolean`.
  - `GraphView(props: { graph: Graph; onOpenTask(num: number): void; onOpenBranch(branchId: number): void; onAddTask(branchId: number): void; onNewBranch(fromTask?: number): void; onDelete(target: DeleteTarget): void })`. `DeleteTarget` comes from Task 7. Until then, declare the prop and leave the menus out.
  - `TaskCard({ task, graph, onOpen, onBlockerIcon }: { …; onBlockerIcon(num: number, anchor: HTMLElement): void })`: an element with `role="button"`, `data-task="T-n"`, class `in-progress` when the state is `in_progress`, and class `cancelled` when cancelled.

- [ ] **Step 1: Write failing tests**
  - `blockers.test.ts`:
    - Padlock: shows when one blocker is `todo`, and not when every blocker is `done`/`cancelled`.
    - Flag: shows when the task is `todo` and blocks a `todo`. It doesn't show when the task is `done`, or when everything it blocks is `done`. (This is the user's approved rule.)
  - `GraphView.test.tsx` (jsdom), with a fixture of main T-1 done, T-2 done, T-3 in_progress (blocked by T-1, blocks T-5), a branch "Lighting" forked from T-2 with T-4 later and T-5 todo, and one checkpoint:
    - Each card shows its ID and title and no status words ("Done", "In progress" don't appear inside `[data-task]`).
    - T-3 has class `in-progress`.
    - Padlock and flag icons follow the rules. T-3 shows the flag and no padlock, since T-1 is done.
    - Only T-2 shows the branch indicator (`aria-label="Has a branch"`), and it isn't a button.
    - The branch pill "Lighting" is a button and calls `onOpenBranch(2)`.
    - Each lane has an add button named `Add task to <branch name>`, and clicking it calls `onAddTask(branchId)`.
    - A stuck branch shows a "stuck" pill.
    - A flagged task shows the warn icon with the title text "A blocker was cancelled. Check this task still makes sense."
    - The checkpoint label "v1 → v2" renders.
    - The legend lists the 5 states plus "Being worked on", "Blocked" and "Blocks another task".
    - No element has a `stroke-dasharray` blocker curve (`container.querySelectorAll('.blocker-curve').length === 0`).
    - Empty project (Review Focus 2): only an empty `main`, so a pill and an add button render, with no cards.

- [ ] **Step 2: Run and confirm failures.**

- [ ] **Step 3: Implement.** Draw cards and pills as absolutely positioned HTML using `rem` from the layout. The SVG layer uses `viewBox="0 0 {width} {height}"` with a CSS width/height of `{width}rem`/`{height}rem`, and stroke widths in viewBox units. Lane line: solid from `labelX` to the last card centre, then dotted to `addX`. Forks are metro-style (down, then along). Checkpoints are an accent dashed vertical line plus a pill at the top. Titles use a two-line clamp.

- [ ] **Step 4: Run `npx vitest run tests/web` and expect a pass for these files.**

- [ ] **Step 5: Commit** `feat(web): card graph, legend, status dots`

---

### Task 6: Blocker popover with remove confirmation

**Files:**
- Create: `src/web/graph/BlockerPopover.tsx`
- Modify: `src/web/graph/GraphView.tsx`
- Test: `tests/web/BlockerPopover.test.tsx`

**Interfaces:**
- Consumes: `blocks`, `isFinished` (Task 5); `ConfirmAlert`, `useToast`, `StatusDot` (Task 2); `api.removeBlocker`.
- Produces: `BlockerPopover({ projectId, graph, num, anchor, onOpenTask, onClose })`, a Radix Popover anchored to the clicked icon.

- [ ] **Step 1: Write failing tests**
  - Sections: clicking T-3's flag shows a "Blocks" section with "Pack away loose stuff · To do", and also a "Blocked by" section listing T-1 with "Done". Finished relations are listed. A task with no blockers shows no "Blocked by" heading.
  - Clicking a row calls `onOpenTask(5)` and closes the popover.
  - Clicking the row's ✕ opens an alert titled "Remove dependency?" whose body names both titles, e.g. `“Pack away loose stuff” will no longer be blocked by “Make sure garage is empty”.` **Cancel** calls nothing. **Remove** calls `api.removeBlocker(1, 'T-5', 'T-3')`.
  - A failed remove shows a toast with the error message.

- [ ] **Step 2: Run and confirm failures.** **Step 3: Implement.** **Step 4: Run and expect a pass.**

- [ ] **Step 5: Commit** `feat(web): blocker popover`

---

### Task 7: Right-click menus, double-click, delete alert

**Files:**
- Create: `src/web/graph/CardMenu.tsx`, `src/web/impact.ts`, `src/web/dialogs/DeleteAlert.tsx`
- Modify: `src/web/graph/GraphView.tsx`, `src/web/App.tsx`
- Test: `tests/web/impact.test.ts`, `tests/web/menus.test.tsx`

**Interfaces:**
- Consumes: `StateMenu` items (Task 2) for the Status submenu; `api.updateTask`, `api.deleteTask`, `api.deleteBranch`.
- Produces:
  - `type DeleteTarget = { kind: 'task'; num: number } | { kind: 'branch'; branchId: number }`
  - `deleteImpact(graph: Graph, t: DeleteTarget): { dependents: number[]; forkedBranches: number[] }`. For a branch: its own tasks; dependents are the tasks outside it that are blocked by them; forked branches are other branches whose root is one of them.
  - `DeleteAlert({ projectId, graph, target, onDone, onCancel })`:
    - If `forkedBranches` is non-empty: title "Can't delete yet", body `Branch <name> forks from this task. Move or delete it first.` (one line per branch; for a branch target say "from a task on this branch"), a single **OK**.
    - Otherwise: title `Delete T-3?` or `Delete branch <name>?` (for a branch with tasks: `Delete branch <name> and its N tasks?`). When there are dependents, the body is `T-5 is blocked by this task. This can't be undone.` (`T-5, T-6 are blocked by …` for several); else `This can't be undone.` Buttons **Cancel** / **Delete**. Delete calls the API with `{ confirm: true }` when there are dependents, otherwise without.
  - `CardMenu` wraps each `TaskCard` in a Radix ContextMenu with: **Status ›** (submenu of `STATES` with dots and a tick, which calls `api.updateTask(pid, 'T-n', { state })` right away), **Branch from here** (`onNewBranch(num)`), a separator, **Delete** (red, opens `DeleteAlert`).
  - The background ContextMenu on the graph area has **New branch** (`onNewBranch()`). A double-click on the background (not on a card, pill or button) calls `onNewBranch()`.

- [ ] **Step 1: Write failing tests**
  - `impact.test.ts`: dependents and forks for a task; for a branch, its own tasks are excluded from dependents.
  - `menus.test.tsx`:
    - `fireEvent.contextMenu` on T-1 shows the items in order: Status, Branch from here, Delete.
    - Status → Later calls `api.updateTask(1, 'T-1', { state: 'later' })`.
    - "Branch from here" calls `onNewBranch(1)`.
    - Delete → T-3 alert shows the dependents text, and confirming calls `api.deleteTask(1, 'T-3', { confirm: true })`.
    - Deleting a fork-point task shows "Can't delete yet" with a single OK, and no API call.
    - `fireEvent.contextMenu` on the background shows one item, "New branch", which calls `onNewBranch(undefined)`.
    - `fireEvent.doubleClick` on the background calls `onNewBranch(undefined)`; a double-click on a card doesn't.

- [ ] **Step 2: Run and confirm failures.** **Step 3: Implement.** **Step 4: Run and expect a pass.**

- [ ] **Step 5: Commit** `feat(web): card and canvas context menus`

---

### Task 8: Task dialog and New task dialog

**Files:**
- Create: `src/web/taskDraft.ts`, `src/web/dialogs/TaskDialog.tsx`, `src/web/dialogs/NewTaskDialog.tsx`
- Modify: `src/web/App.tsx` (open on `onOpenTask` / `onAddTask`)
- Test: `tests/web/taskDraft.test.ts`, `tests/web/TaskDialog.test.tsx`

**Interfaces:**
- Consumes: `Dialog`, `StateMenu`, `StatusDot`, `useToast` (Task 2); `DeleteAlert` (Task 7).
- Produces:
  - `interface TaskDraft { title: string; details: string; state: TaskState; blockedBy: number[] }`
  - `draftOf(t: GraphTask): TaskDraft`
  - `diffDraft(live: GraphTask, d: TaskDraft): { patch: { title?: string; details?: string; state?: TaskState }; add: number[]; remove: number[] }`
  - `isDirty(live, d): boolean`
  - `saveDraft(projectId: number, live: GraphTask, d: TaskDraft): Promise<void>`: PATCH first (if non-empty), then each `remove`, then each `add`, in order. It stops at the first error and rethrows it.
  - `TaskDialog({ projectId, graph, num, onClose, onOpenTask })`
  - `NewTaskDialog({ projectId, branchId, onClose })`: title "New task", fields Title and Details (optional), button **Add task** (disabled while the title is blank). It calls `api.createTask(pid, { branchId, title, details? })`. No branch name is shown.

- [ ] **Step 1: Write failing tests**
  - `taskDraft.test.ts`: `diffDraft` builds the patch/add/remove; `isDirty` is false right after `draftOf`; `saveDraft` call order is PATCH → removes → adds; it stops after the first failure.
  - `TaskDialog.test.tsx`:
    - Header: the state button reads "In progress" with a dot, with no "State" label. There's no title text in the header, and the title appears only in the Title input.
    - Save is disabled at first, and typing in Title enables it.
    - Changing state through the header menu makes no API call until Save.
    - Removing a blocker (✕ in "Blocked by") and adding one ("+ Add blocker" picker) make no API call until Save.
    - Save calls `updateTask` with only the changed fields, then `removeBlocker`/`addBlocker`.
    - Enter in Title doesn't save.
    - Closing while dirty shows "Discard changes?".
    - A flagged task shows the note "A blocker was cancelled. Check this task still makes sense."
    - There's no "Branch from here" button in the dialog.
    - Delete (bottom-left) opens `DeleteAlert`.
    - Review Focus 3: with an edited title, re-render with a new `graph` where the details changed on the server. The typed title is kept and the dialog stays open. Re-rendering with the task gone calls `onClose`.
    - Review Focus 4: make `addBlocker` reject with `ApiError(400, 'invalid', 'would create a cycle')` after `updateTask` resolves, then re-render with a graph that has the new title. A toast shows "would create a cycle", Save is still enabled (the blocker add is still pending), and the title no longer counts as changed.
  - `NewTaskDialog`: the heading is exactly "New task", and Add task calls `createTask` with the given `branchId`.

- [ ] **Step 2: Run and confirm failures.** **Step 3: Implement.** The draft lives in component state, initialised once from `draftOf(live)`. Graph refreshes never overwrite it; dirty-ness is always `isDirty(currentLive, draft)`. **Step 4: Run and expect a pass.**

- [ ] **Step 5: Commit** `feat(web): task dialog with staged save`

---

### Task 9: Branch dialog, colour picker, New branch dialog

**Files:**
- Create: `src/web/color.ts`, `src/web/dialogs/ColorPicker.tsx`, `src/web/dialogs/BranchDialog.tsx`, `src/web/dialogs/NewBranchDialog.tsx`
- Modify: `src/web/api.ts` (`updateBranch` body gains `color?: string`), `src/web/App.tsx`
- Test: `tests/web/color.test.ts`, `tests/web/BranchDialog.test.tsx`

**Interfaces:**
- Consumes: `Dialog` (Task 2), `DeleteAlert` (Task 7), `isHexColor` (Task 1, imported from `src/core/colors.ts`; add that file to `tsconfig.web.json` `include`).
- Produces:
  - `hexToHsv(hex: string): { h: number; s: number; v: number }` and `hsvToHex(c): string` (h in 0–360, s and v in 0–1, lowercase output).
  - `ColorPicker({ value, onChange }: { value: string; onChange(hex: string): void })`: a swatch button opening a Radix Popover with a saturation/value square (pointer drag), a hue bar, and a hex text input. No presets. `onChange` only fires with valid hex; invalid typed text stays local.
  - `BranchDialog({ projectId, graph, branchId, onClose })`: header title "Branch"; fields Name, Purpose (optional), Colour (grey hex text plus a `ColorPicker`), and **Branches from** (a picker with "Nothing (top level)" plus the tasks allowed by `subtreeBranchIds` from `src/web/branchTree.ts` (Task 3)). A preview pill and line show in the draft colour. Footer: Delete left, Save right. Save sends one `updateBranch` with only the changed fields (`name`, `purpose`, `color`, `rootTask`).
  - `NewBranchDialog({ projectId, fromTask, onClose })`: title "New branch", fields Name and Purpose (optional), button **Create branch**. It calls `api.createBranch` with `fromTask: 'T-n'` when set. No fork field is shown.

- [ ] **Step 1: Write failing tests**
  - `color.test.ts`: `hsvToHex(hexToHsv('#613583')) === '#613583'`, the same round trip for `#000000`, `#ffffff` and `#e95420`, and `hsvToHex({ h: 0, s: 1, v: 1 }) === '#ff0000'`.
  - `BranchDialog.test.tsx`:
    - The fields render. The colour row shows "#613583".
    - There's no "Edit links" anywhere.
    - "Branches from" excludes the branch's own tasks and its sub-branches' tasks.
    - Typing `#00ff00` in the picker's hex input and saving calls `updateBranch(1, 2, { color: '#00ff00' })`.
    - Review Focus 5: typing `#12` keeps Save disabled. Typing `#ABCDEF` enables Save and sends `#abcdef`.
    - The preview pill's `style.backgroundColor` follows the draft.
    - Choosing "Nothing (top level)" sends `rootTask: null`.
    - Closing while dirty asks "Discard changes?".
    - Review Focus 3: a refresh keeps the draft, and the branch vanishing calls `onClose`.
  - `NewBranchDialog`: from a card it sends `fromTask: 'T-2'`; from the background it sends no `fromTask`.

- [ ] **Step 2: Run and confirm failures.** **Step 3: Implement.** **Step 4: Run and expect a pass.**

- [ ] **Step 5: Commit** `feat(web): branch dialog with colour picker`

---

### Task 10: Summary tab

**Files:**
- Modify: `src/web/SummaryTab.tsx`
- Test: `tests/web/SummaryTab.test.tsx` (update)

**Interfaces:**
- Consumes: `ConfirmAlert`, `useToast` (Task 2).
- Produces: the same props as today (`projectId`, `onDirtyChange`).

- [ ] **Step 1: Update tests to the new behaviour**
  - Heading "Summary v3".
  - **Copy** and **Checkpoint** sit near the top. **Save** sits bottom-right and is disabled until edited.
  - Checkpoint opens an alert "Freeze v3 and start v4 as a copy?" with **Cancel** / **Checkpoint**; confirming calls `createCheckpoint`. Checkpoint is disabled while dirty.
  - A `changed` SSE event with no local edits reloads the text. With local edits, the text isn't replaced and no notice shows: the strings "Reload to see it" and "Overwrite?" never appear, and `window.confirm` is never called (spy).
  - Older versions render as collapsed rows "v2" with Copy, and expanding shows the frozen body.
  - Errors show as toasts.

- [ ] **Step 2: Run and confirm failures.** **Step 3: Implement.** Remove the `stale` state, the notice and the overwrite confirm. **Step 4: Run and expect a pass.**

- [ ] **Step 5: Commit** `feat(web): summary tab restyle, drop stale notice`

---

### Task 11: Whole-app check

**Files:**
- Modify: any leftovers found by the checks below.

- [ ] **Step 1:** `grep -rnE "[0-9]px|window\.confirm|alert\(" src/web` returns nothing (font files under `node_modules` don't count).
- [ ] **Step 2:** `npm run typecheck`, then `npm test`, then `npm run build`. All pass.
- [ ] **Step 3:** Run a throwaway server on fake data (as in the brainstorm): `DB_PATH=<scratch>/fake.db PORT=4848 node dist/server/index.js`. Seed it through the API (two branches, one fork, one blocker, one checkpoint). Check in the browser:
  - At window widths 1280, 1920 and 2560, text and cards grow and nothing overlaps.
  - Dark mode looks right.
  - Every dialog dims the window; menus don't.
  - Right-click and double-click work.
  - The colour change shows on the line and pill after Save.
- [ ] **Step 4:** Commit any fixes: `fix(web): overhaul polish`.
