# Repository Guidelines

## Project Structure & Module Organization

Kipfer is currently a concept and security-design repository; it has no application source code or automated test suite. `README.md` summarizes the product and links to the design documents. `docs/CONCEPT.md` describes the product concept, while `docs/adr/` contains numbered Architecture Decision Records (ADRs). Keep new design material in `docs/` and decisions in `docs/adr/` using the existing `ADR-NNNN-short-topic.md` pattern.

## Change Workflow & Documentation

Use the OpenSpec flow for proposed changes: record the change and its specification before implementation, then keep the specification aligned with the delivered behavior. Write and maintain documentation from the first commit of a change. Update affected docs as part of every change; do not defer documentation updates. Use STE in all comments and documentation, including code comments when code is added.

## Agent Conveyor (OpenCode)

All agent work runs through the OpenCode conveyor (`.opencode/`). Roles:

| Agent | Mode | Model | Responsibility |
|---|---|---|---|
| `intake` | primary | GLM-5.3 | Task intake: analysis, requester interview, decomposition into GitHub issues and board cards |
| `producer` | primary | GLM-5.3 | Orchestrator: board states, subagent launches, rework loops, verdict publication |
| `designer` | subagent | GLM-5.3 | Explore plus OpenSpec proposal (proposal, design, specs, tasks) and ADR drafts |
| `spec-reviewer` | subagent | GLM-5.3 | Spec gate before implementation and QG3. Read-only |
| `implementer` | subagent | GLM-5.3-flash | Delivery per tasks.md in the task worktree |
| `qa` | subagent | GLM-5.3 | QG1 and QG2, spec validation, document checks. Read-only |
| `pr-reviewer` | subagent | GLM-5.3-flash | Finalizer: sync and archive in the branch, PR creation |

**Model policy:** planning and validation (`intake`, `producer`, `designer`, `spec-reviewer`, `qa`) run on the most capable model; implementation and finalization (`implementer`, `pr-reviewer`) run on the fast model. When a stronger provider is configured, raise the planning and validation tier first.

Start with `opencode` in the repository root, then pick `intake` (new task) or `producer` (run the pool).

- **Board**: `opencode-kanban --project kipfer` (local SQLite; one card = one branch + git worktree + tmux session). Columns: `backlog → design → spec-review → implementation → qa → pr-review → done-merged`. Stage work happens in task worktrees, never in the main checkout.
- **Branches** follow `bug|feature|docs/<ISSUE_NUMBER>/short-description`; every task has a GitHub issue.
- **Spec gate**: `spec-reviewer` reviews every spec before implementation. An explicit `pass` verdict on a specific spec revision is required. A `request changes` verdict blocks implementation; a substantive spec change requires a new review.
- **Quality gates** before merge: QG1 (quality) and QG2 (security) by agent `qa`; QG3 (architecture, including sync and archive artifacts) by agent `spec-reviewer`. Each verdict is a separate PR comment with the full tested SHA. Any new commit in the branch annuls all previous verdicts.
- **Merge is human-only**: `gh pr merge` requires owner confirmation for every agent. OpenCode permissions deny the standard push-to-main forms; GitHub branch protection is not available on this plan, so the owner remains the final control.
- **Coordination** of parallel agents (separate worktrees): plugin `.opencode/plugins/team/` provides `team.announce/roster/chat_post/chat_read/context` (presence and per-task chat threads; thread = board card id).

## Build, Test, and Development Commands

There is no build or local run command yet. For documentation changes, review the rendered Markdown in your editor and inspect the diff with `git diff --check` (whitespace errors) and `git diff` (content and links). Run these checks from the repository root.

## Writing Style & Naming Conventions

Use Simplified Technical English (STE) in comments and documentation: prefer short sentences, direct instructions, and consistent terms. Use Markdown headings to organize content and relative links for repository documents, for example `[ADR-0001](docs/adr/ADR-0001-local-executor-bootstrap.md)`. Preserve four-digit, zero-padded ADR numbers and descriptive kebab-case filenames. Keep security claims precise: distinguish design requirements from implemented or verified behavior.

## Testing Guidelines

No test framework, coverage target, or code tests are configured. For document-only changes, check spelling and Markdown structure, verify links point to existing files, and run `git diff --check`. If implementation code is added later, document its build and test commands here and in the README.

## Commit & Pull Request Guidelines

Recent history uses short Conventional Commit-style subjects, such as `docs: add ADR-0003 architecture decision`. Follow that pattern with an imperative, specific summary (for example, `docs: clarify approval flow`). Pull requests should explain the design change and its rationale, link related issues or ADRs, and identify affected security assumptions. Include screenshots only when a visual document change makes them useful. Check that links work and that the diff does not imply unverified security guarantees.

## Security & Configuration

This repository describes a planned system, not a production-ready implementation. Do not present the design as validated or recommend using it with production cloud permissions. Preserve the stated constraints around credential handling, per-operation approval, IAM scope, and user-managed agent isolation when editing security documentation.
