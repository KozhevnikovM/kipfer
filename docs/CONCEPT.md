# Kipfer — Product Concept

**Version:** 0.5 (design baseline)  
**Date:** 2026-11-22  
**Status:** Concept. Not an implementation specification.

**Accepted decisions:** [ADR-0001](adr/ADR-0001-local-executor-bootstrap.md), [ADR-0002](adr/ADR-0002-per-operation-browser-authorization.md), [ADR-0003](adr/ADR-0003-ephemeral-credentials-user-managed-sandbox.md), [ADR-0004](adr/ADR-0004-google-oauth-application.md), [ADR-0005](adr/ADR-0005-go-stack-two-build-outputs.md), [ADR-0006](adr/ADR-0006-user-started-executor-daemon.md).

## 1. Purpose

Kipfer lets AI coding agents request cloud infrastructure. The user keeps control of cloud access.

The agent sends a typed, unprivileged request. A **local trusted executor** validates the request, prepares an approved plan, and uses temporary cloud credentials to execute it.

Kipfer is not a new AI agent, IaC engine, or sandbox. It uses existing cloud APIs. Google Cloud is the first target. Other providers are future work.

## 2. User scenarios

### UC-01: Connect a Google Cloud project

The user has a Google Cloud project but has no local `gcloud`, Terraform, or saved cloud credentials.

1. The agent requests cloud resources.
2. Kipfer opens the system browser.
3. The user signs in through the **Kipfer Google OAuth desktop application**.
4. The user selects or enters one target **project ID in the Kipfer UI**.
5. Kipfer shows the proposed resource plan, requested API enablements, exact IAM permissions, role scope, expiry, and risks.
6. The user explicitly approves the plan. Google OAuth sign-in is **not** plan approval.
7. The trusted executor uses temporary user authorization to create or verify a dedicated, limited deployment service account.
8. The executor validates the effective permissions and executes the approved operation with a short-lived impersonated token.
9. The executor discards temporary credentials. It does not store a refresh token or service-account key.

A Google OAuth grant does **not** restrict a user token to one Google Cloud project. Project scope requires separate cloud IAM controls and strict executor behavior.

### UC-02: Provision infrastructure

Example: "Create PostgreSQL, a VPN gateway, and a cloud function. The budget is USD 200 per month."

The agent may propose several architectures. It must state workload assumptions and unknown costs. Kipfer validates a typed resource plan against trusted templates and policies. The user approves a **specific plan digest** before any privileged change.

The cost estimate does not guarantee a billing cap.

### UC-03: Estimate hosting cost

The user asks Kipfer to examine a local repository and compare hosting options.

The agent may inspect permitted project files and produce a read-only assessment. It must not execute untrusted code or read secret values without separate authorization. This analysis does not grant permission to deploy.

### UC-04: Request more permissions

If a plan needs a new role, API, resource type, or project, Kipfer shows a permission delta and requires new owner approval. The agent cannot enlarge or renew its own grant.

### UC-05: Revoke access

The owner may end access early. Cloud-side grants expire within **10 days** without automatic renewal. The owner can also use a documented Google Cloud emergency procedure if Kipfer is unavailable.

Revocation blocks new operations and token issuance paths. IAM propagation and already-issued tokens can delay full effect. Kipfer must report unverified revocation. Revoking a deployment identity does not delete running services.

## 3. Architecture and trust boundary

```text
Untrusted AI agent (sandbox provided by the user)
    |
    | Typed request; no cloud tokens
    v
Kipfer CLI / unprivileged interface
    |
    v
Local Trusted Executor
    |-- request validation and policy checks
    |-- trusted resource templates
    |-- immutable plan digest
    |-- independent owner approval in browser
    |-- Google OAuth Desktop App: Authorization Code + PKCE
    |-- ephemeral user credential for bootstrap / impersonation
    |-- dedicated project-scoped deployment service account
    |-- short-lived deployment token
    |-- verified execution and audit
    v
Selected Google Cloud project
    |-- resource APIs and IAM bindings
    |-- time-limited grants (<= 10 days)
    |-- separate workload runtime identities
```

