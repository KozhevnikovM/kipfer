# Proposal: add-executor-stack-decisions

## Why

The concept ([CONCEPT.md](../../../docs/CONCEPT.md)) and ADR-0001..0004 fix the security architecture, but no implementation stack, executor process model, or agent interface contract is decided. The MVP in CONCEPT section 8 cannot start, and the open technical questions cannot be turned into spikes, until these decisions are recorded. This change records them as ADRs while the design is still small and cheap to revise.

## What Changes

- Add **ADR-0005 — Go Stack with Two Build Outputs**: one Go codebase compiled as two static binaries; a client-only `kipfer` CLI for the agent and a `kipferd` daemon with all privileged logic; a minimal curated dependency policy because the executor dependency tree is part of the trusted computing base.
- Add **ADR-0006 — User-Started Executor Daemon with Constrained Listeners**: the user installs and starts the daemon; the agent uses a client-only CLI against an unprivileged typed localhost API; the daemon runs only constrained loopback listeners; privileged execution has no listener; daemon restart fails safe; an MCP adapter may wrap the same API later.
- Record the **first MVP resource template = Cloud Run service** as a design decision. It fits the 15-minute token target and avoids long-running operations, which narrows open technical question 5 in CONCEPT.
- Record **candidate solutions** for open technical questions and define spikes:
  - Owner-presence proof: WebAuthn user verification with an available authenticator (platform or roaming) on the approval page (open question 1).
  - Effective-permission checks: Google Cloud Policy Troubleshooter API (open question 3).
  - Minimum OAuth scopes and IAM permissions for the Cloud Run template, validated against a scratch project (open question 2).
- Update `docs/CONCEPT.md` (accepted decisions list, stack and process-model notes, Cloud Run template record, open question status) and `README.md` (architecture document links, install and start step).

This change is documentation only. It adds no source code and does not claim any implemented or verified security behavior.

## Capabilities

### New Capabilities

- `executor-boundary`: Requirements for the trust boundary between the untrusted AI agent and the local trusted executor: unprivileged typed agent API, constrained loopback listeners, a separated daemon entry point (client-only build, one daemon instance per user account), user-started daemon ownership, in-memory approval sessions, and fail-safe restart behavior. These are design requirements, not implemented behavior.

### Modified Capabilities

None. No capability specs exist yet.

## Impact

- New files: `docs/adr/ADR-0005-go-stack-two-build-outputs.md`, `docs/adr/ADR-0006-user-started-executor-daemon.md`, `openspec/specs/executor-boundary/spec.md`, `openspec/config.yaml` (project configuration).
- Updated files: `docs/CONCEPT.md`, `README.md`, `docs/adr/ADR-0001-local-executor-bootstrap.md` through `docs/adr/ADR-0004-google-oauth-application.md` (Related lines and one ADR-0001 amendment note).
- No application code, APIs, or external dependencies are introduced. The future implementation stack (Go) is decided but not installed.
- Follow-up work created by this change: three security design spikes (WebAuthn approval proof, minimum IAM and OAuth scope set for the Cloud Run template, Policy Troubleshooter caller and coverage). These spikes must resolve CONCEPT open questions 1, 2, and 3 before any privileged code path is written.
