# ADR-0003: Ephemeral Credentials and User-Managed Agent Isolation

- **Status:** Accepted
- **Date:** 2026-11-22
- **Related:** [Kipfer Concept](../CONCEPT.md), [ADR-0001](ADR-0001-local-executor-bootstrap.md), [ADR-0002](ADR-0002-per-operation-browser-authorization.md), [ADR-0004](ADR-0004-google-oauth-application.md), [ADR-0005](ADR-0005-go-stack-two-build-outputs.md), [ADR-0006](ADR-0006-user-started-executor-daemon.md)

## Context

The first design required Kipfer to isolate AI agents as well as manage cloud access. That would require a separate OS security product. The owner prefers a simpler responsibility split.

The user's agent sandbox can be a separate project or an existing tool. [Anthropic Sandbox Runtime](https://github.com/anthropics/sandbox-runtime) is a possible integration, not a dependency.

## Decision

1. Kipfer must **not persist cloud credentials**. It must not store OAuth refresh tokens, service-account JSON keys, or access tokens in project files, configuration, environment exports, logs, or crash reports.
2. The local trusted executor may hold temporary credentials in process memory during one approved operation. It discards them when the operation ends.
3. The AI agent receives only non-secret requests and results. Kipfer must not expose `get-token`, privileged `exec`, or arbitrary credential-bearing subprocess access.
4. The **user is responsible for agent isolation**. The user must keep the agent away from the trusted executor, OAuth callback, active browser session, token-bearing process memory, and credential files of other applications.
5. Kipfer does not install, manage, or certify an agent sandbox in the MVP. It must document isolation assumptions and warn when it cannot verify them.
6. Do not claim that ephemeral in-memory credentials are safe against an unrestricted agent under the same OS account. Such an agent may attack the live process or browser authorization flow.
7. Kipfer remains responsible for GCP-side IAM scope, permission review, expiration, revocation, and approved-plan enforcement. These controls are **not** assigned to the user.

## Consequences

- The MVP remains small and local-first.
- Browser authentication is required on each privileged operation.
- No durable secret store or background token refresher is necessary.
- The product does not guarantee protection against same-user process compromise without a separate, effective OS boundary.
- Sandbox research can continue as an independent project.

## Validation

Check that no secret enters the workspace, logs, process arguments, crash artifacts, or unprivileged agent API. Test with an isolated agent. Report the required sandbox assumptions and the limits of local process protection.
