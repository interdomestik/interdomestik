# MOB-01b Closeout - MK Help Now Non-Dark Enablement

Date: 2026-07-08
Authority consumed: `MOB-DG01B`
Implementation PR: `#1312`
Merge/main SHA: `cc6604ebd1679e3400d6a55ffa6784140b1d4c0a`

## Verdict

`MOB-01b` is complete.

The implementation consumed the `MOB-DG01B` promotion and exposed only the
accepted MK Help Now pack through the already-merged `MOB-01` dark-pack
mechanism. No replacement implementation slice is promoted by this closeout.
Expected resolver state after this tracker closeout is
`blocked_requires_current_authority`, `activeSlice=null`.

## Evidence Recorded

- Accepted MK evidence reference used by runtime:
  `evidence-center:2026-07-07:gazmend:mk-country-content`.
- Runtime metadata keeps public reviewer data non-personal:
  `appointed-mk-l2-reviewer`.
- Public content manifest version:
  `mob-01b-mk-help-now-public-2026-07-08-v1`.
- PR `#1312` exposed MK as public while preserving dark state for KS, AL, RS,
  ME, BA, HR, SI, DE, AT, CH, SE, NO, DK, NL, BE, FR, IT, ES, GB, US, CA, and
  AU.
- PR `#1312` added public route proof for `/:locale/help-now`, including the
  MK country state, signed-pack count, generation affordance, and no emergency
  number exposure.
- PR `#1312` preserved the service-worker/cache guard path and aligned the
  public JSON manifest with TypeScript pack metadata.
- PR `#1312` kept anonymous Help Now instrumentation PII-free by avoiding
  account, claim, document, payment, precise-location, health, injury, and
  free-text event payloads.

## Verification

Local verification before merge:

- `node tools/brain-task.mjs "Interdomestik MOB-01b MK Help Now non-dark current tracker evidence gates" --project interdomestik --require-current`
- `pnpm --filter @interdomestik/web test:unit --run src/features/help-now/content-packs.test.ts src/features/help-now/help-now-experience.test.tsx src/features/help-now/trip-mode.test.tsx src/features/help-now/offline.test.ts src/features/help-now/sw-cache-guard.test.ts`
- `pnpm --dir apps/web exec playwright test e2e/gate/help-now-public.spec.ts --project=gate-mk-mk`
- `pnpm slice:static`
- `git diff --check`
- `pnpm repo:size:check`
- `pnpm check:modularity-guard`
- `interdomestik_qa.scope_audit`

Remote PR verification before merge:

- CI `28921016735`: validation-surface, audit, static, unit, and e2e-gate
  passed.
- PR E2E `28921016762`: e2e passed.
- Pilot Gate `28921016756`: Pilot Gate Preflight, Pilot Gate Runner, and
  `pilot-gate` passed.
- CodeQL, gitleaks, pnpm-audit, Dependency Review, OSV, Semgrep, SonarCloud,
  commitlint, reviewdog, and `pr-finalizer` passed.
- Copilot review comments about public personal-data exposure were remediated
  by replacing the public reviewer value with `appointed-mk-l2-reviewer`; both
  review threads were resolved before merge.

## No-Touch Statement

PR `#1312` did not touch `apps/web/src/proxy.ts`, canonical route authority,
auth/session, tenancy, schema/RLS, migrations, billing/Paddle/fee math, member
account creation, member surfaces, claim-transition writers, VONESA/flight,
Operational Brain runtime/live AI, README, AGENTS, broad architecture docs,
KS/AL exposure, paid launch, or broad UI package implementation.

## Residual Boundary

`MOB-01b` proves bounded non-dark MK Help Now readiness only. It does not
authorize KS/AL exposure, paid acquisition, legal/emergency/claim-handling
promises, billing runtime, provider mutation, or launch expansion. Any future
current-main staging P0.1 agent/staff marker miss still freezes follow-on
Help Now exposure work and returns to current authority.
