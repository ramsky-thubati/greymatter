# Project status and delete

## Why

You want to mark a project finished so it stops crowding Home, and to delete projects you no longer need.

## What changes

1. **Project page menu.** A "⋯" button at the right end of the header opens a menu:
   - Mark as Complete
   - Mark as In Progress
   - Delete Project (red, after a separator)

   Only the status that isn't current shows. On a complete project you see Mark as In Progress, not both.
2. **Home.** In-progress projects are listed as they are now. Below them is a "Completed (N)" section, collapsed by default, that you click to expand. It's hidden when nothing is complete.
3. **Delete.** A confirm dialog ("Delete *name*? This removes all its branches, tasks and summaries. It can't be undone.") comes first. Then the project and everything in it are removed and you land on Home.

## Approach

A `status` column on `projects` (`in_progress` | `complete`, default `in_progress`), added by migration. It works like task `state`, and adding a status later is cheap. The rejected option was a `completed_at` date: it allows sorting by finish date, but you didn't ask for dates.

## Calls I made (check these)

- A complete project stays fully editable. Status is a label and a Home grouping, nothing more.
- The collapsed or expanded state of the Completed section isn't remembered. It starts collapsed on every load.
- API: `PATCH /api/projects/:pid` with `{ status }`, and `DELETE /api/projects/:pid`.
- MCP is unchanged. Claude can't complete or delete projects. `list_projects` still lists every project.

## Non-goals

- Archiving, or hiding completed projects from MCP.
- Undoing a delete.
