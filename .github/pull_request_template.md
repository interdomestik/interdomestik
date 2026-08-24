## Summary

- What changed and why.
- Scope touched and impacted boundary paths.

## Review focus

- Primary review surface:
- Primary contracts or risks to verify:
- Ignore unless behavior changed:

## Acceptance

- [ ] Slice criteria are explicit and complete.
- [ ] No behavior changed outside slice scope.

## Evidence (mandatory before merge)

- PR status: `PASS` / `PASS-with-auth-noise` / `PARTIAL` / `FAIL`
- Summary JSON: `tmp/pilot-evidence/<day>/<timestamp>/summary.json`
- Closure note: `tmp/pilot-evidence/<day>/<timestamp>/closure.md`
- Gates:
  - `pnpm pr:verify` (exit: `__`)
  - `pnpm security:guard` (exit: `__`)
  - `pnpm e2e:gate` or scoped equivalent (exit: `__`)
- Logs: `tmp/pilot-evidence/<day>/<timestamp>/logs/...`
- Screenshots: `tmp/pilot-evidence/<day>/<timestamp>/screenshots/...`
- Runbooks: `tmp/pilot-evidence/<day>/<timestamp>/runbooks/...`

## Product-readiness sequence

- [ ] Ran `pnpm pr:request-reviewers -- <PR_NUMBER>` after opening and after substantive pushes; it posts the allowlisted current-head `@codex review` prompt.
- [ ] Requested current-head Codex review; Copilot was neither requested nor awaited.
- [ ] Unsolicited Copilot, Codex, CodeQL, Sonar, and bot findings were addressed or technically closed.
- [ ] Ran `pnpm pr:review-ready -- <PR_NUMBER>` after final push.

## Pilot guardrails

- [ ] No changes to auth, routing, proxy, or API contract files were made.
- [ ] Explicitly allowed exceptions documented:
  - `apps/web/src/proxy.ts` — reason:
  - `apps/web/src/app/api/**/route.ts` — reason:
  - `packages/**/src/api/**` — reason:
  - `packages/**/src/**/auth*` — reason:

## Merge readiness

- [ ] All GitHub review threads resolved.
- [ ] Bot or reviewer findings were either fixed or explicitly closed with technical reasoning.
- [ ] Required checks green (`validation-surface`, `audit`, `e2e`, `pnpm-audit`, `gitleaks`, `pilot-gate`, `pr-finalizer`, `commitlint`, `delivery-gate`).
- [ ] `pnpm pr:governance:report -- <PR_NUMBER>` recorded required-check and monitored generator state; `delivery-gate` completed final same-head feedback intake, including unsolicited Copilot/Codex. Absent Copilot is never a blocker.
- [ ] Evidence artifact paths are present and complete.
