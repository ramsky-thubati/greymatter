# Greymatter design

Date: 2026-11-20

## Why this exists

While working on something (researching a book idea, building an engine), I keep finding side things worth doing later. I want to park them without losing my place, see them on a map, and come back to them.

Claude does most of the bookkeeping. I work and talk with Claude Desktop, Claude records tasks and branches, and when I say "take notes" Claude updates the project's summary. Tomorrow I can say "resume T-14" and Claude picks up that task with the context it needs, even if yesterday I was on a different task.

The model is a git graph without the code parts. Branches are lines of work. Tasks are the commits. There is no merging, and there is only one state of the world: finishing a task on any branch changes the same world. Switching to "weld engine mounts" does not undo the half-assembled engine.

## Goals

- Capture a side thread at the moment I notice it, with a reason and a task or two, then get back to what I was doing.
- See every project as a metro map: branches, tasks, states, blockers, checkpoints.
- Let Claude resume any task tomorrow from a short project summary instead of a replay of history.
- Let me do everything by hand in the browser that Claude can do through MCP.

## Non-goals

- Merging branches. A branch just ends.
- Per-branch state. There is one summary per project.
- Links between projects. Each project stands alone.
- Dependency types other than "blocked by".
- An activity log or audit trail.
- Multi-user use, sync, or hosting. This is local and single user.

## Anti-goals

The tool fails if the summary bloats. Details that mattered last week (cut lengths for the engine mounts) must not crowd out what matters now (wiring the ECM). Checkpoints exist to stop this.

## Concepts

### Project

A container with its own branches, tasks, summary versions, and checkpoints. Nothing crosses project boundaries.

### Branch

A named line of work with a short "what this branch is for" note.

- A branch either starts on its own (top level, no fork point) or forks off a specific task on any branch, including another forked branch.
- A project can have several top-level branches. Main is one of them and has no special rules.
- Its tasks form one chain joined by links (the lines between stops). The links set the order. The next task is the first one in that order that is `todo` or `in progress`.
- The order can change. In the web app, "Edit links" on a branch opens an edit mode where I can cut links, create tasks, and add links. Save stays disabled until the branch is one unbroken chain again, so the rest of the tool never sees a broken branch.
- Links only join tasks on the same branch. They are separate from blockers.
- Root can move to another task, except a task inside the branch itself or inside any branch forked from it. That would make a loop.
- A branch is finished when all its tasks are `done` or `cancelled`. Any `later` task keeps it open.
- A branch is **stuck** when its next task is blocked.

### Task

Has a short ID unique within the project (`T-1`, `T-2`, ...), a title, details, a state, and blockers.

States: `todo`, `in progress`, `later`, `done`, `cancelled`.

- Several tasks can be `in progress` at once. I can resume any task that isn't blocked, in any order. "Next task" and "stuck" still follow the branch's first open task.
- `later` means I postponed it. It is skipped when finding the next task and does not make the branch stuck.
- `cancelled` is skipped like `done`.
- Details hold the how: specifics, findings, and a "where I stopped" note when work pauses mid-task.

### Blockers

A task can be blocked by tasks on any branch in the same project.

- Blocked is computed, never set by hand: a task is blocked while any of its blockers is not `done`.
- If a blocker is cancelled, it stops blocking, and the waiting task gets a flag so I can check whether it still makes sense.
- Deleting a task that others wait on shows a warning listing those tasks. If I go ahead, they lose that blocker.

### Summary (global state)

One Markdown document per project describing the project as it stands now. It is not a history.

- On "take notes", Claude rewrites the summary to fold in what's new. It does not append.
- Finished work shrinks to its outcome ("Engine mounts welded and installed"). Before shrinking, Claude moves the detail into the details of the task where it happened.
- The rule Claude follows: would this matter to the next task someone picks up? If not, shrink it or move it to its task.
- I can view, edit, and copy it (copy gives Markdown).

### Checkpoint

A moment where the summary is condensed into a new version.

- The old version is kept, read-only, viewable and copyable.
- The new version is the starting point for everything after the checkpoint, and "take notes" updates it until the next checkpoint.
- Only the live version is read on resume. Claude opens an old version only if I ask or a task clearly needs something that was condensed away.
- Making a checkpoint (from the browser or through Claude) freezes the current version and starts the new version as a copy of it. Then I trim it myself or tell Claude "condense the summary", and Claude rewrites the new version.
- I decide when to checkpoint. If I'm unsure, I ask Claude for its call. Claude never makes one on its own.

## Web app

Local, opened in the browser. It is a full editor, not a viewer.

### Layout

- Top bar: project dropdown (switch project, new project), tabs "Graph" and "Summary", buttons to add a branch or task.
- Graph tab: the metro map across the full width.
- Summary tab: the live summary with edit and copy, and a list of older versions (read-only, copyable).

### Metro map

