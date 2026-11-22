# Kipfer

**Secure cloud infrastructure operations for AI coding agents.**

> Project status: concept and security design. No production-ready implementation exists yet.

Kipfer lets an AI agent request cloud resources without giving it cloud credentials. A local trusted executor validates requests, presents an infrastructure plan, and requires user approval and fresh browser authentication before each privileged operation.

## Core principles

- Start with Google Cloud. Add other cloud providers later.
- Use a local trusted executor. Do not give cloud tokens to the agent.
- Do not store OAuth refresh tokens or service account keys.
- Ask the user to approve each infrastructure plan before execution.
- Grant only the required permissions in one selected cloud project.
- Limit cloud-side access grants to 10 days. Do not renew them automatically.
- Let users revoke grants early without deleting deployed resources.
- Make agent sandboxing the user's responsibility. Kipfer does not provide a sandbox in the MVP.

## Security scope

The user must isolate the agent from the trusted executor, the browser session, and other credentials on the machine. Kipfer cannot guarantee credential isolation if an unrestricted agent has access to the same operating system session.

## Next steps

Document the approved architecture decisions. Then validate the GCP bootstrap, IAM permission scope, approval flow, and credential handling in a security-focused proof of concept.

## Documentation language

Use Simplified Technical English (STE) for project documents, issues, and code comments.
