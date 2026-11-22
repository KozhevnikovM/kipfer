# Design: add-executor-stack-decisions

## Context

The repository is a concept and security-design repository. CONCEPT.md and ADR-0001..0004 fix the security architecture but leave the implementation stack, the executor process model, and the agent interface contract undecided. See [proposal.md](proposal.md) for motivation. Constraints that shape this design:

- The trusted executor is the only privileged component. Its dependency tree and every process it spawns are part of the trusted computing base (TCB).
- ADR-0003 assigns agent isolation to the user; Kipfer must not claim process-level protection against a same-user agent.
- CONCEPT open questions 1 (owner-presence proof), 2 (minimum scopes), and 5 (long operations vs short tokens) block MVP work.

## Goals / Non-Goals

**Goals:**

- Decide the implementation stack with an explicit TCB and supply-chain policy.
- Decide a process model that keeps privileged logic out of agent control and off the network.
- Fix the agent interface contract at the boundary level (typed, unprivileged, versioned).
- Narrow open questions 1, 2, and 5 into concrete spikes or resolved constraints.

**Non-Goals:**

- Writing implementation code or installing the toolchain.
- Resolving the OAuth app verification process for public distribution.
- Multi-provider support, a built-in sandbox, or a hosted control plane (out of MVP scope per CONCEPT).
- A final approval-mechanism ADR; that follows the WebAuthn spike.

## Decisions

### D1: Go single-binary stack (ADR-0005)

The executor, CLI, resource templates, and approval UI are one static Go binary with CGO disabled.

- **Why Go:** official, complete GCP SDK (`google-cloud-go`); memory safety; small curatable dependency tree; excellent static cross-compilation. The dependency tree of the privileged component is attack surface, so the stack must favor a small TCB over developer convenience.
- **Alternatives:**
  - *Rust:* comparable memory safety, but GCP SDK coverage is partial and community-maintained; slower MVP delivery with no boundary-specific gain.
  - *TypeScript/Bun:* fast development, but an npm-scale dependency tree inside the privileged process is an unacceptable supply-chain base.
  - *Python:* packaging and single-binary distribution are weak; the executor would ship an interpreter.
- **Dependency policy:** standard library first; every external module is pinned, reviewed, and justified in the ADR; no dynamic loading, no plugins, no embedded interpreters. Resource templates and the approval UI are compiled into the binary. This enforces CONCEPT "no arbitrary agent-supplied IaC" structurally: there is no mechanism to load it.
- **Plan digest:** SHA-256 over RFC 8785 (JSON Canonicalization Scheme) serialization of the typed plan. Digests must be deterministic across runs and platforms.
- **Local state:** SQLite via `modernc.org/sqlite` (pure Go, keeps CGO off) for non-secret metadata only; append-only JSONL audit log with a SHA-256 hash chain for tamper evidence.

### D2: User-started daemon, privileged logic in-process (ADR-0006)

The executor runs as a daemon started by the user. The agent calls a thin CLI that is only a client of the daemon's unprivileged localhost API.

- **Why:** a process spawned by the agent (the default MCP-server pattern) inherits agent-controlled environment, argv, and working directory, which contradicts ADR-0001's trusted-executor requirement. A user-started daemon also lets privileged logic exist with no network endpoint at all: privileged paths run in-process, triggered only by a browser-approved session.
- **Alternatives:**
  - *CLI-spawned per operation:* simpler UX, but the agent controls the trusted process and its environment.
  - *Privileged socket endpoint on the daemon:* turns the trust boundary into an attack surface reachable from the agent's network namespace.
- **Boot story:** manual start in a user terminal is the MVP baseline. Autostart entries (`~/.config/systemd/user/`, launchd user agents) are agent-writable and MUST be documented as a threat, not shipped as the default trust assumption.
- **Restart semantics:** approval sessions live only in daemon memory. A restart fails safe per ADR-0002: sessions die, interrupted operations do not resume, and every retry needs a new browser flow.

### D3: Typed JSON contract over localhost HTTP; MCP adapter later

