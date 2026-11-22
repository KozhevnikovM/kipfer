# ADR-0004: Use a Google OAuth Desktop Application for GCP Connection

- **Status:** Accepted (design decision; security validation pending)
- **Date:** 2026-11-22
- **Related:** [Kipfer Concept](../CONCEPT.md), [ADR-0001](ADR-0001-local-executor-bootstrap.md), [ADR-0002](ADR-0002-per-operation-browser-authorization.md), [ADR-0003](ADR-0003-ephemeral-credentials-user-managed-sandbox.md)

## Context

The user has a new Google Cloud project. The user has not installed `gcloud` or configured cloud credentials.

Kipfer must offer a browser-first connection flow. The user should not need to create an OAuth application for every project.

Kipfer must not give the AI agent credentials. It must not mistake Google OAuth authorization for a project-scoped IAM grant.

## Decision

1. Register Kipfer as a **Google OAuth Desktop application**. Ship its OAuth client ID as public application metadata. A desktop client secret is not a security boundary.
2. Use the system browser, **Authorization Code + PKCE**, and a loopback callback handled only by the **local trusted executor**. Validate `state`, the callback target, the active session, and the token response. Use OpenID Connect identity checks if user identity is required.
3. Let the user select or enter a target Google Cloud **project ID in Kipfer**. Google's OAuth consent screen does not select or authorize a specific project.
4. Show a separate Kipfer approval screen with the exact target project, APIs, IAM permissions, proposed grants, expiry, resource plan, cost assumptions, and risks. **Google sign-in does not approve the plan.**
5. The executor uses the temporary user credential only for approved bootstrap or service-account impersonation. It performs resource changes with a restricted, project-scoped deployment identity. The AI agent cannot receive either token.
6. Require a new browser authorization flow **and** one-time plan approval for each privileged operation. Do not save refresh tokens, request offline access, or issue service-account JSON keys.
7. The OAuth token can have a broad scope such as `cloud-platform`. The user's effective IAM rights can cover several projects. **This token is not automatically restricted to the selected project.** Kipfer enforces project selection in the executor and resource operations through limited GCP IAM grants.
8. The bootstrap must stop if the user lacks the IAM permissions needed to create the required service account or policy bindings. Kipfer must show the missing permissions instead of attempting an undocumented privilege escalation.
9. Review the Google OAuth verification, branding, privacy, and policy requirements before public distribution. The design must not assume that an unverified app can serve all users.
10. If the user has not isolated the agent from the browser and executor, Kipfer must not claim to prevent live token theft. This is a user-managed security prerequisite under ADR-0003.

## Consequences

**Benefits**

- No local `gcloud` setup.
- One Google OAuth client for Kipfer users.
- Browser-based consent and explicit project-specific approval.
- No hosted privileged broker for the MVP.
- No stored long-lived cloud credentials.

**Limits and costs**

- The temporary user OAuth token may have more IAM authority than the deployment account.
- A Google browser session can allow reauthorization without a fresh password entry.
- Local approval endpoints, OAuth callbacks, and the executor need a real trust boundary.
- Google OAuth verification may delay public use.
- Project-scoped privilege checks and cloud-side grant expiry remain separate from OAuth.

## Rejected alternatives

- **Require each user to register an OAuth app:** rejected as the default; too much setup.
- **Let the AI agent process the OAuth callback or hold tokens:** rejected; breaks the trust model.
- **Use OAuth scopes as project-level permission controls:** rejected; they do not provide this guarantee.
- **Use saved refresh tokens or downloadable service-account keys:** rejected; conflicts with ephemeral authorization.
- **Use Google sign-in as proof of plan approval:** rejected; approvals must be separate.

## Required validation before release

- Verify installed-app PKCE and loopback callback handling, including forged callbacks and replay.
- Determine the actual minimum OAuth scopes and GCP IAM permissions for the first template.
- Prove that the deployment identity cannot access another project, manage IAM, or impersonate privileged accounts.
- Test an agent's attempts to call approval endpoints, capture tokens, or modify a plan after approval.
- Confirm token cleanup, grant expiry, and manual revocation.
- Document OAuth app verification needs for public releases.

## References

- [OAuth 2.0 for Desktop Apps](https://developers.google.com/identity/protocols/oauth2/native-app)
- [OAuth App Verification](https://developers.google.com/identity/protocols/oauth2/production-readiness/sensitive-scope-verification)
- [Google Cloud IAM Temporary Access](https://docs.cloud.google.com/iam/docs/configuring-temporary-access)
