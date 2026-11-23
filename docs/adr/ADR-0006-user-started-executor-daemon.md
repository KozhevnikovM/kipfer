# ADR-0006: User-Started Executor Daemon with Constrained Listeners

- **Status:** Accepted (design decision; implementation and security validation pending)
- **Date:** 2026-11-22
- **Related:** [Kipfer Concept](../CONCEPT.md), [ADR-0001](ADR-0001-local-executor-bootstrap.md), [ADR-0002](ADR-0002-per-operation-browser-authorization.md), [ADR-0003](ADR-0003-ephemeral-credentials-user-managed-sandbox.md), [ADR-0004](ADR-0004-google-oauth-application.md), [ADR-0005](ADR-0005-go-stack-two-build-outputs.md)

## Context

ADR-0001 requires a local trusted executor that receives only typed, unprivileged requests from the AI agent. It does not fix the process model. The common integration pattern for AI agent tools is agent-spawned tool processes, for example a stdio MCP server. This pattern gives the untrusted agent control over the trusted process environment: variables, arguments, working directory, and lifecycle. A trusted executor launched this way does not satisfy the ADR-0001 trust model.

Further constraints apply:

- ADR-0002 requires that an approval cannot be forged through the agent-facing API and binds each approval to a unique execution session.
- ADR-0004 requires a loopback OAuth callback handled by the trusted executor.
- CONCEPT open question 1 asks how a browser approval can prove an independent owner action when the agent can send arbitrary local HTTP requests.

## Decision

1. Ship two build outputs ([ADR-0005](ADR-0005-go-stack-two-build-outputs.md)): the client-only `kipfer` CLI for the agent, and the `kipferd` daemon with all privileged logic. The user installs and starts `kipferd`. Kipfer gives the agent only the `kipfer` binary. The `kipferd` binary is executable under the same OS account; see item 5.
2. `kipfer` is only a client of the daemon's agent interface. It contains no privileged logic and holds no credentials.
3. Expose exactly **one unprivileged agent-facing interface**: a versioned JSON Schema request contract served on a loopback port. It returns only non-secret plan, status, and result data. A transport-independent contract keeps the boundary testable and leaves room for an MCP adapter later.
4. Run **only these loopback listeners** in `kipferd`: the agent API, the OAuth callback handler, and the approval UI. No listener executes a privileged cloud operation or issues a credential. The OAuth callback handler accepts a callback only for a session that the daemon created and that matches the state value of that session (ADR-0004). The approval UI records an approval only for a session that the daemon created and that carries valid owner-presence proof; the approval-mechanism ADR defines that proof. Privileged execution has no listener. The approval and callback handlers remain local attack targets. ADR-0002, ADR-0004, and the approval-mechanism ADR define their protections.
5. Allow **at most one `kipferd` instance per user account** (single-instance lock). Under one OS account, Kipfer cannot distinguish a user-started daemon from an agent-started `kipferd` process. For that case, the single-instance lock and the owner-presence mechanism only reduce the attack paths. They are not a trust boundary. User-managed agent isolation (ADR-0003) is the trust boundary for that case.
6. Hold approval sessions **only in daemon memory**. A restart invalidates pending sessions and stops local execution. The executor never resumes the interrupted operation. The cloud provider can complete an operation that it has already accepted. Kipfer cannot stop it. The executor records the interrupted operation as `unverified`. It stores the cloud-side operation identifier when the provider returns one. Before a repeated mutation, the executor reads the cloud-side operation or resource state in the approved project and shows it to the user. This read-only reconciliation uses the restricted deployment identity inside the new browser-authorized session. It sends no mutation. The repeated mutation requires a new browser flow and a new owner approval. This is the designed behavior for the ADR-0002 fail-safe requirement; validation is pending.
7. Use **manual daemon start in a user terminal as the MVP baseline**. Document that user-level autostart entries (`~/.config/systemd/user/`, launchd user agents) are agent-writable and must not be treated as a trusted bootstrap. Kipfer ships no default autostart in the MVP.
8. An MCP server adapter MAY be added later as a **client-facing wrapper of the same unprivileged API**. The adapter must never run privileged logic inside a process the agent spawned.
9. Present WebAuthn user verification on the approval page as the **candidate** owner-presence mechanism (platform authenticator; `localhost` is a valid WebAuthn RP ID). It stays a candidate until a design spike validates platform and roaming authenticator coverage, `clientDataJSON` origin binding for local origins, the owner authenticator enrollment procedure, and fail-closed fallback without an available authenticator. A separate ADR will decide the final approval mechanism.

## Consequences

**Benefits**

- The `kipfer` binary contains no daemon code. The agent cannot start privileged logic from the `kipfer` binary.
- Privileged execution has no dedicated listener. The three permitted listeners do not execute privileged operations or issue credentials.
- The user-started daemon is not spawned by the agent and ignores proxy and CA environment influences (ADR-0005). Agent control of the daemon environment is removed for this case.
- Restart-fail-safe behavior is a design property of in-memory sessions; validation is pending.

**Limits and costs**

- The user must install and start `kipferd` manually. This is accepted friction (ADR-0002 accepts an extra browser step for a similar reason).
- A same-user agent can signal, ptrace, or read the daemon, or start a competing `kipferd` process before the user does. The single-instance lock and the owner-presence mechanism reduce these paths; user-managed isolation (ADR-0003) remains the real boundary. Kipfer must not claim protection against an unrestricted same-user agent.
- A sandboxed agent can run in a network namespace that cannot reach the loopback agent API. The deployment pattern for that case is an open question.
- A daemon-side crash during a long operation loses the session, and the user repeats the approval. The cloud provider can finish an operation that it already accepted. Kipfer cannot stop it and reports the result as `unverified`. Accepted cost; first-template operations stay short (Cloud Run).

## Rejected alternatives

- **Agent-spawned per-operation CLI (the executor is the CLI):** rejected; the agent controls the environment of the trusted process.
- **One combined binary for CLI and daemon:** rejected; the agent-facing binary must not contain daemon code.
- **Privileged socket or RPC endpoint on the daemon:** rejected; a privileged endpoint reachable from the agent namespace contradicts the boundary goal and gives the agent a target for approval forgery and token retrieval.
- **Agent-spawned stdio MCP server as the privileged component:** rejected; same environment-control problem as per-operation spawn.
- **Daemon with a background token refresher:** rejected; conflicts with ADR-0002 requirement 6 (no background credential renewal path).

## Validation

- With the daemon stopped, `kipfer` calls fail closed and start no privileged operation.
- The `kipfer` build contains no daemon code (see ADR-0005 validation).
- A second `kipferd` instance for the same user account refuses to start.
- Crafted HTTP requests to each of the three listeners cannot create, extend, complete, or replay an approval session and cannot retrieve any credential.
- A daemon restart during an approved operation stops local execution, records the interrupted operation as `unverified`, leaves no credential in memory or on disk, and does not resume the operation.
- A repeated mutation first reads and shows the cloud-side operation or resource state in the approved project. It then requires a new browser flow and a new owner approval before the mutation.
- A response and log scan across the agent-facing interface finds no credential material (shared with ADR-0005 validation and the ADR-0003 validation plan).
- The documented boot story matches the shipped default: manual start, with the autostart threat explicitly stated.