The implementation stack and process model are decided in [ADR-0005](adr/ADR-0005-go-stack-two-build-outputs.md) and [ADR-0006](adr/ADR-0006-user-started-executor-daemon.md). One Go codebase builds two binaries. `kipfer` is a client-only CLI for the agent. `kipferd` is the daemon with all privileged logic. The user installs and starts `kipferd` manually in the MVP. The daemon runs only constrained loopback listeners: the agent API, the OAuth callback handler, and the approval UI. Privileged execution has no listener. These are design decisions. Implementation and security validation are pending.

Kipfer stores **non-secret metadata only**: target project, plan digest, approval record, grant expiry, execution status, and audit references. It must not persist user OAuth refresh tokens, service-account JSON keys, or access tokens.

The executor must not provide generic `gcloud`, `exec`, `get-token`, or unrestricted Terraform execution with cloud privileges. It must not run agent-provided provider plugins or shell scripts under the privileged identity.

The user must isolate the AI agent from the system browser, OAuth callback, executor process, and other credential-bearing processes. Kipfer does not create or verify that OS sandbox in the MVP. **An unrestricted same-user agent can defeat a process-only boundary.**

## 4. Browser authorization and approval

Kipfer uses a registered **Google OAuth desktop application** with a public client ID. The user does not need to register a personal OAuth client or install the Google Cloud SDK.

The local executor starts an Authorization Code flow with **PKCE** and a system-browser redirect to a loopback address. It validates the callback, anti-CSRF state, session binding, and token response.

- The Google consent screen identifies Kipfer and requests Google OAuth scopes.
- The Kipfer UI identifies the selected project, cloud APIs, **IAM permissions**, proposed bindings, and resource plan.
- The user must approve the resource plan independently of the Google OAuth step.
- Every privileged operation requires a new interactive browser flow and plan approval.
- A Google browser session may reduce repeated password prompts. The design does not claim that a new password entry is guaranteed on every operation.
- No OAuth `offline` access or saved refresh token is allowed.
- The first bootstrap needs a user who can create service accounts and modify the required IAM policies. If these permissions are missing, Kipfer stops and shows the missing steps.

A Google OAuth scope such as `cloud-platform` may let the user token call services across every project where the user already has IAM rights. **Kipfer cannot make this user token project-scoped.** The executor must limit user-token use to the approved bootstrap and impersonation path. Resource deployment must use the restricted deployment identity.

The exact OAuth scopes, Google verification requirements, and authorization UI protections need a technical spike. A public release may require Google's OAuth app verification process.

## 5. Permissions and expiry

| Control | Decision |
| --- | --- |
| Target scope | One explicitly approved project per grant |
| Deployment identity | Dedicated service account with least privilege |
| Runtime identity | Separate from the deployment identity |
| Grant lifetime | Up to **10 days**, enforced by GCP IAM conditions where supported |
| Renewal | Never automatic |
| User authorization | New browser authorization for each privileged operation |
| Plan approval | One-time, bound to user, project, session, digest, and expiry |
| Access token lifetime | Target 15 minutes; actual supported TTL must be verified |
| Execution session | Target 30 minutes; fail safely or request new approval |
| Keys | No downloadable or stored service-account keys |
| Refresh tokens | No persistent OAuth refresh tokens |

The deployment identity must not edit its own IAM policy, issue service-account keys, impersonate arbitrary identities, or attach privileged runtime service accounts. A required `iam.serviceAccounts.actAs` permission must be scoped to a specific runtime account. The executor must check inherited roles and other effective access paths.

## 6. Guardrails

**Scope guard:** Check target project and effective IAM access. Do not trust only the agent-supplied project ID.

**Permission guard:** Refuse broad project owner/editor roles, unrestricted IAM mutations, key creation, or self-escalation. Fail closed when access cannot be verified.

**Plan guard:** Execute only approved, typed operations from trusted templates. Recheck the exact plan before execution. Do not accept arbitrary agent-supplied IaC as privileged code.

