# UI overhaul design

Date: 2026-11-21

## Why

The web app works, but it doesn't hang together. Font sizes jump around (10, 11, 12, 13, 18px plus browser defaults). Text boxes use the browser's plain style while buttons and dropdowns are styled. The graph is drawn at fixed pixel sizes, so on a wide monitor it looks like a thumbnail, and its labels overlap. Some screens save when you click away and others need a Save button.

The goal is an app that looks and behaves like a native app shipped with Ubuntu (GNOME / libadwaita, Yaru accent), scales with the screen, and follows one set of rules everywhere.

## Goals

- One visual system: one type scale, one spacing scale, one control height, one set of colours, used on every screen.
- Everything sized in relative units, so the whole UI grows on a wide screen and shrinks on a laptop.
- Explicit Save everywhere something is edited in a dialog.
- A graph you can read at a glance: task cards, branch labels on the branch, a legend.
- Common actions reachable from where you're looking: right-click a card, click the end of a branch, click an icon on a card.

## Non-goals

- Reordering tasks in the browser. The link editor ("Edit links") is removed from the UI. Reordering is done through Claude (`move_task`). The server API for it stays.
- Changing how Claude works with the app. The MCP tools stay as they are.
- New data features beyond branch colour.
- Mobile or touch layouts. Laptop and wide desktop screens only.
- Handling Claude and me editing the summary at the same time. That never happens in practice.

## Anti-goals

- Any screen that still looks like a web page next to the others: browser-default inputs, `window.confirm`, a red error bar.
- Sizes written in px. If someone has to pick a pixel number, the design failed.
- Two save behaviours in one dialog.

## Approaches considered

For menus, submenus, popovers, dialogs and alerts:

1. **Headless component library (Radix primitives) with our own styling. Picked.** Gives keyboard support, focus handling, Esc, and menus that flip when they hit the window edge. Has no look of its own, so the GNOME style is all ours. Cost: about five small packages.
2. **Hand-build everything.** No new packages, matching how the app is built today. Rejected because submenus, edge-flipping and keyboard navigation are fiddly and would add more code and rough edges than the packages cost.
3. **A ready-made GNOME look-alike web library.** Ruled out: none is mature enough to depend on.

For the graph:

- **Cards as normal page elements, positioned over an SVG layer that draws only the lines. Picked.** Cards get real text wrapping, hover, right-click and focus for free.
- Drawing cards inside SVG (`foreignObject` or SVG text) was rejected. Text wrapping and menus are much harder there.

## Decisions

### Look

- GNOME / libadwaita styling with the Ubuntu (Yaru) orange accent `#e95420`.
- Font: Ubuntu Sans, shipped with the app so it works offline. No calls to Google Fonts.
- Light and dark themes. Dark follows the system setting (`prefers-color-scheme`).
- Fields sit in rounded grouped lists ("boxed lists", like GNOME Settings), with the field label small inside the row.
- Buttons: flat grey by default, orange filled for the main action (Save, Create), red text for Delete.
- Every dialog and alert slightly dims the window behind it. Menus and popovers don't dim.
- Errors appear as a toast at the bottom of the window (dark pill, optional Retry), not a red bar.
- Confirmations use a small centred alert with two pill buttons (for example **Cancel** / **Delete**). No `window.confirm` anywhere.

### Sizing

- Nothing is sized in px. The root text size scales with window width, between a floor and a ceiling:

  ```css
  html { font-size: clamp(0.9rem, 0.6rem + 0.5vw, 1.25rem); }
  ```

- Every other size (fonts, gaps, control heights, radii, graph geometry) is in `rem`, or `em` where it should follow local text.
- `1rem` starts from the browser's own text-size setting, so browser zoom and font settings carry through.
- The graph's size depends on the screen, never on how many tasks a project has. Long projects scroll sideways.
- Tokens: type scale, spacing scale, radii, control height and colours are defined once as CSS custom properties and used everywhere. Exact values are the builder's, matched to the mockups.

### Header bar

- Left: **‹ Home** button, then the project name in bold.
- Centre: **Graph / Summary** switcher.
- Right: empty. The old **+ Branch** / **+ Task** buttons and the ☰ menu are gone.
- No project picker in the header.

### Home

- New screen: a header bar titled "greymatter" with **+ New project** on the right, and a boxed list of projects. Click a row to open that project.
- My call: rows show the project name only. The "5 tasks · 2 branches" text in the v2 mockup is dropped, since it would need a server change.
- Home has its own address and so does each project, so the browser's back button works. Hash routing (`#/`, `#/projects/:id`) is fine and needs no server change.
- Opening the app lands on Home. The "remember last project" behaviour goes away.

### Graph

**Branch labels**

- Each branch label is a pill in the branch's colour, sitting on that branch's line, just left of its first card. A forked branch's label sits where that branch starts, not in a shared left column.
- Labels show the full name. No task count, no "from T-2".
- The layout must leave room for the label between the fork point and the first card. It may add horizontal space to do that. Labels must never overlap cards.
- A branch with no tasks shows its pill followed by the add-task circle.
- Click a label: opens the Branch dialog.

