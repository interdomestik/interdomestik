---
plan_role: input
status: active
source_of_truth: false
owner: platform
last_reviewed: 2026-03-07
---

# V03 Member Number Integrity Evidence

> Status: Active supporting input. This document records the local execution evidence for `V03` member-number remediation and observability work.

## Scope

`V03` required three outcomes:

- audit existing member-number state
- repair malformed member numbers without touching allowed legacy pilot identifiers
- make self-heal activity observable before any fallback removal is considered

## Code Evidence

- remediation classifier and audit summary in [member-number-remediation.ts](../../packages/database/src/member-number-remediation.ts)
- repair-aware backfill flow in [backfill-members.ts](../../packages/database/src/scripts/backfill-members.ts)
- self-heal lifecycle telemetry helper in [member-number-observability.ts](../../apps/web/src/lib/auth/member-number-observability.ts)
- auth hook instrumentation in [hooks.ts](../../apps/web/src/lib/auth/hooks.ts)

## Test Evidence

The following focused checks passed on 2026-03-07:

- `pnpm --filter @interdomestik/database exec tsx --test test/member-number-remediation.test.ts`
- `pnpm --filter @interdomestik/web test:unit --run src/lib/auth/member-number-observability.test.ts`
- `pnpm --filter @interdomestik/database type-check`
- `pnpm --filter @interdomestik/web type-check`

## Local Repair Evidence

Local database target:

- `DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres`

Audit and repair sequence:

1. Initial audit run:
   - missing: `2`
   - canonical: `39`
   - allowed legacy: `10`
   - repairable malformed: `2`
2. Repair run with `--repair-malformed`:
   - reset and reissued `2` malformed member numbers
   - repaired missing/null members in the same pass
3. Final verification run:
   - missing: `0`
   - canonical: `43`
   - allowed legacy: `10`
   - repairable malformed: `0`

Allowed legacy identifiers intentionally preserved:

- `PILOT-PR-*` seeded pilot member numbers from [seed-golden.ts](../../packages/database/src/seed-golden.ts#L137)

Repairable malformed examples detected and fixed locally:

- `golden_ks_b_member_1: MEM-2026-00008`
- `golden_ks_b_member_2: MEM-2026-00009`

## Conclusion

`V03` is complete for code and local operational evidence.

The fallback session self-heal remains in place by design. `V03` does not remove it. It adds observability so future removal can be based on evidence instead of assumption.
