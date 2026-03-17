# Etudes Option C Dashboard Design

## Goal

Build a local dashboard that tracks Etudes state across multiple projects without changing Etudes' core storage model.

The dashboard must:

- Read all registered projects from `~/.etudes/projects.json`
- Support `localhost:<port>/<project-dir>` and `localhost:<port>/all`
- Provide a Linear-style kanban board with five columns: Backlog, To Do, In Progress, Done, Shipped
- Support create, edit, status change, comment, and delete task actions
- Write directly to `.etudes/` files so Claude Code Etudes commands stay in sync
- Keep a Park/Icebox section linked to `parking-lot.md`

Options B (MCP server) and D (Obsidian) are explicitly parked for later.

## Non-Goals (v1)

- Multi-user auth
- Cloud sync
- External database
- Real-time collaboration
- Drag-and-drop persistence beyond local files

## Architecture

Single-repo, local-first setup:

```
etudes/
├── dashboard/
│   ├── server.js
│   └── index.html
└── package.json (bin: etudes-dashboard)
```

### Runtime

- Command: `npx etudes-dashboard`
- Server: Node + Express
- Default port: 2400
- URL modes:
  - `/` -> all projects summary
  - `/all` -> combined board
  - `/<project-slug>` -> single project board

## Data Sources

### Global index

- `~/.etudes/projects.json`
- Entries may be strings or objects
- Dashboard normalizes to:
  - `slug`
  - `name`
  - `path`

### Per-project files

- `.etudes/sprint-current.md`
- `.etudes/profile.md`
- `.etudes/parking-lot.md`
- `.etudes/board-state.json` (dashboard-owned metadata)

`board-state.json` stores kanban-only fields (`in_progress`, `backlog`, `shipped`, comments metadata) that cannot be represented as markdown checkboxes alone.

## Parsing and Writeback

### Sprint parsing

- Parse day headings: `## Day X`
- Parse tasks from markdown checklist lines
- Preserve unchecked/checked state from markdown (`[ ]`, `[x]`)
- Merge with board-state status if present

### Writeback behavior

- Status changes:
  - To Do/Done -> update checkbox in `sprint-current.md`
  - In Progress/Backlog/Shipped -> store in `board-state.json` plus checkbox normalization when needed
- Edits -> mutate task line in `sprint-current.md`
- Delete -> remove task from `sprint-current.md` (Etudes check-in now asks why)
- Comments -> append timestamped comment lines under task in `sprint-current.md`
- Park -> append to `parking-lot.md`

## API Endpoints

- `GET /api/projects`
- `GET /api/projects/:slug`
- `POST /api/projects/:slug/tasks`
- `PATCH /api/projects/:slug/tasks/:id`
- `PATCH /api/projects/:slug/tasks/:id/status`
- `POST /api/projects/:slug/tasks/:id/comments`
- `DELETE /api/projects/:slug/tasks/:id`
- `POST /api/projects/:slug/park`

## UI Behavior

Single HTML file with vanilla JS:

- Top nav for project selection (`all` + each project)
- Five kanban columns
- Task cards with:
  - title
  - estimate
  - done criteria
  - file ref
  - comments
- Inline actions:
  - create
  - edit
  - move status
  - comment
  - delete
- Park/Icebox panel for parked ideas

## Risks and Mitigations

- Markdown mutation risk: keep line-based targeted updates and avoid full-file reformatting
- Duplicate project slugs: ensure slug deduping with numeric suffixes
- Missing project dirs: show as missing in dashboard, do not auto-delete from index

## Verification Plan

- Start server via `node dashboard/server.js`
- Hit key APIs with curl
- Confirm URL routing for `/all` and one project slug
- Create/edit/move/delete/comment task and verify markdown file mutations
- Add parked idea and verify `parking-lot.md`
