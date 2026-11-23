# Kipfer

**Secure cloud infrastructure operations for AI coding agents.**

> **Status:** Concept and security design. There is no production-ready implementation yet.

Kipfer lets AI agents request cloud resources **without receiving cloud credentials**. A local trusted executor checks the request, presents the exact plan, and asks for owner approval and Google browser authorization before each privileged operation.

Kipfer starts with **Google Cloud**. The architecture is agent-agnostic and can support other cloud providers later.

## User experience

1. Ask an agent to create cloud resources or estimate hosting costs.
2. Review the selected GCP project, resource plan, IAM permissions, API enablements, and expected cost in Kipfer.
3. Sign in with **Kipfer's Google OAuth Desktop App** in your system browser. No local `gcloud` setup is required.
4. **Approve the exact plan separately** from Google OAuth consent.
5. The local executor bootstraps or uses a limited deployment service account and runs the approved operation.
6. Temporary credentials are discarded. The next privileged change needs a new browser flow and approval.

You install the `kipferd` daemon and start it in a terminal; the first resource template is Cloud Run. See [ADR-0005](docs/adr/ADR-0005-go-stack-two-build-outputs.md) and [ADR-0006](docs/adr/ADR-0006-user-started-executor-daemon.md).

**Important:** Google OAuth scopes do not restrict a user token to one GCP project. Kipfer must enforce project scope through restricted cloud IAM and the trusted executor. This is a design requirement, not a verified security guarantee yet.

## Core principles

- The AI agent never receives cloud tokens.
- The trusted executor runs locally and uses typed, allowlisted operations.
- Do not store OAuth refresh tokens, access tokens, or service-account JSON keys.
- Require owner approval and interactive browser authorization for **each** privileged operation.
- Limit deployment IAM grants to **10 days** and do not renew them automatically.
- Use least-privilege roles in one selected GCP project.
- Support early revocation without deleting deployed resources.
- Keep application runtime identities separate from deployment identities.
- The **user must isolate the agent** from the browser and executor. Kipfer does not include a sandbox in the MVP.
- Do not promise a hard monthly billing limit from cost estimates.

## Architecture documents

- [Product concept](docs/CONCEPT.md)
- [ADR-0001 — Local Trusted Executor and Temporary Browser Bootstrap](docs/adr/ADR-0001-local-executor-bootstrap.md)
- [ADR-0002 — Browser Authorization for Every Privileged Operation](docs/adr/ADR-0002-per-operation-browser-authorization.md)
- [ADR-0003 — Ephemeral Credentials and User-Managed Agent Isolation](docs/adr/ADR-0003-ephemeral-credentials-user-managed-sandbox.md)
- [ADR-0004 — Google OAuth Desktop Application](docs/adr/ADR-0004-google-oauth-application.md)
- [ADR-0005 — Go Stack with Two Build Outputs](docs/adr/ADR-0005-go-stack-two-build-outputs.md)
- [ADR-0006 — User-Started Executor Daemon with Constrained Listeners](docs/adr/ADR-0006-user-started-executor-daemon.md)

## Security and MVP scope

The local executor, browser approval, effective IAM controls, and revocation procedure are **not implemented or validated yet**. Do not use this design with production cloud permissions.

A standard localhost process does not isolate credentials from an unrestricted agent with access to the same OS account. An effective sandbox or other user-managed trust boundary is required for that threat model.

The first milestone is a security proof of concept for one GCP project and one fixed resource template. Multi-cloud deployment, a built-in sandbox, unattended infrastructure changes, and a custom IaC engine are out of scope.

## Development policy

Use **Simplified Technical English (STE)** in repository documents, issues, pull requests, and code comments.
