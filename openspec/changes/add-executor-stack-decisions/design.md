# Design: add-executor-stack-decisions

## Context

The repository is a concept and security-design repository. CONCEPT.md and ADR-0001..0004 fix the security architecture but leave the implementation stack, the executor process model, and the agent interface contract undecided. See [proposal.md](proposal.md) for motivation. Constraints that shape this design:

- The trusted executor is the only privileged component. Its dependency tree and every process it spawns are part of the trusted computing base (TCB).
- In the MVP baseline the agent and the daemon run under the same OS account and share the host network namespace, unless the user adds isolation. ADR-0003 assigns that isolation to the user.
- The caller identity for policy-read APIs is itself a security decision (see D6).
- CONCEPT open questions 1, 2, 3, and 5 block MVP work.

## Goals / Non-Goals

**Goals:**

- Decide the implementation stack with an explicit TCB and supply-chain policy.
- Decide a process model that keeps privileged execution out of agent control and off dedicated network endpoints.
- Fix the agent interface contract at the boundary level: typed, unprivileged, versioned.
- Narrow open questions 1, 2, 3, and 5 into concrete spikes or resolved constraints.

**Non-Goals:**

- Writing implementation code or installing the toolchain.
- Resolving the OAuth app verification process for public distribution.
- Windows builds for the MVP.
- Multi-provider support, a built-in sandbox, or a hosted control plane (out of MVP scope per CONCEPT).
- A final approval-mechanism ADR; that follows the WebAuthn spike.

## Decisions

### D1: Go stack, two build outputs (ADR-0005)

Implement one Go codebase as two static build outputs with CGO disabled:

- `kipfer`: the agent-facing CLI. Client-only build. Contains no daemon code and no privileged logic.
- `kipferd`: the daemon. Contains all privileged logic and all listeners.

- **Why Go:** official and complete GCP SDK (`google-cloud-go`); memory safety; a small curatable dependency tree; static cross-compilation. The dependency tree of the privileged component is attack surface, so the stack favors a small TCB over developer convenience.
- **Why two build outputs:** the binary that the agent runs must not contain daemon code. A single combined binary would let the agent start privileged logic as its own child process. Build separation makes the agent-facing binary structurally incapable of that.
- **Alternatives:** Rust (comparable memory safety; partial community GCP SDK; slower MVP). TypeScript/Bun (npm-scale dependency tree in the privileged process; unacceptable supply-chain base). Python (weak packaging; ships an interpreter).
- **Dependency policy:** standard library first; every external module is pinned, reviewed, and justified; no dynamic loading, no plugins, no embedded interpreters or policy languages. Resource templates and the approval UI are compiled into `kipferd`. There is no mechanism to load templates at runtime.
- **Daemon hardening:** `kipferd` ignores proxy and custom CA environment variables and uses fixed, documented network configuration. This removes an agent-controlled environment influence on privileged traffic.
- **Plan digest:** SHA-256 over RFC 8785 canonical JSON of the typed plan. Digests must be deterministic across runs and platforms.
- **Local state:** SQLite for non-secret metadata only, through a Go driver that keeps CGO off (see ADR-0005 for the trade-off). Audit log: append-only JSONL with an unkeyed SHA-256 hash chain. The chain detects accidental corruption and reordering. It does not protect against a same-user attacker with write access to the state directory. This limit is stated in ADR-0005.

### D2: User-started daemon, constrained listeners (ADR-0006)

The user installs and starts `kipferd`. At most one daemon instance runs per user account (single-instance lock). The agent calls `kipfer`, a client of the daemon's agent API.

- **Why:** a process spawned by the agent inherits agent-controlled environment, argv, and working directory. That contradicts the ADR-0001 trust model.
- **Honest limit:** under one OS account, Kipfer cannot distinguish a user-started daemon from an agent-started `kipferd` process. The controls for that case are the single-instance lock, the owner-presence approval design, and the user-managed isolation of ADR-0003.
- **Listeners:** the daemon runs exactly three loopback listeners: the agent API, the OAuth callback handler, and the approval UI. No listener executes a privileged cloud operation or issues a credential. Approval and callback handlers remain local attack targets. ADR-0002, ADR-0004, and the approval-mechanism ADR define their protections.
- **Boot story:** manual start in a user terminal is the MVP baseline. Autostart entries (`~/.config/systemd/user/`, launchd user agents) are agent-writable. Kipfer documents this threat and ships no default autostart in the MVP.
- **Restart semantics:** approval sessions live only in daemon memory. A restart invalidates sessions, stops interrupted operations, records the interrupted operation as unverified, and requires a new browser flow for any retry. This is the designed behavior for the ADR-0002 fail-safe requirement; validation is pending.

### D3: Typed JSON contract over localhost HTTP; MCP adapter later

The agent-facing contract is a versioned JSON Schema request set served by the daemon on a loopback port. The `kipfer` CLI wraps it for humans and agents. An MCP server adapter MAY wrap the same API later, as a client-facing adapter. It must never run privileged logic inside a process the agent spawned.