**Approval guard:** A localhost POST from the agent must not count as user approval. Approval must be independent and resistant to replay. The exact proof of owner presence is an open security design task.

**Lifecycle guard:** Keep grant expiry and revocation in Google Cloud, not only in a Kipfer database. Verify completion and report uncertainty.

**Cost guard:** Estimate costs and restrict resource types, regions, size, and count. Do not promise a strict USD 200/month ceiling from cloud budgets alone.

## 7. Revocation states

- `ACTIVE`: The grant exists, but each operation still requires fresh owner approval and authorization.
- `EXPIRED`: Its cloud-side expiry has passed.
- `REVOKING`: Kipfer is blocking new work and requesting cloud-side revocation.
- `REVOKED_VERIFIED`: Cloud-side permissions and token-issuance paths have been checked.
- `REVOKED_UNVERIFIED`: Kipfer cannot prove full revocation; notify the owner and prevent new work.

A short-lived token can remain valid for some time after IAM changes. Emergency guidance must explain this limit. Existing infrastructure must remain independent of the deployment identity.

## 8. MVP

**MVP goal:** Prove safe cloud access delegation for one Google Cloud project.

The MVP must provide:

1. A documented Google OAuth desktop app configuration.
2. A local trusted executor with an unprivileged agent interface.
3. A browser sign-in and separate user approval for each privileged operation.
4. A reviewed project-scoped IAM bootstrap with a restricted deployment service account.
5. One fixed resource template, a Cloud Run service; no generic IaC execution.
6. No durable cloud credentials.
7. Cloud-side expiry within 10 days and a manual revocation procedure.
8. Positive and negative tests for scope, impersonation, approval replay, grant expiry, and token exposure.
9. Explicit limitations when the user does not isolate the agent from the executor.

A local sandbox, AWS, DigitalOcean, Cloudflare, multi-provider cost estimates, and a hosted control plane are **not** MVP requirements.

## 9. Open technical questions

- How can the browser approval prove an independent owner action when the agent can send local HTTP requests? **Status:** [ADR-0006](adr/ADR-0006-user-started-executor-daemon.md) selects WebAuthn user verification as the candidate owner-presence mechanism. A spike is planned. The approval-mechanism ADR follows the spike.
- What are the minimum OAuth scopes and bootstrap IAM permissions for the first supported template? **Status:** A spike is planned. It runs on a scratch project against the Cloud Run template. The minimum scope and permission list is pending.
- How can the executor validate effective permissions, inherited roles, and impersonation paths? **Status:** [ADR-0005](adr/ADR-0005-go-stack-two-build-outputs.md) selects the Policy Troubleshooter API as the candidate. A spike is planned. Permission checks fail closed until a design is validated.
- How do we install trusted executables and resource templates outside an agent-writable workspace? **Status:** Partially addressed by [ADR-0005](adr/ADR-0005-go-stack-two-build-outputs.md). It records the signed two-binary distribution (`kipfer`, `kipferd`) with templates compiled into `kipferd`. The release-signing mechanism is pending.
- How do we handle a long-running operation after the short-lived token expires? **Status:** Narrowed by template selection. The first template is one Cloud Run service. Its deployment fits the short token target. Longer operations stay out of the MVP.
- What evidence proves cloud-side revocation after IAM propagation?
- What Google OAuth app verification steps apply before public distribution?

These questions must be resolved before claiming a secure production release.

## 10. References

- [Google OAuth for desktop apps](https://developers.google.com/identity/protocols/oauth2/native-app)
- [Google OAuth sensitive scope verification](https://developers.google.com/identity/protocols/oauth2/production-readiness/sensitive-scope-verification)
- [Google Cloud IAM temporary access](https://docs.cloud.google.com/iam/docs/configuring-temporary-access)
- [Google Cloud service account impersonation](https://docs.cloud.google.com/iam/docs/service-account-impersonation)
- [Anthropic Sandbox Runtime](https://github.com/anthropics/sandbox-runtime)
