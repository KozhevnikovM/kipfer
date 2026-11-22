# ADR-0002: Browser Authorization for Every Privileged Operation

- **Status:** Accepted (approval mechanism needs validation)
- **Date:** 2026-11-22
- **Related:** [Kipfer Concept](../CONCEPT.md), [ADR-0001](ADR-0001-local-executor-bootstrap.md), [ADR-0003](ADR-0003-ephemeral-credentials-user-managed-sandbox.md), [ADR-0004](ADR-0004-google-oauth-application.md), [ADR-0005](ADR-0005-go-stack-two-build-outputs.md), [ADR-0006](ADR-0006-user-started-executor-daemon.md)

## Context

Infrastructure changes are relatively rare. The owner prefers an explicit decision before each change rather than unattended execution. A 10-day cloud IAM grant does not mean the agent may make changes on its own during that period.

## Decision

1. Every privileged resource change requires **new interactive browser authorization** and **separate owner approval** of the exact infrastructure plan.
2. A Google OAuth sign-in grants temporary access to Google APIs. It does **not** approve a resource plan.
3. Bind each owner approval to the user, project, operation, plan digest, expiry, and unique execution session. Reject replay and changed plans.
4. The local trusted executor obtains temporary credentials for the approved operation. Do not save a user refresh token or a service-account key.
5. Grant validity is limited to **10 days** on the Google Cloud side. It cannot be renewed by the agent. New or expanded IAM permissions require owner action.
6. The executor must stop safely if the authorization or execution session is no longer valid. It must not use a background credential renewal path.
7. The approval UI must not trust requests from agent-controlled localhost endpoints as proof of human intent.

The browser might reuse the user's Google sign-in session. A new OAuth flow does **not** always mean a new password prompt. Kipfer still requires an independent plan confirmation on every operation.

## Consequences

- The owner sees the requested actions and permissions each time.
- The MVP does not need unattended Workload Identity Federation.
- Operations take an extra browser step. This is an accepted cost.
- A secure owner-presence and approval mechanism remains a blocking security design task.

## Validation

Test replay, forged approval, plan changes after approval, expired sessions, interrupted operations, and use of a grant without a fresh approval. All tests must fail closed.
