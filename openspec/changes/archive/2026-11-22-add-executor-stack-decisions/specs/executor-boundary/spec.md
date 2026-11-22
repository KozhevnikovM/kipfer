# executor-boundary Specification (delta)

## Purpose

Defines the trust boundary between the untrusted AI agent and the local trusted executor: what the agent-facing surface may accept and return, which local listeners exist, and what they must never do. These requirements are design requirements for the MVP implementation. They are not implemented or verified yet.

## ADDED Requirements

### Requirement: Unprivileged agent interface

The executor SHALL expose exactly one agent-facing interface that accepts only typed requests matching the versioned Kipfer request schema. The interface SHALL return only non-secret plan, status, and result data.

#### Scenario: Agent submits a typed request

- **WHEN** the agent submits a typed request that matches the current schema version
- **THEN** the executor validates the request and returns a plan reference with a plan digest and status, without granting any cloud credential

#### Scenario: Agent submits an unknown request type

- **WHEN** the agent submits a request that does not match the schema or references an unknown operation
- **THEN** the executor rejects the request and executes no cloud operation

### Requirement: Constrained loopback listeners

The executor SHALL run only these local listeners, all bound to loopback: the agent API, the OAuth callback handler, and the approval UI. No listener SHALL execute a privileged cloud operation or issue a credential. The OAuth callback handler SHALL accept a callback only for a session that the executor created and that matches the state value of that session (ADR-0004). The approval UI SHALL record an approval only for a session that the executor created and that carries valid owner-presence proof. The approval-mechanism ADR defines that proof. Privileged execution SHALL have no listener.

#### Scenario: Agent tries to forge an approval

- **WHEN** the agent sends a crafted HTTP request to any executor listener that mimics owner approval
- **THEN** the executor does not create, extend, complete, or replay an approval session

#### Scenario: Agent requests a cloud token

- **WHEN** the agent requests an OAuth access token, an impersonated token, or any cloud credential through the agent-facing interface
- **THEN** the executor refuses the request and returns an error

### Requirement: Separated daemon entry point

The agent-facing CLI SHALL be a client-only build with no daemon code. The daemon SHALL be a separate build output that the user installs and starts. The executor SHALL allow at most one daemon instance per user account. The design cannot distinguish a user-started daemon from an agent-started daemon process under the same OS account. The approval and owner-presence controls are the boundary for that case, and agent isolation stays user-managed per ADR-0003.

#### Scenario: Agent runs the client binary

- **WHEN** the agent runs the client binary in any mode
- **THEN** the process performs client operations only; the build contains no daemon code and cannot start privileged logic

#### Scenario: Daemon is not running

- **WHEN** the agent invokes the CLI while the daemon is not running
- **THEN** the CLI reports that Kipfer is unavailable and no privileged operation starts

#### Scenario: Second daemon instance starts

- **WHEN** a second daemon instance starts for the same user account
- **THEN** the new instance refuses to start and exits without creating approval sessions or credentials

### Requirement: Fail-safe approval sessions

An approval session SHALL exist only in the memory of the daemon process. Session identifiers, OAuth state values, and PKCE verifiers SHALL never persist to disk. A daemon restart MUST invalidate all pending approval sessions and MUST NOT resume an interrupted privileged operation. After a restart, the executor SHALL record the interrupted operation as unverified in the non-secret execution status.

#### Scenario: Daemon restarts during an approved operation

- **WHEN** the daemon process stops and starts again while a privileged operation runs
- **THEN** the operation stops, the execution status records the operation as unverified, no credential survives in memory or on disk, and a new owner approval is required before any retry

### Requirement: No credentials through the agent boundary

The agent-facing interface, its responses, and all executor logs MUST NOT contain OAuth access tokens, refresh tokens, impersonated tokens, service-account keys, authorization codes, PKCE verifiers, or any other credential material. Persisted non-secret metadata (plan digests, approval records, execution status) MUST NOT contain credential material.

#### Scenario: Credential exposure scan

- **WHEN** the executor processes requests and writes responses, logs, and metadata records
- **THEN** a scan of the agent-facing traffic, log files, and metadata store finds no cloud credential material