**Branch lines and colours**

- Each branch has a colour, used for its line and its label background.
- The colour is stored per branch (new data, see below). Branches can share a colour.
- New branches get a colour from a default rotation. The rotation must avoid the status colours (green, blue, amber, grey) so branch lines don't read as statuses. The mockups use purple `#613583` and pink `#c061cb`.
- Forks are drawn as metro-style lines: down from the parent task, then along the new branch's row.

**Add-task circle**

- Each branch ends in a short dotted line and a dashed circle with **+** in the branch colour. Hover fills the circle.
- Click: opens the New task dialog for that branch. The new task goes at the end of the branch.

**Task cards**

- A white card per task (card colour in dark mode), with a soft border/shadow.
- Top-left: status dot, then the task ID (`T-3`).
- Status dot colours, which also apply to the legend and every other dot in the app:
  - Done: green `#26a269`
  - In progress: blue `#3584e4`
  - To do: grey `#77767b`, drawn as a hollow ring
  - Later: amber `#e5a50a`
  - Cancelled: light grey `#c0bfbc`, and the card title is struck through
- No status text on the card. The legend explains the dots.
- The dot is only an indicator, not a button.
- In-progress cards get a blue border in the in-progress blue.
- Title below, up to two lines, then an ellipsis.
- Top-right icons:
  - Padlock (red): shows while at least one of the task's blockers is unfinished (not Done and not Cancelled).
  - Flag (red): shows while the task itself is unfinished and it blocks at least one unfinished task.
  - Both can show at once. Finished work never carries red icons.
  - Clicking either opens the blocker popover.
- Bottom-right: a branch icon, shown only when a branch forks from this task. It is only an indicator.
- Click the card: opens the Task dialog.
- Right-click the card: opens the card menu.
- Today's "flagged" state (a blocker was cancelled) has no design yet. My call: a small amber "!" in the top-right icon area with a tooltip saying "A blocker was cancelled. Check this task still makes sense.", plus the same note inside the Task dialog.

**No more blocker lines**

- The red dashed blocker curves are removed. Blockers show only through the card icons and the popover.

**Blocker popover**

- Opens next to the clicked icon.
- Up to two sections: **Blocked by** and **Blocks**. A section with nothing in it is hidden.
- It lists every relationship, finished ones included, so they can always be seen and removed. The Task dialog's **Blocked by** list does the same. (Because of the icon rules above, the popover can only be opened from a card that has an icon showing.)
- Each row: status dot, task title, and the status name in small grey text. A ✕ button sits at the right.
- Click a row: closes the popover and opens that task's dialog.
- Click ✕: opens an alert, "Remove dependency?", saying in words which task will no longer be blocked by which. Buttons: **Cancel** / **Remove**. Remove takes effect right away.

**Legend**

- A strip under the graph: the five status dots, then "Being worked on" (blue border), "Blocked" (padlock), "Blocks another task" (flag).

**Stuck branches**

- Today a stuck branch shows a red "stuck" chip. My call: keep it as a small red "stuck" pill just right of the branch label.

**Checkpoints**

- The mockups don't show checkpoints. My call: keep today's meaning (a vertical dashed line across all branches at the point in the sequence where the summary version changed), restyled with the accent colour and a small pill label "v1 → v2" at the top. It must not overlap cards. The layout gives it its own column, as today.

**Right-click menus**

- On a card:
  - **Status ›**: submenu with the five states, each with its dot, and a tick on the current one. Picking one changes state right away.
  - **Branch from here**: opens the New branch dialog with this task as the fork point.
  - Divider, then **Delete** in red: opens the delete alert.
  - More items will be added later, so the menu should be easy to extend.
- On empty graph space:
  - **New branch**: opens the New branch dialog for a top-level branch.
  - More items will be added later.
- Double-clicking empty graph space also opens the top-level New branch dialog.

### Dialogs

Shared rules:

- ✕ close button top-right. No Cancel button.
- **Save** (orange) bottom-right. Disabled until something changes.
- **Delete** (red text) bottom-left, where the dialog edits something that can be deleted.
- Enter in a one-line field does **not** save.
- Nothing in a dialog takes effect until Save. That covers text fields, the state picker, and adding or removing blockers inside the dialog.
- Closing with unsaved changes (✕, Esc, clicking outside) opens an alert: "Discard changes?" with **Keep editing** / **Discard**.
- Delete always asks first, in one alert. My call: the client works out from the graph it already has which tasks are blocked by the thing being deleted and which branches fork from it, and names them in that alert ("T-5 is blocked by this task"). Confirming deletes with `confirm=1`. If a branch forks from it, the alert explains that it can't be deleted yet, as today, and offers only **OK**. No server change.
- If Save fails, the dialog stays open with the edits kept, and the error shows as a toast.
- My call on multi-part saves: one Save can mean a PATCH plus one call per added or removed blocker, and these aren't all-or-nothing. Save sends them in order and stops at the first failure. The dialog then compares its edits against the refreshed graph, so whatever did save stops showing as changed and whatever didn't stays in the dialog, still unsaved. No new server endpoint.

