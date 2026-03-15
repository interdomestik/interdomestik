> Status: Completed on 2026-03-15. This is supporting implementation evidence, not the live program source of truth.

# G08 Free Start And Group Privacy Boundaries

## Goal

Extend the scripted `P6` release gate beyond the published commercial contract surfaces so RC runs also prove two launch-boundary promises:

1. Free Start stays informational-only and the hotline stays routing-only on the live public surface.
2. Office-tier group dashboards stay aggregate-only and do not leak seeded member-identifying text.

## Implementation

- Added `G08` to the canonical `p6` and `all` release-gate suites.
- Added deterministic office-agent release-gate credentials so `/agent/import` can be checked through the real office-tier route gate.
- Updated the shared release-gate account bootstrap so role-derived accounts like `office_agent` land on the canonical `/agent` portal instead of a synthetic path.
- Added a new `G08` scripted check that:
  - validates `free-start-triage-note` plus the informational-only and routing-only boundary copy on `/`
  - validates `group-dashboard-summary` plus the aggregate-only privacy copy on `/agent/import`
  - fails if seeded member-identifying text such as `KS A-Member 1` or `member.ks.a1@interdomestik.com` appears on the office-tier group dashboard
- Extended the RC report and template so `G08` evidence appears in the same GO/NO-GO artifact as the other release-gate checks.
- Made deterministic seed tiers explicit for office-capable agents used by the RC gate so the check does not depend on per-test elevation.

## Evidence

- `scripts/release-gate/config.ts`
- `scripts/release-gate/shared.ts`
- `scripts/release-gate/run.ts`
- `scripts/release-gate/report.ts`
- `scripts/release-gate/run.test.ts`
- `.github/workflows/release-candidate.yml`
- `.github/workflows/pilot-gate.yml`
- `packages/database/src/seed-golden.ts`
- `docs/release-gate-template.md`

## Verification

- `pnpm test:release-gate`
- `pnpm plan:status`
- `pnpm plan:audit`
- `pnpm security:guard`
- `pnpm e2e:gate`
- `pnpm pr:verify`
