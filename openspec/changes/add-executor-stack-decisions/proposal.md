# Proposal: add-executor-stack-decisions

## Why

The concept ([CONCEPT.md](../../../docs/CONCEPT.md)) and ADR-0001..0004 fix the security architecture, but no implementation stack, executor process model, or agent interface contract is decided. The MVP in CONCEPT section 8 cannot start, and the open technical questions cannot be turned into spikes, until these decisions are recorded. This change records them as ADRs while the design is still small and cheap to revise.

## What Changes

- Add **ADR-0005 — Go Single-Binary Implementation Stack**: Go as the implementation language; one static binary for CLI, daemon, templates, and approval UI; a minimal curated dependency policy because the executor dependency tree is part of the trusted computing base.
- Add **ADR-0006 — User-Started Executor Daemon and Agent Boundary**: the trusted executor runs as a user-started daemon; the agent uses an unprivileged typed localhost API through a thin CLI; privileged logic has no network endpoint and runs in-process only after a browser-approved session; daemon restart fails safely; an MCP adapter may wrap the same API later.
- Record the **first MVP resource template = Cloud Run service** as a design decision. It fits the 15-minute token target and avoids long-running operations, which narrows open technical question 5 in CONCEPT.
- Record **candidate solutions** for two open technical questions and define spikes:
  - Owner-presence proof: WebAuthn user verification with a platform authenticator on the approval page.
  - Effective-permission checks: Google Cloud Policy Troubleshooter API.
- Update `docs/CONCEPT.md` (accepted decisions list, stack notes) and `README.md` (architecture document links).

This change is documentation only. It adds no source code and does not claim any implemented or verified security behavior.

## Capabilities

### New Capabilities

- `executor-boundary`: Requirements for the trust boundary between the untrusted AI agent and the local trusted executor: unprivileged typed agent API, absence of privileged network endpoints, user-started daemon ownership, in-memory approval sessions, and fail-safe restart behavior. These are design requirements, not implemented behavior.

### Modified Capabilities

None. No capability specs exist yet.

## Impact

- New files: `docs/adr/ADR-0005-go-single-binary-stack.md`, `docs/adr/ADR-0006-user-started-executor-daemon.md`, `openspec/specs/executor-boundary/spec.md`.
- Updated files: `docs/CONCEPT.md`, `README.md`.
- No application code, APIs, or external dependencies are introduced. The future implementation stack (Go) is decided but not installed.
- Follow-up work created by this change: two security design spikes (WebAuthn approval proof, minimum IAM and OAuth scope set for the Cloud Run template). These spikes must resolve CONCEPT open questions 1 and 2 before any privileged code path is written.