**Task dialog**

- Top-left in the header: status dot and state name with a ▾ (for example "● In progress ▾"). No "State" label. Click it: a small menu of the five states with dots and a tick on the current one.
- No title in the header. The title appears once, as the first field.
- Fields: Title, Details (multi-line).
- **Blocked by** group: rows with status dot, `T-n` and title, plus ✕ to remove. Last row: **+ Add blocker**, which picks from the project's other tasks.
- The flagged note (when present) sits above the fields.
- Footer: **Delete** left, **Save** right.
- No "Branch from here" in the dialog. That lives in the card's right-click menu.

**New task dialog**

- Title: "New task". It doesn't name the branch.
- Fields: Title, Details (optional).
- Footer: **Add task** on the right.

**Branch dialog** (click a branch label)

- Header title: "Branch".
- Fields: Name, Purpose (optional), Colour, Branches from.
- **Colour** row: hex code in grey and a swatch button. Clicking the swatch opens a colour picker popover:
  - Saturation/brightness square, hue bar, and a hex input with a swatch preview.
  - No preset colours.
  - Built in the app, not the browser's own colour picker, so it looks the same on every OS.
- Under the fields, a small preview of the label pill and line in the chosen colour.
- **Branches from** row: a picker of tasks, plus "Nothing (top level)". It keeps today's rules: a branch can't fork from a task inside itself or inside a branch that forks from it.
- Footer: **Delete** left, **Save** right. The graph updates on Save.
- No "Edit links".

**New branch dialog**

- Opened from a card's "Branch from here" (fork point preset), the background menu, or a double-click on empty space (top level).
- Fields: Name, Purpose (optional). The fork point is decided by where it was opened from and isn't shown as a field.
- Footer: **Create branch** on the right.
- Colour comes from the default rotation and can be changed later in the Branch dialog.

**New project dialog** (from Home)

- Field: Name. Footer: **Create project**. On success, open the new project.

### Summary tab

The mockups don't cover it. My calls:

- Same tokens and styling as the rest. The page has proper padding.
- The summary text sits in a card-style editor that fills the available height. Version shown as "Summary v3" above it.
- **Copy** and **Checkpoint** as flat buttons near the top. **Save** (orange) at the bottom-right, disabled until there are changes.
- Checkpoint asks through an alert, not `window.confirm`: "Freeze v3 and start v4 as a copy?" with **Cancel** / **Checkpoint**.
- When Claude changes the summary and I have no unsaved edits, the page refreshes on its own.
- The "Claude updated the summary. Reload" notice and the "Overwrite?" prompt are removed.
- Leaving the project (Home) with unsaved summary edits uses the "Discard changes?" alert.
- Older versions: a list of collapsed rows ("v2", with Copy). Expanding shows the frozen text.

### Data changes

- Add `color` to branches: a nullable text column holding `#rrggbb`.
- My call: when the column is added, existing branches get a colour stored once, from the new rotation in creation order within each project. After that, every branch always has a stored colour, so adding or moving branches never recolours others. Today's `LANE_COLORS` goes away, because it includes blues, a teal-green and an orange that clash with the status colours.
- New branches store the next colour from the rotation when created.
- The branch PATCH endpoint accepts `color`. Anything that isn't `#rrggbb` is rejected with a 400.
- The graph response includes each branch's colour.
- MCP tools don't change.

### Removed

- `LinkEditor.tsx`, `editorState.ts` and their tests.
- The project `<select>` in the header and the saved-project localStorage key.
- `window.confirm` calls.
- The red error bar.

## Mockups

These are in `.superpowers/brainstorm/44059-1795264694/content/`, which is gitignored. Each version only shows what changed in it, so read the later one where two disagree.

- `ubuntu-look-v5.html`: card layout, legend, blocker popover, "Remove dependency?" alert, task dialog with the state picker.
- `ubuntu-look-v6.html`: branch indicator only on fork points, card right-click menu with the Status submenu.
- `ubuntu-look-v7.html`: background right-click menu, dimmed window behind dialogs, New branch dialog.
- `ubuntu-look-v8.html`: Branch dialog with the colour picker.
- `ubuntu-look-v2.html`: Home screen.

Where these files and this document disagree, this document wins. In particular, the Branch dialog in v8 doesn't yet show the "Branches from" row.

## Left to the builder

- Exact token values (type scale steps, spacing, radii, shadows, dark-mode colours), matched to the mockups.
- Which Radix packages, and how the primitives are wrapped.
- How the font files are bundled.
- Layout maths for cards, label room, forks and checkpoint columns, as long as nothing overlaps and everything is in rem.
- The default branch colour rotation, beyond avoiding status colours.
- Rewriting the web tests to match. Every behaviour in this document should have a test where it's practical.
