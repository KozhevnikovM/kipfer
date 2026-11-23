# ADR-0005: Go Stack with Two Build Outputs

- **Status:** Accepted (design decision; implementation and security validation pending)
- **Date:** 2026-11-22
- **Related:** [Kipfer Concept](../CONCEPT.md), [ADR-0001](ADR-0001-local-executor-bootstrap.md), [ADR-0002](ADR-0002-per-operation-browser-authorization.md), [ADR-0003](ADR-0003-ephemeral-credentials-user-managed-sandbox.md), [ADR-0004](ADR-0004-google-oauth-application.md), [ADR-0006](ADR-0006-user-started-executor-daemon.md)

## Context

The local trusted executor is the only privileged component. Every dependency it loads and every process it spawns is part of the trusted computing base (TCB). A large or unaudited dependency tree inside that component is a supply-chain attack surface that can bypass the trust model in ADR-0001.

Three CONCEPT constraints drive this decision:

- The executor must not run agent-provided provider plugins, scripts, or arbitrary infrastructure-as-code under cloud privileges. The stack must make this structurally impossible.
- CONCEPT open question 4 asks how to install trusted executables and resource templates outside an agent-writable workspace.
- The agent runs the Kipfer CLI. A single binary that contains both the CLI and the daemon would let the agent start privileged logic as its own child process. That contradicts the process model in [ADR-0006](ADR-0006-user-started-executor-daemon.md).

## Decision

1. Implement one Go codebase as **two static build outputs** with CGO disabled: `kipfer` (agent-facing CLI, client-only, no daemon code) and `kipferd` (daemon, all privileged logic). Build targets are Linux (amd64, arm64) and macOS.
2. Apply a minimal dependency policy: standard library first; every external module is pinned, reviewed, and justified; no dynamic loading, no plugins, no embedded interpreters or policy languages.
3. Compile resource templates into `kipferd`. There is no mechanism to load a template at runtime. This enforces the CONCEPT rule "execute only approved, typed operations from trusted templates" structurally.
4. Compute the plan digest as **SHA-256 over RFC 8785 (JSON Canonicalization Scheme)** serialization of the typed plan. Digests must be deterministic across runs and platforms so approval binding is reproducible.
5. Use the official `google-cloud-go` client libraries with pinned versions for GCP IAM, Service Usage, Cloud Run Admin, and related APIs.
6. Plan effective-permission checks with the **Policy Troubleshooter API**. **Candidate; validation pending.** A spike must answer: the caller identity and its policy-read permissions; behavior with folder and organization policies; `actAs` path coverage; the forbidden-permission list; the fail-closed result when the API returns `UNKNOWN`. All permission checks fail closed when verification is impossible, with or without this candidate.
7. Store non-secret metadata (target project, plan digests, approval records, grant expiry, execution status, audit references) in **SQLite** through the Go driver `modernc.org/sqlite`. This driver is a machine translation of the SQLite C source, not a small pure-Go reimplementation; its dependency set is sizable. Kipfer accepts this driver for three reasons: CGO stays off, builds stay static without a C toolchain, and the database holds non-secret data only. Store no credentials here, per ADR-0003.
8. Write the audit log as **append-only JSONL with an unkeyed SHA-256 hash chain**. Each record carries the digest of the previous record. The chain detects accidental corruption and reordering. It does not protect against a same-user attacker with write access to the state directory; such an attacker can rewrite a consistent chain. That threat stays in ADR-0003 scope. The log contains no secrets.
9. Implement guardrail checks (scope, permission, plan, lifecycle, cost) as hand-written typed checks against the validated plan. Do not embed a policy language such as OPA/Rego.
10. Embed the approval UI as static assets inside `kipferd`. The user machine needs no Node runtime or separate UI server.
11. Ship signed release binaries (mechanism to be fixed before the first public release). Document installation outside agent-writable paths, for example `/usr/local/bin`.
12. Harden the `kipferd` runtime environment: it reads no configuration from the inherited environment (proxy, custom CA, Go runtime variables such as `GOTRACEBACK`) and resets its core-dump limit at startup. It uses a fixed, documented network configuration. This removes an agent-controlled environment influence on privileged traffic.

## Consequences

**Benefits**

- Small, auditable TCB: one language, two build outputs, a curatable reviewed dependency list.
- The agent-facing binary cannot start privileged logic; daemon code is absent from its build.
- Official, complete GCP SDK coverage maintained by Google.
- Signed single-file distribution per build output partially resolves CONCEPT open question 4.

**Limits and costs**

- Two build outputs need two release artifacts and two installation steps.
- Go garbage collection does not guarantee prompt memory wiping. Token memory handling is best-effort (short TTL, worker-process option, no core dumps in release builds). Kipfer must not claim guaranteed memory zeroization.
- The SQLite driver adds a sizable machine-translated dependency to `kipferd`. Accepted for non-secret data only.
- Hand-written guard implementation must grow carefully as templates are added; each new template needs reviewed checks.

## Rejected alternatives

- **Rust:** comparable memory safety, but GCP SDK coverage is partial and community-maintained, and MVP delivery is slower with no boundary-specific gain.
- **TypeScript (Node/Bun):** fast development, but an npm-scale dependency tree inside the privileged process is an unacceptable supply-chain base.
- **Python:** packaging and single-binary distribution are weak; the executor would ship an interpreter.
- **One combined binary for CLI and daemon:** rejected; the agent-facing binary must not contain daemon code, or the agent can start privileged logic as its own child process.
- **Terraform or another IaC engine inside the executor:** rejected; conflicts with the CONCEPT rule against arbitrary IaC execution and adds provider plugins to the privileged process.
- **OPA/Rego policy engine:** rejected for the MVP; an embedded policy language increases the TCB and creates a config-injection surface inside the trusted component.
- **Keyed (HMAC) audit chain:** deferred; a key inside the same state directory does not stop a same-user attacker and adds key management. Revisit together with external state protection.

## Validation

- `kipfer` and `kipferd` build as static binaries for the listed targets from a pinned toolchain; `go vet` and a security linter run clean.
- The `kipfer` build contains no daemon code (package boundary or linker check).
- A second `kipferd` instance for the same user account refuses to start.
- Dependency review: `go list -m all` output is reviewed and justified; no module introduces dynamic loading or an interpreter.
- Digest determinism: the same plan produces the same digest across platforms and repeated runs.
- Audit chain verification detects tampering and reordering; security documents state the same-user rewrite limit.
- Privileged traffic and core-dump behavior ignore hostile environment variables, including Go runtime variables.
- Credential exposure: scans of responses, logs, SQLite content, and crash artifacts find no token or key material, per ADR-0003 validation.