- One horizontal row per branch, labelled on the left, with a "stuck" chip when stuck.
- Tasks are stops. Each project keeps one left-to-right sequence of all its stops, across all branches, and the map draws that sequence:
  - A new task goes at the end.
  - An inserted or moved task goes just before its new next task on the branch (or just after its new previous task, if it becomes last). Everything after it shifts one step right. Branch lines never run backwards.
  - A checkpoint is a marker in the same sequence.
  - If a task is inserted in front of a task left of the latest checkpoint, it lands left of the line too. The line marks where the summary version changed in the sequence, not an exact clock time.
- A forked branch curves out of its parent task.
- A checkpoint is a vertical dashed line across all branches, labelled with the version change (v1 → v2).
- Blockers are red dashed lines from blocker to blocked task. A blocked task has a red ring and "blocked by T-3" under it.
- State colours: done green, in progress blue with a halo, todo hollow grey, later amber, cancelled grey with struck-through title.
- Mockup reference: `.superpowers/brainstorm/28390-1795220277/content/checkpoint.html`, option A.

### Popups

- Clicking a task opens a centered popup with ID, title, state, blockers (add or remove), details, and buttons for "Branch from here" and "Delete".
- Clicking a branch name opens a popup to rename it, edit its purpose, move its root, or delete it.

### Things I can do by hand

Create and delete branches. Create and delete tasks. Reorder tasks on a branch through link edit mode. Edit task title and details, change state, add and remove blockers. Move a branch root. View, edit, and copy the summary. Make a checkpoint.

### Live updates

When Claude changes something through MCP, the open page updates without a refresh.

## Claude through MCP

Claude Desktop connects to a local stdio MCP server.

- Branch creation: Claude suggests a branch when it notices a side thread, and creates it only after I say yes.
- Project: Claude asks which project at the start of a chat and uses it for the rest of that chat, unless I name a project in my request. Every MCP call carries the project.
- Resume: I pick the task in the web app and tell Claude ("resume T-14"). Claude sets it `in progress`, reads the live summary and the task's own details, and nothing else, then starts. If the task is blocked, Claude says what it's waiting on and does not start.
- Take notes: Claude rewrites the live summary following the summary rules above. If I stopped mid-task, Claude writes "where I stopped" into the task's details.
- Checkpoint: only when I ask. If I ask Claude to decide, it gives its call and waits for my yes.
- Claude does not list open tasks in chat. The web app is where I look.

## Running it

The app runs in Docker so it behaves the same on macOS and on WSL.

- One image holds the app server, the web app, and the MCP server.
- Docker Compose runs one long-lived container with `restart: unless-stopped`, so the app server is up whenever Docker is. The browser reaches it on a published localhost port.
- The SQLite file lives in a bind-mounted folder on the host, so data survives rebuilds and is easy to back up.
- Claude Desktop starts the MCP server with `docker exec -i <container> node <mcp entry>`. Inside the container it talks to the app server over localhost. The host needs only Docker, not Node.
- On Windows with WSL, Claude Desktop runs on Windows, so its config calls `wsl docker exec -i ...`. WSL2 forwards localhost, so the Windows browser reaches the published port.
- If the container is down, the MCP server can't start and Claude reports that the app isn't running.

## Approaches considered

1. **One app server, MCP talks to it (picked).** A single local server owns the data in SQLite, serves the web app, and enforces every rule. The MCP server is a thin layer that turns Claude's tool calls into HTTP requests to it. One writer keeps the rules in one place and makes live updates easy. The cost is that the app server must be running; the Docker restart policy keeps it up.
2. **Shared SQLite file.** Web server and MCP server each open the database. No dependency between them, but two writers, rules duplicated in two places, and the browser has to poll for Claude's changes.
3. **Plain files.** JSON plus Markdown per project. Readable and git-friendly, but two processes writing the same files risk corruption, and live updates rely on file watching.

I picked 1 because "one global state" fits best with one owner.

## Decided

- Local web app plus local stdio MCP server for Claude Desktop.
- Approach 1 above.
- Horizontal metro map, time-ordered, checkpoint as a vertical line.
- Full-width graph, popups for task and branch, summary on its own tab.
- Containerized with Docker, running on macOS or WSL.

## Claude's calls (check these)

- TypeScript end to end, official MCP SDK, React with SVG for the map, SQLite for storage.
- Summary versions are stored as Markdown text.
- Container setup: one image, Compose with a restart policy, database in a bind-mounted host folder, MCP started through `docker exec -i` (through `wsl` on Windows).
- Task IDs are per project and never reused.
- The live-update mechanism (WebSocket or server-sent events).
- Deleting a branch deletes its tasks. Deleting a branch or task is refused while another branch forks from it; I move that root or delete that branch first. Blockers pointing at deleted tasks are dropped after the same warning as a single task delete.
- Blocker cycles are rejected.
- Claude reorders through "insert task before/after" and "move task to after X" tools, which keep the chain whole in one step. Edit mode is a browser feature.
- A new project starts with one top-level branch called "main".

## Left to the builder

- The host folder for the database, the port number, and the container name.
- The exact MCP tool names and shapes, as long as they cover everything in "Claude through MCP" and "Things I can do by hand".
- Visual polish of the map beyond the rules above.
