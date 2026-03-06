---
plan_role: input
status: active
source_of_truth: false
owner: platform
last_reviewed: 2026-03-06
---

# v0.1.0 Production Background Plan

> Status: Active supporting input. This document explains the production rebaseline and the background enterprise runway. It does not define live execution status.

## Why The Program Was Rebased

The March 3-5 planning-governance tranche delivered useful controls:

- one canonical program document
- one canonical tracker
- one active execution log
- advisory memory and boundary evidence
- reconciled historical release-evidence custody

That work is now foundation, not the critical path to `v0.1.0`.

The current release blockers are concentrated elsewhere:

- a live unsafe alternate registration path in `apps/web/src/app/api/simple-register/**`
- multiple member-number generation implementations and write paths
- malformed existing member data risk beyond null-only backfill
- duplicated retry/resilience logic outside shared utilities
- a still-failing strict entrypoint database-boundary check
- broader-than-needed dynamic rendering and root hydration in the Next.js app shell

## Active Release Convergence Slice

The active `v0.1.0` slice should stay narrow and deterministic.

### 1. Close Unsafe Alternate Registration Paths

- remove or hard-restrict `apps/web/src/app/api/simple-register/route.ts`
- remove caller-controlled role creation in `apps/web/src/app/api/simple-register/_core.ts`
- retire `apps/web/src/features/auth/registration.service.ts` as a public creation path

### 2. Canonicalize Member Write Paths

- converge member-number generation on `packages/database/src/member-number.ts`
- remove degraded or duplicate generators in `apps/web/src/server/domains/members/member-number.ts`
- remove the stale utility in `apps/web/src/utils/member.ts`
- make registration, conversion, and agent flows share the same invariants

### 3. Repair Existing Member Data

- audit for malformed non-null member numbers
- repair bad values before relying on the existing null-only backfill
- keep the session self-heal fallback until instrumentation proves it is no longer needed

### 4. Enforce Guardrails

- replace local retry copies with `packages/shared-utils/src/resilience.ts`
- fix the current strict entrypoint violation in `apps/web/src/app/[locale]/(agent)/agent/layout.tsx`
- then enforce strict entrypoint boundary checks in verification and CI

### 5. Apply A Narrow Next.js Production Hardening Slice

- reduce unnecessary `force-dynamic` usage on shared/public route segments
- push providers deeper than the root app shell where practical
- replace key internal marketing and conversion anchors with `Link`
- adopt `next/font` or record an explicit reason not to

## Enterprise Runway After The Slice

This work should remain a background plan until the convergence slice lands:

- move multi-step side effects to durable workflows
- add request traces and critical-path metrics
- widen database defense in depth with staged RLS adoption
- add a staging environment and stricter production verification lanes
- continue extracting domain ownership out of `apps/web` without broad rewrites

This runway aligns with current server-first Next.js guidance, durable workflow patterns, and telemetry-first production operations, but it must not block the release slice.

## Explicit Non-Goals For `v0.1.0`

- no routing, auth, or tenancy architecture refactor
- no changes to `apps/web/src/proxy.ts`
- no broad domain-package extraction campaign
- no repo-wide maturity-program rollout as a release prerequisite
- no frontend redesign beyond production-hardening improvements
