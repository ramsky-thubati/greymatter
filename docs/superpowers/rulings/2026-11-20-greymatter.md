# Greymatter build: rulings and open minors

Decisions Claude made on your behalf during the build, in order. Each line ends with what it costs if wrong.

## Rulings

- work on branch feat/greymatter in place, not a worktree — repo was empty, user said go ahead — cost if wrong: none, branch is isolated.
- T3 checkpoint-edge test must assert the new task's index < CP index (the plan's assertion is vacuous) — spec says it lands left of the line — cost if wrong: one test line.
- T3 placement re-reads the anchor's current seq before each floating placement — needed so several floating tasks before one anchor keep their order — cost if wrong: wrong seq order, caught by tests.
- T7 adds `tsx` as a dev dependency for the smoke run — plan uses it without installing — cost: one dev dep.
- T10 message is "T-9 waits on this task. Delete anyway?" for one and "T-9, T-10 wait on this task. Delete anyway?" for several — both plan texts hold — cost: copy only.
- T12 implementer writes concrete assertions for the three described tests using the stated strings — plan describes them precisely enough — cost: none.
- T13 keeps `USER node`; README and the build step run `mkdir -p ~/.greymatter` before first `up` — container must not create the host dir as root — cost if wrong: first-run permission error on WSL.
- commits use short conventional messages with the Co-Authored-By trailer; subagents need not load caveman-commit — same intent — cost: style only.
- from Task 3 on, make tx reentrant (if db.isTransaction, run fn directly) — Task 2 hit nested-tx error; later tasks compose tx functions (createTask→moveTask→relinkBranch) — cost if wrong: partial writes if an inner fn throws mid-way, but outer tx still rolls back.
- replace greedy anchors with longest increasing subsequence of existing seqs (tasks in `floating` hint excluded from candidacy) — spec says only the moved/inserted task changes position; greedy breaks that for direct relinks that Task 7/11 expose — cost if wrong: small algorithm change, covered by tests.
- an empty branch is not finished (finished=false when no tasks) — a fresh project's empty main reading "finished" is wrong for the user — carried into Task 5 dispatch as a one-line change + test.
- subagent commits carry its own model's Co-Authored-By trailer — cosmetic, history is local and unpushed — cost if wrong: trailer text only.
- T7 PATCH branch applies rename + moveRoot in one tx; non-integer pid/bid → 400; unknown /api/* → JSON 404, never SPA fallback; emit exactly once per successful mutation — API contract the web app and MCP rely on — cost if wrong: small route changes.
- server binds HOST env default 127.0.0.1 (Dockerfile in T13 sets HOST=0.0.0.0, Compose publishes on 127.0.0.1 only); app rejects requests whose Host is not localhost/127.0.0.1/[::1] (any port), rejects mutating requests with a cross-origin Origin header, and requires application/json on bodies — local tool with no auth, browser pages must not reach it — cost if wrong: a legit client with odd Host gets 403; overridable via ALLOWED_HOSTS env.
- T9 adds tsconfig.web.json (noEmit, bundler resolution, DOM lib, jsx react-jsx) + `typecheck` script running both configs — root tsconfig excludes src/web so web code would never be type-checked — cost: one config file.
- T9 extends vitest include to tests/**/*.test.{ts,tsx}; web component tests use `// @vitest-environment jsdom` — T10–12 need tsx tests — cost: none.
- T9 Vite /api proxy must NOT set changeOrigin — with it, Host becomes 127.0.0.1:4747 while Origin stays localhost:5173 and the T7 Origin check returns 403 — cost if wrong: dev-only 403s.
- T9 map draws blocker lines for every blocker relation but the red ring and "blocked by" label only when task.blocked, listing only unfinished blockers — Graph.blockedBy includes done blockers; spec says the label marks blocked tasks — cost: display only.
- T9 api.ts exports `export const api = {...}` with task ids as strings — T10 tests vi.spyOn(api, ...) — sent to T9 implementer mid-task.
- T13 smoke runs with GREYMATTER_DATA pointed at a scratch dir, so step 7 deletes only scratch data, never ~/.greymatter — avoids destructive op on user data — cost: none.
- decision-1 copy was controller-authored and wrong for branch delete — use subject-aware copy: branch delete says "T-9 waits on a task on this branch. Delete anyway?" / "Branch <name> forks from a task on this branch. Move or delete it first." — spec intent is a clear warning — cost: copy only.
- Minor #2 (details/purpose typed then Esc/backdrop loses the edit) promoted to Important — silent data loss — cost: small flush-on-close change.
- T11 every piece (including the first) offers "Link after…" once there are 2+ pieces — with only pieces after the first linkable, the head can never move (e.g. [3,4] → [4,3] impossible) — cost: UI only.
- T11 renames api.reorderBranch → setBranchOrder (brief's name) accepting task number|string; adds 'remove' action for temp items (splits piece, never invents a link) — cost: small.
- reducer lives in src/web/editorState.ts (test tests/web/editorState.test.ts), not linkEditor.ts — plan's linkEditor.ts vs LinkEditor.tsx collide on case-insensitive FS (macOS, WSL /mnt) — cost: file name only.
- checkpoint confirm via window.confirm; older versions = frozenAt != null; Reload button on live-update notice; Save disabled when clean — brief says "confirm dialog" without form; matches no-surprise single-user UX — cost: swap to Popup confirm later.
- Checkpoint button disabled while unsaved edits exist (title "Save or reload first") — keeps spec confirm text exact, no auto-save, no silent loss — cost: one extra click.
- #2 — keep SummaryTab mounted (hidden) across Graph/Summary switch; confirm "Discard unsaved summary edits?" on project switch while dirty; beforeunload guard while dirty — cost: App knows summary dirty state.
- #3 — on changed, refetch and set stale only if server body != saved; Save while stale confirms "Claude changed the summary since you started editing. Overwrite?" — cost: extra GET per event on Summary tab.
- #4 — Delete asks first: "Delete branch <name> and its N tasks?" / "Delete branch <name>?" (0 tasks) / "Delete T-n?"; existing 409 dependents/fork copy still follows — cost: two confirms when dependents exist.
- #6 — add MCP tools list_summary_versions and get_summary_version over existing GET /summary/versions — cost: two more tools.
- T10 flush — failed close-flush on 400 reverts (as before); on other errors popup stays open with error and keeps text; second close discards — cost: one extra click when server is down.
- final minor #7 (resume clears flag before Claude sees it) included in fix wave — spec says flag exists "so I can check"; Claude never sees it otherwise — cost: small text change.

## Minors logged during the build

The final fix wave fixed these: get_graph done blockers, summary failed-load save, save-while-stale overwrite, failed close-flush losing text, README loopback and WSL notes. The rest stay as is.

- Task 3: minor (deferred): circular import tasks.ts <-> ordering.ts
- Task 3: minor (deferred): createInBranch duplicates next_task_num logic from createTask
- Task 3: minor (deferred): validateOrder unused projectId param
- Task 3: minor (deferred): cross-checkpoint move test only checks monotonicity
- Task 3: minor (deferred): no relink test with a second branch present
- Task 3: minor (deferred): createTask before=<own new num> gives confusing "relative to itself"
- Task 3: minor (deferred): re-entrant tx has no savepoint
- Task 4: minor (deferred): cross-project blocker test uses nonexistent num 99, not a real cross-project task
- Task 4: minor (deferred): row->Task/Branch mapping duplicated in graph.ts vs tasks.ts
- Task 4: minor (deferred): UNFINISHED_BLOCKER hard-codes alias t
- Task 4: minor (deferred): removeBlocker silent on unknown tasks
- Task 5: minor (deferred): structure.test.ts:280 not.toThrow deletes supplier as side effect
- Task 5: minor (deferred): no deleteBranch confirm test where outside task depends on inside task
- Task 5: minor (deferred): IN (marks) placeholders scale with branch size
- Task 5: minor (deferred): nums helper uses unknown[] cast
- Task 6: minor (deferred): getLiveSummary rebuilds liveRow object; liveRow unchecked undefined; tests share DB in order; no second-checkpoint test
- Task 7: minor (deferred): test named "500 without stack" never hits 500 path
- Task 7: minor (deferred): no test for SSE ping / cleanup on abort
- Task 7: minor (deferred): untested happy paths (resume unblocked, delete branch no confirm, PATCH task title/details, PATCH branch rootTask only)
- Task 7: minor (deferred): serveStatic built per request with cwd-relative path
- Task 7: minor (deferred): SSE subscribe inside stream callback may miss an early emit
- Task 7: minor (deferred): ALLOWED_HOSTS entries hostname-only (port/IPv6 forms never match), undocumented
- Task 7: minor (deferred): no tests for Origin null / other-port Origin / charset / uppercase Host
- Task 8: minor (deferred, likely fix in final): get_graph prints done/cancelled blockers as "blocked by" — Graph.blockedBy holds all blocker rows
- Task 8: minor (deferred): test gaps — delete_branch dependents wording, create_branch, summary tools, checkpoint, move, blockers, 403/415, non-JSON error body
- Task 8: minor (deferred): taskText adds (flagged); graph.tasks.find O(n²) with !
- Task 9: minor (deferred): useGraph swallows fetch errors; fork from later column curves backwards; cyclic root guards; no component/useGraph/api tests; truncated labels lack <title>; +Task prompt case-sensitive
- Task 9: minor (deferred): fork curve passes over main-lane labels (T-3 label overlapped)
- Task 10: minor (deferred): Enter then blur double-saves title; live sync overwrites in-progress input; delete-flow duplication across popups; tests use no-op onClose
- Task 10: minor (deferred): an empty forked branch shows no fork stub from its root task
- Task 10: minor (deferred): blur save + close flush can double-PATCH; no BranchPopup flush test
- Task 10: minor (deferred): no BranchPopup flush-failure test; failed flush discards typed text
- Task 11: minor (deferred): nextTempId NaN for non-new-N ids (editorState.ts:290)
- Task 11: minor (deferred): toOrder flatMap drops task nums missing from graph (LinkEditor.tsx:121)
- Task 11: minor (deferred): Cancel enabled + no "Saving…" text during save (LinkEditor.tsx:229)
- Task 11: minor (deferred): chips lack list semantics; select aria-label names first chip only
- Task 11: minor (deferred): editor closes silently if branch vanishes via live update (App.tsx:54)
- Task 11: minor (deferred): no tests for Enter-to-add, component mid-piece remove
- Task 11: minor (deferred): empty branch editor shows "Link all pieces…" hint with zero pieces (LinkEditor.tsx:135)
- Task 12: minor (deferred): navigator.clipboard undefined in non-secure context throws uncaught (SummaryTab.tsx:162)
- Task 12: minor (deferred): successful save clears pending Claude-update notice (SummaryTab.tsx:143)
- Task 12: minor (deferred): successful load() does not clear stale error
- Task 12: minor (deferred, FLAG for final review — data-loss risk): failed initial load leaves editor usable; Save can overwrite real summary with ''
- Task 12: minor (deferred): test gaps — dirty changed refreshes versions; slow load + project switch; vacuous queryByText('v3') at SummaryTab.test.tsx:385
- Task 12: minor (deferred): Save while stale notice shows silently overwrites Claude's newer body and clears notice (SummaryTab.tsx:79-81)
- Task 12: minor (deferred): test spies on updateSummary/getSummary may not be restored (SummaryTab.test.tsx:151,169)
- Task 12: minor (deferred): textarea renders white in dark theme; summary tab has no side gutter (content touches left edge)
- Task 13: minor (deferred, FLAG security): README doesn't say port is loopback-only / app has no auth; `docker run -p 4747:4747` exposes API to LAN
- Task 13: minor (deferred): bind mount EACCES when host uid != 1000; no hint in README
- Task 13: minor (deferred): WSL README gaps — run commands in WSL shell, default distro, Docker Desktop WSL integration
- Task 13: minor (deferred): healthcheck lacks start_period
- Task 13: minor (deferred): no init: true — compose down waits 10s then SIGKILL
- Task 13: minor (deferred): literal ~ in .env GREYMATTER_DATA not expanded
- Final minor (deferred, OK): #8 zod "Invalid request" message; #9 new project from Claude needs refresh; #10 two EventSources per tab; #11 create popup Esc discards input.

- Final minor (deferred, OK): #8 zod "Invalid request" message; #9 new project from Claude needs refresh; #10 two EventSources per tab; #11 create popup Esc discards input.
- Final fix wave: re-review — all 9 addressed, no new Critical/Important. Residual minors (OK): spurious stale notice race after own save; flushFailed not reset on further edits; list_summary_versions empty string when none; BranchPopup failed-flush untested.
