# ADR-0006: User-Started Executor Daemon and Agent Boundary

- **Status:** Proposed (pending owner confirmation)
- **Date:** 2026-11-22
- **Related:** [Kipfer Concept](../CONCEPT.md), [ADR-0001](ADR-0001-local-executor-bootstrap.md), [ADR-0002](ADR-0002-per-operation-browser-authorization.md), [ADR-0003](ADR-0003-ephemeral-credentials-user-managed-sandbox.md), [ADR-0004](ADR-0004-google-oauth-application.md)

## Context

ADR-0001 requires a local trusted executor that receives only typed, unprivileged requests from the AI agent. It does not fix the process model. The common integration pattern for AI agent tools — the agent spawns the tool process (for example, a stdio MCP server) — gives the untrusted agent control over the trusted process environment: variables, arguments, working directory, and lifecycle. A trusted executor launched this way does not satisfy the ADR-0001 trust model.

Two further constraints apply:

- ADR-0002 requires that an approval cannot be forged through the agent-facing API and binds each approval to a unique execution session.
- CONCEPT open question 1 asks how a browser approval can prove an independent owner action when the agent can send arbitrary local HTTP requests.

## Decision

1. Run the trusted executor as a **daemon started by the user** (or a user-managed system service). The agent never starts, signals, or configures the privileged process.
2. Provide the agent with a **thin CLI that is only a client** of the daemon's unprivileged interface. The CLI contains no privileged logic and holds no credentials.
3. Expose exactly **one unprivileged agent-facing interface**: a versioned JSON Schema request contract served on a loopback port. It returns only non-secret plan, status, and result data. A transport-independent contract keeps the boundary testable and leaves room for an MCP adapter later.
4. Keep all privileged logic **in-process with no network endpoint**. Privileged execution starts only inside a browser-approved session created through the OAuth loopback callback and the approval UI (ADR-0004). There is no privileged port to attack.
5. Hold approval sessions **only in daemon memory**. A daemon restart invalidates all pending sessions, stops interrupted operations, and requires a new browser flow and approval for any retry. This implements the ADR-0002 fail-safe requirement structurally.
6. Use **manual daemon start in a user terminal as the MVP baseline**. Document that user-level autostart entries (`~/.config/systemd/user/`, launchd user agents) are agent-writable and must not be treated as a trusted bootstrap. Kipfer ships no default autostart in the MVP.
7. An MCP server adapter MAY be added later as a **client-facing wrapper of the same unprivileged API**. The adapter must never run privileged logic inside a process the agent spawned.
8. Present WebAuthn user verification on the approval page as the **candidate** owner-presence mechanism (platform authenticator; `localhost` is a valid WebAuthn RP ID). This remains a candidate until a design spike validates platform coverage and fail-closed fallback. A separate ADR will decide the final approval mechanism.

## Consequences

**Benefits**

- The privileged logic is unreachable from the agent's network namespace: there is no privileged endpoint to forge, replay, or scan for tokens.
- Agent control of the process environment is removed from the trust equation for the executor.
- Restart-fail-safe behavior is a structural property, not an enforced rule.

**Limits and costs**

- The user must start the daemon manually. This is accepted friction (ADR-0002 accepts an extra browser step for the same reason).
- A same-user agent can still ptrace the daemon, read its memory, or attack the browser session. This ADR does not change the ADR-0003 position: Kipfer does not protect the live process against an unrestricted same-user agent, and must say so in security documents.
- A daemon-side crash during a long operation loses the session and the user repeats the approval. Accepted cost; operations are expected to stay short (first template: Cloud Run).

## Rejected alternatives

- **Agent-spawned per-operation CLI (the executor is the CLI):** rejected; the agent controls the environment of the trusted process.
- **Privileged socket or RPC endpoint on the daemon:** rejected; a reachable privileged endpoint contradicts the boundary goal and gives the agent a target for approval forgery and token retrieval.
- **Agent-spawned stdio MCP server as the privileged component:** rejected; same environment-control problem as per-operation spawn.
- **Daemon with a background token refresher:** rejected; conflicts with ADR-0002 requirement 6 (no background credential renewal path).

## Validation

- With the daemon stopped, agent CLI calls fail closed and start no privileged operation.
- Crafted HTTP requests to every port the binary listens on cannot create, extend, or replay an approval session and cannot retrieve any credential.
- A daemon restart during an approved operation stops the operation, leaves no credential in memory or on disk, and requires a new browser flow and approval.
- A response/log scan across the agent-facing interface finds no credential material (shared with ADR-0005 validation and the ADR-0003 validation plan).
- The documented boot story matches the shipped default: manual start, with the autostart threat explicitly stated.