The agent-facing contract is a versioned JSON Schema request set served on a loopback port; the thin CLI wraps it for humans and agents. An MCP server adapter MAY wrap the same API later — as a client-facing adapter, never as a privileged in-agent process.

- **Why not MCP-first:** the contract must not depend on one transport; a transport-independent JSON schema keeps the boundary testable and keeps ADR-0002 replay tests transport-independent.

### D4: First resource template is Cloud Run

The MVP template deploys one Cloud Run service.

- **Why:** deployment completes in seconds-to-minutes, which fits the 15-minute token target and resolves CONCEPT open question 5 by template selection. Cloud SQL (UC-02 example) provisions in 20+ minutes and is rejected for the first template.
- **Scope surface this fixes for the minimum-scope spike (open question 2):** Service Usage enablement, Cloud Run Admin API create/update, `iam.serviceAccounts.actAs` scoped to one runtime service account, plus read-only checks (project IAM get, Policy Troubleshooter).

### D5: Owner-presence proof candidate — WebAuthn user verification (spike)

The approval page, served on loopback, challenges a platform authenticator (Touch ID, Windows Hello, FIDO2 key). `localhost` is a valid WebAuthn RP ID; user verification yields a cryptographic assertion of human interaction that the agent cannot forge without the authenticator. Social engineering of the user remains out of scope of this mechanism.

- **Spike must answer:** platform/browser coverage, behavior without a platform authenticator (fallback MUST fail closed), enterprise policy restrictions, and interaction with the separate plan-approval step.
- **Alternative considered:** desktop-notification + confirmation dialog — rejected as the primary mechanism because same-user processes can fake or click dialogs; WebAuthn binds the proof to hardware user verification.
- **Status:** candidate. ADR for the approval mechanism is written only after the spike.

### D6: Effective-permission checks via Policy Troubleshooter API

Scope and permission guards use the Google Cloud Policy Troubleshooter API to verify what the deployment identity can actually do, including inherited roles and `actAs` paths, instead of a hand-written IAM resolver. Checks MUST fail closed when the API cannot answer.

### D7: Ephemeral credential handling inside the daemon

Tokens exist only as Go variables inside the daemon process for the duration of one approved operation. The daemon MUST NOT swap token memory to disk (best-effort: short TTL, no serialization, no core dumps in release builds). Memory zeroization in a GC language is best-effort and MUST NOT be claimed as a guarantee; the effective control is the short TTL plus ADR-0003's user-managed isolation.

## Risks / Trade-offs

- [Manual daemon start is friction and users will add autostart themselves] → document the agent-writable autostart threat in ADR-0006 and the security docs; provide no default autostart in the MVP.
- [A same-user agent can ptrace or read the daemon's memory; WebAuthn does not change that] → accepted and documented per ADR-0003; Kipfer claims protection only against credential *persistence* and *agent-side* theft paths, not live same-user process compromise.
- [WebAuthn spike may fail on platform coverage or enterprise policy] → the approval-mechanism ADR is deferred until the spike; the design fails closed: no alternative approval path is added without a new ADR.
- [Minimum IAM/OAuth scope list is unproven] → spike runs against a scratch project before any privileged code path is written; scope list goes into the approval/bootstrap ADR.
- [`modernc.org/sqlite` is a Go reimplementation, not C SQLite] → acceptable because it stores non-secret metadata only; CGO stays off for static builds and a smaller TCB.
- [Go GC may retain token bytes longer than intended] → control is the 15-minute TTL target and no serialization; docs must not claim guaranteed memory wiping.

## Migration Plan

Documentation-only change. Steps: promote the ADR drafts in `adr-drafts/` to `docs/adr/`, update CONCEPT.md (accepted decisions list, stack notes) and README.md (document links), then verify links and `git diff --check`. Rollback is `git revert`; no data or systems are affected.

## Open Questions

- Audit log retention and rotation policy (deferrable; format is decided in D1).
- Per-OS state directory locations for the SQLite metadata store (deferrable; non-secret data only).
- Exact Go toolchain version pin and release-signing mechanism (deferrable to first release task).
