---
name: opencode-kanban-cli
description: Board operations for the kipfer conveyor (opencode-kanban CLI) — create/move tasks across columns, categories. Use for any board interaction.
---

# kipfer conveyor board

Source: CLI contract of [opencode-kanban](https://github.com/TomCC7/opencode-kanban) (MIT), adapted for this project.

## Project constants

- `--project kipfer`
- Repo: `/home/mike/projects/kipfer`
- Task worktrees: `~/.opencode-kanban-worktrees/kipfer/<branch-with-dashes>`
- Columns (slug, in order): `backlog` → `design` → `spec-review` → `implementation` → `qa` → `pr-review` → `done-merged`
- Task branches strictly `bug|feature|docs/<ISSUE_NUMBER>/short-description`

## Global CLI rules

- Every non-TUI command requires `--project <PROJECT>` (before or after the subcommand).
- JSON reply is wrapped: `{ "command": ..., "data": ..., "schema_version": "cli.v1" }`; errors: `{ "error": { "code", "message" } }`.
- `task show/move/archive` accept a full UUID or a unique short prefix from table output.
- `category *` commands require the **full UUID** (`--id`); take IDs from `category list --json` (`data.categories[].id`).
- Exactly one category selector: either `--category-id` or `--category-slug`, never both.

## Commands

```bash
# Full board snapshot
opencode-kanban task list --project kipfer --json

# Create a task: validates base branch, creates git worktree + tmux session + card
opencode-kanban task create --project kipfer \
  --title "Short STE title" \
  --branch "feature/42/short-desc" \
  --repo /home/mike/projects/kipfer \
  --category-slug backlog

# Task details (branch, worktree_path, tmux_session_name, session status)
opencode-kanban task show --project kipfer --id <PREFIX_OR_UUID>

# Move a card across stages
opencode-kanban task move --project kipfer --id <PREFIX> --category-slug design

# Archive after merge
opencode-kanban task archive --project kipfer --id <PREFIX>

# Categories
opencode-kanban category list --project kipfer [--json]
```

## Errors

| Code | Cause / fix |
|---|---|
| `PROJECT_REQUIRED` | `--project` missing |
| `REPO_NOT_FOUND` | repo not registered in the board |
| `UNIQUE_CONSTRAINT` on create | branch `(repo, branch)` already used by a card |
| `TASK_ID_AMBIGUOUS` | lengthen the ID prefix |
| `CATEGORY_SELECTOR_CONFLICT` | both category selectors passed |
| base branch not up-to-date | `git pull --ff-only` in the main checkout before create |

## Notes

- `task create` runs the full workflow: branch validation → base fetch → git worktree → tmux session → metadata. On failure it rolls back what it created.
- TUI: `opencode-kanban --project kipfer` (Enter attaches to the task session, `?` shows help).
