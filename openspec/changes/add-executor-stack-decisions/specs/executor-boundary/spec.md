# executor-boundary Specification (delta)

## Purpose

Defines the trust boundary between the untrusted AI agent and the local trusted executor: what the agent-facing surface may accept and return, and what it must never expose. These requirements are design requirements for the MVP implementation; they are not implemented or verified yet.

## ADDED Requirements

### Requirement: Unprivileged agent interface

The executor SHALL expose exactly one agent-facing interface that accepts only typed requests matching the versioned Kipfer request schema. The interface SHALL return only non-secret plan, status, and result data.

#### Scenario: Agent submits a typed request

- **WHEN** the agent submits a typed request that matches the current schema version
- **THEN** the executor validates the request and returns a plan reference with a plan digest and status, without granting any cloud credential

#### Scenario: Agent submits an unknown request type

- **WHEN** the agent submits a request that does not match the schema or references an unknown operation
- **THEN** the executor rejects the request and executes no cloud operation

### Requirement: No privileged network endpoints

The executor MUST NOT expose privileged execution, credential issuance, token retrieval, or approval endpoints on any network interface, including loopback. Privileged logic SHALL run in-process and SHALL start only from a browser-approved session.

#### Scenario: Agent tries to forge an approval

- **WHEN** the agent sends a crafted HTTP request to any executor port that mimics owner approval
- **THEN** the executor does not create or extend an approval session

#### Scenario: Agent requests a cloud token

- **WHEN** the agent requests an OAuth access token, an impersonated token, or any cloud credential through the agent-facing interface
- **THEN** the executor refuses the request and returns an error

### Requirement: User-started executor process

The trusted executor SHALL run as a process started by the user or by a user-managed system service. The agent-facing CLI SHALL act only as a client of that process and SHALL NOT spawn privileged logic as a child process of the agent.

#### Scenario: Daemon is not running

- **WHEN** the agent invokes the CLI while the executor daemon is not running
- **THEN** the CLI reports that Kipfer is unavailable and no privileged operation starts

### Requirement: Fail-safe approval sessions

Approval sessions SHALL exist only in the memory of the executor process. A daemon restart MUST invalidate all pending approval sessions and MUST NOT resume an interrupted privileged operation.

#### Scenario: Daemon restarts during an approved operation

- **WHEN** the executor process stops and starts again while a privileged operation runs
- **THEN** the operation stops, no credential survives in memory or on disk, and a new owner approval is required before any retry

### Requirement: No credentials through the agent boundary

The agent-facing interface, its responses, and all executor logs MUST NOT contain OAuth access tokens, refresh tokens, impersonated tokens, or service-account keys.

#### Scenario: Credential exposure scan

- **WHEN** the executor processes requests and writes responses and logs
- **THEN** a scan of the agent-facing traffic and log files finds no cloud credential material
