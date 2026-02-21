## Summary

- What changed and why.
- Scope touched and impacted boundary paths.

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

## Pilot guardrails

- [ ] No changes to auth, routing, proxy, or API contract files were made.
- [ ] Explicitly allowed exceptions documented:
  - `apps/web/src/proxy.ts` — reason:
  - `apps/web/src/app/api/**/route.ts` — reason:
  - `packages/**/src/api/**` — reason:
  - `packages/**/src/**/auth*` — reason:

## Merge readiness

- [ ] All GitHub review threads resolved.
- [ ] Required checks green (`static`, `unit`, `audit`, `e2e-gate`, `pr:verify + pilot:check`, `pnpm-audit`, `gitleaks`).
- [ ] Evidence artifact paths are present and complete.
