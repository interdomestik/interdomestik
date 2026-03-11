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

## Pilot guardrails

- [ ] No changes to auth, routing, proxy, or API contract files were made.
- [ ] Explicitly allowed exceptions documented:
  - `apps/web/src/proxy.ts` — reason:
  - `apps/web/src/app/api/**/route.ts` — reason:
  - `packages/**/src/api/**` — reason:
  - `packages/**/src/**/auth*` — reason:

## Merge readiness

- [ ] All GitHub review threads resolved.
- [ ] Copilot or bot findings were either fixed or explicitly closed with technical reasoning.
- [ ] Required checks green (`CI / static`, `CI / unit`, `CI / audit`, `CI / e2e-gate`, `Pilot Gate / pr:verify + pilot:check`, `Security / pnpm-audit`, `Security / gitleaks`).
- [ ] Evidence artifact paths are present and complete.
