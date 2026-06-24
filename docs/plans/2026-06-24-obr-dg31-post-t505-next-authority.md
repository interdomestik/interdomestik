---
plan_role: input
status: active
source_of_truth: false
owner: platform
last_reviewed: 2026-06-24
tracker_path: docs/plans/current-tracker.md
---

> Status: Tier 0 current-authority/design-gate record. This document supports
> `current-program.md`, `current-tracker.md`, and the architecture tracker; it is
> not a source of truth by itself and does not implement runtime, product,
> schema, RLS, migration, auth, tenancy, routing, billing, or security
> remediation work.

# OBR-DG31 Post-T505 Next Slice Selection Gate

## Decision

Promote exactly one next governed slice: `T-307`.

Direct work remains blocked until this gate merges and `next-slice.mjs` resolves
exactly `T-307`.

## Evidence

- `T-505` ADR-only closeout PR `#1189` merged at
  `c2840317e5903a11aba1f102dfaf7902d023e1d6` from final head
  `b55f44e4f4d47d91e696cfb9cd87e9f8f15f1dcf`.
- Post-merge main health at `c2840317` is green for CI run `28107733869`,
  including `validation-surface` job `83226458719`, `audit` job `83226458632`,
  `static` job `83226504436`, `unit` job `83226504377`, `ai-eval` job
  `83226504394`, and `e2e-gate` job `83226504390`; Sonar Main Gate run
  `28107734053` succeeded with `sonar-gate` job `83226458421`; Secret
  Scan/gitleaks run `28107733919` succeeded with `gitleaks` job `83226458604`;
  CodeQL run `28107733151` succeeded for JavaScript/TypeScript job
  `83226461333` and Actions job `83226461465`. CD/Vercel is deployment-only
  evidence and is not readiness proof.
- Pre-gate resolver proof on clean `origin/main`:
  `blocked_requires_current_authority`, `activeSlice=null`, reason
  `umbrella_without_concrete_promoted_slice`.
- Canonical architecture tracker row: `T-307` is `TODO`, depends on completed
  `T-302`, and is the prerequisite for the still-parked `T-502` layout
  consolidation.

## Candidate Comparison

| Candidate                                  | Disposition | Rationale                                                                                                                                                                                                       |
| ------------------------------------------ | ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `T-307`                                    | Selected    | It is the smallest remaining unblocked prerequisite for `T-502`: split `apps/web/src/lib/proxy-logic.ts` into resolve / secure(CSP,HSTS) / gate modules while preserving routing behavior and the E2E baseline. |
| `T-502`                                    | Parked      | It remains blocked by canonical prerequisite `T-307` and deletes/consolidates broad route/layout surfaces; it must not start before the route-gate separation proof lands green.                                |
| `T-503`                                    | Parked      | Direct destructive `claims.status` removal remains blocked by release/destructive-migration proof and fresh explicit risk review; it is not authorized by this gate.                                            |
| Additional entity migration or billing     | Parked      | `T-504`, `T-506a`, and `T-506` are already closed; no follow-on entity migration, billing, terms, or Paddle work is the smallest current M5 continuation.                                                       |
| Other M3/M4/M5, Dependabot, CodeQL batches | Parked      | Not the smallest current continuation, not a prerequisite to `T-502`, or explicitly out of scope for this post-`T-505` selection.                                                                               |

## Promoted Scope

`T-307` is limited to route/proxy separation-of-concerns preparation:

- split `apps/web/src/lib/proxy-logic.ts` into focused resolve, security header
  (CSP/HSTS), and gate modules, or the repo-local equivalent needed to satisfy
  the tracker acceptance criterion;
- preserve `apps/web/src/proxy.ts` behavior and keep it read-only unless a
  fresh explicit authorization is obtained before implementation;
- preserve canonical routes `/member`, `/agent`, `/staff`, and `/admin`;
- preserve all contractual clarity markers;
- preserve existing tenant, session, country-host, `ida.*`, and login redirect
  behavior proven by `T-108`, `T-109`, `T-114`, `T-302`, `T-501`, and `T-505`;
- keep the `.e2e_baseline_count` and required E2E gate baseline unchanged unless
  the implementation worker finds a repo-approved gate mechanism that proves the
  same no-regression requirement without weakening coverage.

## Forbidden Scope

This gate does not authorize product expansion or broad architecture work. It
also does not authorize `T-502`, direct destructive `T-503`, `apps/web/src/proxy.ts`
edits without fresh explicit approval, canonical route renames, clarity marker
changes, schema/RLS/migrations, billing/product UI, additional entity migration,
Operational Brain runtime/live AI, high/medium CodeQL batches, Dependabot work,
README, AGENTS, broad M3/M4/M5, or broad architecture rewrites.

## Required Future Evidence

The future `T-307` worker must provide:

- active-slice proof resolving exactly `T-307`;
- Tier 3 design evidence because the implementation is route/security-gate
  adjacent;
- diff proof scoped to proxy-logic decomposition and directly supporting tests;
- before/after behavior proof for tenant resolution, public IDA, country-host
  compatibility aliases, login redirects, stale-cookie/session-conflict paths,
  CSP nonce behavior, and canonical role routes;
- `.e2e_baseline_count` or equivalent gate-baseline proof;
- focused unit and E2E gate proof plus the repo-required `pnpm pr:verify`,
  `pnpm security:guard`, and `pnpm e2e:gate`;
- reviewer, Sonar, CodeQL, gitleaks, pnpm-audit, Copilot/review-thread, and
  post-merge main-health disposition before any follow-on worker starts.
