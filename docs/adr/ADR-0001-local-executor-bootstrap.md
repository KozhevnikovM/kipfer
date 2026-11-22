# ADR-0001: Local Trusted Executor and Temporary Browser Bootstrap

- **Status:** Accepted (implementation details need validation)
- **Date:** 2026-11-22
- **Related:** [Kipfer Concept](../CONCEPT.md), [ADR-0002](ADR-0002-per-operation-browser-authorization.md), [ADR-0003](ADR-0003-ephemeral-credentials-user-managed-sandbox.md), [ADR-0004](ADR-0004-google-oauth-application.md)

## Context

An AI agent must request cloud infrastructure without receiving the user's account credentials. A user with a new Google Cloud project needs a browser-first setup that does not require local cloud SDK tools.

A shared localhost process does not give a secure boundary against an unrestricted agent that runs as the same OS user.

## Decision

1. Run a **local trusted executor**. The agent can send only typed, unprivileged requests.
2. The executor handles browser OAuth and temporary user credentials. The agent must never receive tokens, modify trusted policies, or access privileged execution endpoints.
3. Use an initial browser authorization to create or verify one dedicated, limited **deployment service account** in the selected GCP project. The executor performs this bootstrap, not the agent.
4. Use project-scoped IAM permissions and time-bound grants that expire within **10 days**. Do not permit silent renewal, self-escalation, broad IAM administration, or service-account key creation.
5. Keep deployment and workload runtime identities separate. Revoking deployment access must not delete deployed resources.
6. Execute resource operations with the restricted deployment identity. When needed, the executor uses fresh interactive user authorization to obtain a short-lived token through service-account impersonation.
7. Ask the owner to approve an immutable plan before each privileged operation. Approval must not be forged through the agent-facing API.
8. Support owner-driven emergency revocation. Report verified and unverified results separately.

**Amendment:** ADR-0002 requires fresh browser authorization per operation. ADR-0003 assigns isolation of the agent to the user. ADR-0004 defines the Google OAuth Desktop App interface. These newer ADRs clarify, but do not remove, the local executor and least-privilege requirements.

## Consequences

- No mandatory `gcloud` setup or long-lived service-account keys.
- Bootstrap uses a temporary user token that may have broad user-level permissions. It must stay inside the trusted executor.
- Creating a service account does **not** by itself allow impersonation. The executor must prove the authentication path.
- Security against live credential theft depends on user-provided OS isolation. Kipfer does not implement a sandbox in the MVP.
- GCP IAM propagation and existing tokens can delay full revocation.

## Validation

Test project scope, effective IAM permissions, impersonation restrictions, plan approval replay, grant expiry, emergency revocation, and credential exposure. Do not claim a secure release until these tests pass.
