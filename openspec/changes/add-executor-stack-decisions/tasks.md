# Tasks: add-executor-stack-decisions

## 1. ADR promotion

- [x] 1.1 Move `adr-drafts/ADR-0005-go-stack-two-build-outputs.md` to `docs/adr/ADR-0005-go-stack-two-build-outputs.md` with `git mv`. No draft copy remains in the change directory. Set the status to "Accepted (design decision; implementation and security validation pending)". Rewrite the relative links for the `docs/adr/` location: use `../CONCEPT.md` and `ADR-000N-<name>.md`, as in ADR-0001 to ADR-0004. The owner confirms this status by merging the PR; the PR description must ask for this confirmation.
- [x] 1.2 Move `adr-drafts/ADR-0006-user-started-executor-daemon.md` to `docs/adr/ADR-0006-user-started-executor-daemon.md` with `git mv`. No draft copy remains in the change directory. Apply the same status, link rewrite, and owner-confirmation protocol.

## 2. Documentation updates

- [x] 2.1 Update `docs/CONCEPT.md`: add ADR-0005 and ADR-0006 to the accepted decisions list; add a short stack and process-model note to section 3 (user-started `kipferd`, client-only `kipfer`, constrained loopback listeners, manual start in the MVP); record the Cloud Run template as the fixed MVP template in section 8 item 5; update the status of open questions 1 to 5 in section 9 (1: candidate WebAuthn spike; 2: spike planned on a scratch project for the Cloud Run template; 3: candidate Policy Troubleshooter spike; 4: partially addressed by signed two-binary distribution; 5: narrowed by template selection). Keep decided-versus-spike explicit.
- [x] 2.2 Update `README.md`: add ADR-0005 and ADR-0006 to the architecture documents list; add one sentence to the user experience section: the user installs `kipferd` and starts it in a terminal; the first resource template is Cloud Run.
- [x] 2.3 Update the Related lines of ADR-0001 to ADR-0004 to list ADR-0005 and ADR-0006. Add an amendment note to ADR-0001: ADR-0006 refines the process model with a client-only CLI binary, a separate daemon binary, and constrained loopback listeners.

## 3. Follow-up issue creation

- [x] 3.1 Create the WebAuthn owner-presence spike issue (open question 1): platform and roaming authenticator coverage; fail-closed fallback without an available authenticator (platform or roaming); `clientDataJSON` origin binding for local origins that share the RP ID `localhost`; the owner authenticator enrollment procedure; interaction with the plan-approval step.
- [x] 3.2 Create the minimum OAuth scope and IAM permission spike issue (open question 2; scratch project; Cloud Run template).
- [x] 3.3 Create the Policy Troubleshooter spike issue (open question 3): caller identity and policy-read permissions; folder and organization policy behavior; `actAs` coverage; the forbidden-permission list; the fail-closed result.

## 4. Validation

- [x] 4.1 Run `openspec validate --strict` on this change and fix reported issues.
- [x] 4.2 Verify every relative link in touched documents resolves; confirm no document states unimplemented behavior as implemented or guarantees unverified security properties; run `git diff --check`.