- **Why not MCP-first:** the contract must not depend on one transport. A transport-independent schema keeps the boundary testable and keeps ADR-0002 replay tests transport-independent.
- **Open question:** a sandboxed agent can run in a network namespace that cannot reach the daemon's loopback port. The deployment pattern for that case, for example a forwarded socket, is an open question for the sandbox research track.

### D4: First resource template is Cloud Run

The MVP template deploys one Cloud Run service.

- **Why:** deployment completes in seconds-to-minutes. This fits the 15-minute token target and narrows CONCEPT open question 5 by template selection. Cloud SQL provisions in 20+ minutes and is rejected for the first template.
- **Scope surface for the minimum-scope spike (open question 2):** Service Usage enablement, Cloud Run Admin API create/update, `iam.serviceAccounts.actAs` scoped to one runtime service account, plus read-only checks.

### D5: Owner-presence proof candidate — WebAuthn user verification (spike)

The approval page, served on loopback, challenges a platform authenticator: Touch ID on macOS, FIDO2 security keys on Linux. `localhost` is a valid WebAuthn RP ID. If the spike succeeds, user verification gives a cryptographic assertion of human interaction that the agent cannot forge without the authenticator. This is a hypothesis until the spike passes.

- **Spike must answer:** platform and browser coverage on the supported operating systems; fail-closed behavior without a platform authenticator; enterprise policy restrictions; `clientDataJSON` origin binding, because all local origins share the RP ID `localhost`; the owner authenticator enrollment procedure; interaction with the separate plan-approval step.
- **Alternative considered:** desktop notification plus a confirmation dialog. Rejected as the primary mechanism: same-user processes can fake or click dialogs. WebAuthn binds the proof to hardware user verification.
- **Status:** candidate. The approval-mechanism ADR follows the spike. No alternative approval path is added without a new ADR; the design fails closed.

### D6: Effective-permission checks — Policy Troubleshooter candidate (spike)

The scope and permission guards are planned to use the Google Cloud Policy Troubleshooter API instead of a hand-written IAM resolver. **Candidate; validation pending.**

- **Spike must answer:** which identity calls the API and which policy-read permissions that caller needs (a security decision; see ADR-0004 token-use limits); behavior with folder and organization policies; `actAs` path coverage; the forbidden-permission list; the fail-closed result when the API returns `UNKNOWN`.
- All permission checks fail closed when verification is impossible. This holds whether or not the candidate is confirmed.

### D7: Ephemeral credential handling inside the daemon

Tokens exist only as process memory inside `kipferd` for the duration of one approved operation. The design prefers a deterministic end for token memory: the executor MAY run each approved operation in a worker process, so token memory ends with the process. Swap prevention (for example `mlock`) is not claimed. Release builds disable core dumps. Memory zeroization in a GC language is best-effort. The effective controls are the short token TTL and the user-managed isolation of ADR-0003. Security documents must not claim guaranteed memory wiping.

## Risks / Trade-offs

- [Manual daemon start is friction; users will add autostart themselves] → document the agent-writable autostart threat in ADR-0006; ship no default autostart in the MVP.
- [A same-user agent can ptrace the daemon, signal it, run `kipferd` itself, or read its memory] → accepted and documented per ADR-0003. The build separation, the single-instance lock, and the approval design reduce the paths but do not remove this threat.
- [The agent API is unreachable from a sandboxed agent in a different network namespace] → deployment pattern is an open question (D3); documented for the sandbox research track.
- [WebAuthn spike may fail on platform coverage or enterprise policy] → the approval-mechanism ADR is deferred until the spike; the design fails closed.
- [The Policy Troubleshooter spike may fail on caller permissions or org-policy behavior] → D6 stays a candidate; guards fall back to direct `getIamPolicy` checks where provable and fail closed otherwise.
- [The minimum IAM/OAuth scope list is unproven] → spike runs against a scratch project before any privileged code path is written.
- [The Go SQLite driver is a machine translation of the SQLite C source with a sizable dependency set] → accepted because it stores non-secret metadata only and keeps CGO off; stated in ADR-0005.
- [Go GC may retain token bytes longer than intended] → short TTL, worker-process option, no serialization, no core dumps; docs must not claim guaranteed memory wiping.

## Migration Plan

Documentation-only change. Steps: promote the ADR drafts in `adr-drafts/` to `docs/adr/`, update CONCEPT.md (accepted decisions, Cloud Run template record, open question status) and README.md (document links), then verify links and `git diff --check`. The branch adds `openspec/config.yaml`; another conveyor branch adds the identical file, so no conflict is expected. Rollback is `git revert`; no data or systems are affected.

## Open Questions

- Caller identity and policy-read permission set for the Policy Troubleshooter candidate (spike, D6).
- Audit log retention and rotation policy (deferrable; format is decided in D1).
- Per-OS state directory locations for the SQLite metadata store (deferrable; non-secret data only).
- Exact Go toolchain version pin and release-signing mechanism (deferrable to the first release task).
- Deployment pattern for sandboxed agents that cannot reach the daemon's loopback port (sandbox research track, D3).
