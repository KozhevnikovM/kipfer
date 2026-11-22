# ADR-0005: Go Single-Binary Implementation Stack

- **Status:** Proposed (pending owner confirmation)
- **Date:** 2026-11-22
- **Related:** [Kipfer Concept](../CONCEPT.md), [ADR-0001](ADR-0001-local-executor-bootstrap.md), [ADR-0002](ADR-0002-per-operation-browser-authorization.md), [ADR-0003](ADR-0003-ephemeral-credentials-user-managed-sandbox.md), [ADR-0004](ADR-0004-google-oauth-application.md)

## Context

The local trusted executor is the only privileged component in the Kipfer architecture. Every dependency it loads and every process it spawns is part of the trusted computing base (TCB). A large or unaudited dependency tree inside that component is a supply-chain attack surface that can bypass the trust model in ADR-0001.

Two CONCEPT constraints also drive this decision:

- The executor must not run agent-provided provider plugins, scripts, or arbitrary infrastructure-as-code under cloud privileges. The stack must make this structurally impossible, not just forbidden by policy.
- CONCEPT open question 4 asks how to install trusted executables and resource templates outside an agent-writable workspace.

No implementation language, packaging, or storage format is decided yet.

## Decision

1. Implement the trusted executor, the agent-facing CLI, the resource templates, and the approval UI in **Go** as **one static binary** with CGO disabled.
2. Apply a minimal dependency policy: standard library first; every external module is pinned, reviewed, and justified in this ADR or a successor; no dynamic loading, no plugins, no embedded interpreters or policy languages.
3. Compile resource templates into the binary. There is no mechanism to load a template from disk or network at runtime. This enforces the CONCEPT rule "execute only approved, typed operations from trusted templates" structurally.
4. Compute the plan digest as **SHA-256 over RFC 8785 (JSON Canonicalization Scheme)** serialization of the typed plan. Digests must be deterministic across runs and platforms so approval binding is reproducible.
5. Use the official `google-cloud-go` client libraries with pinned versions for GCP IAM, Service Usage, Cloud Run Admin, and Policy Troubleshooter APIs.
6. Verify effective permissions with the **Policy Troubleshooter API**, including inherited roles and `iam.serviceAccounts.actAs` paths, instead of a hand-written IAM resolver. All permission checks **fail closed** when verification is impossible.
7. Store non-secret metadata (target project, plan digests, approval records, grant expiry, execution status, audit references) in **SQLite** through `modernc.org/sqlite`, a pure-Go driver that keeps CGO disabled. Store no credentials in this database, per ADR-0003.
8. Write the audit log as **append-only JSONL with a SHA-256 hash chain**. Each record carries the digest of the previous record. The log contains no secrets.
9. Implement guardrail checks (scope, permission, plan, lifecycle, cost) as hand-written typed checks against the validated plan. Do not embed a policy language such as OPA/Rego.
10. Embed the approval UI as static assets inside the binary. The user machine needs no Node runtime or separate UI server.
11. Ship signed release binaries (mechanism to be fixed before the first public release) and document installation outside agent-writable paths, for example `/usr/local/bin`.

## Consequences

**Benefits**

- Small, auditable TCB: one language, one binary, a short reviewed dependency list.
- Official, complete GCP SDK coverage maintained by Google.
- Single-binary distribution partially resolves CONCEPT open question 4: the trusted code lives in one signed file, not in an agent-writable tree.
- No plugin interface means no path for agent-supplied IaC to reach privileged execution.

**Limits and costs**

- Go garbage collection does not guarantee prompt memory wiping. Token memory handling is best-effort (short TTL, no serialization, no core dumps in release builds). Kipfer must not claim guaranteed memory zeroization.
- `modernc.org/sqlite` is a Go reimplementation, not C SQLite. It is acceptable here because it stores non-secret data only.
- A hand-written guard implementation must grow carefully as templates are added; each new template needs reviewed checks.

## Rejected alternatives

- **Rust:** comparable memory safety, but GCP SDK coverage is partial and community-maintained, and MVP delivery is slower with no boundary-specific gain.
- **TypeScript (Node/Bun):** fast development, but an npm-scale dependency tree inside the privileged process is an unacceptable supply-chain base.
- **Python:** packaging and single-binary distribution are weak; the executor would ship an interpreter.
- **Terraform or another IaC engine inside the executor:** rejected; conflicts with the CONCEPT rule against arbitrary IaC execution and adds provider plugins to the privileged process.
- **OPA/Rego policy engine:** rejected for the MVP; an embedded policy language increases the TCB and creates a config-injection surface inside the trusted component.

## Validation

- Build produces a static binary for Linux (amd64, arm64) and macOS from a pinned toolchain; `go vet` and `gosec` (or an equivalent) run clean.
- Dependency review: `go list -m all` output is reviewed and justified; no module introduces dynamic loading or an interpreter.
- Digest determinism: the same plan produces the same digest across platforms and repeated runs.
- Audit chain: tampering with any log record breaks verification.
- Credential exposure: scans of responses, logs, SQLite content, and crash artifacts find no token or key material, per ADR-0003 validation.
