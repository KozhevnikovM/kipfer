# Tasks: add-executor-stack-decisions

## 1. ADR promotion

- [ ] 1.1 Confirm ADR-0005 status with the owner, then promote `adr-drafts/ADR-0005-go-single-binary-stack.md` to `docs/adr/ADR-0005-go-single-binary-stack.md` with the final status line
- [ ] 1.2 Confirm ADR-0006 status with the owner, then promote `adr-drafts/ADR-0006-user-started-executor-daemon.md` to `docs/adr/ADR-0006-user-started-executor-daemon.md` with the final status line

## 2. Documentation updates

- [ ] 2.1 Update `docs/CONCEPT.md`: add ADR-0005 and ADR-0006 to the accepted decisions list; add a short stack and process-model note to the architecture section; keep the decided-vs-spike distinction explicit
- [ ] 2.2 Update `README.md`: add ADR-0005 and ADR-0006 to the architecture documents list

## 3. Follow-up issue creation

- [ ] 3.1 Create a GitHub issue for the WebAuthn owner-presence spike (CONCEPT open question 1; output feeds the future approval-mechanism ADR)
- [ ] 3.2 Create a GitHub issue for the minimum OAuth scope and IAM permission spike for the Cloud Run template (CONCEPT open question 2; scratch project required)

## 4. Validation

- [ ] 4.1 Run `openspec validate --strict` on this change and fix reported issues
- [ ] 4.2 Verify every relative link in touched documents resolves; confirm no document claims implemented or verified security behavior; run `git diff --check`
