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

# OBR-DG29 Post-T506 Next Slice Selection Gate

## Decision

Promote exactly one next governed implementation slice: `T-501`.

Direct implementation remains blocked until this gate merges and
`next-slice.mjs` resolves exactly `T-501`, class `implementation`, Tier 3.

## Evidence

- `T-506` implementation PR `#1181` merged at
  `8c0b27916a8012c74ce68ce56f90c964d89e50e0` from final head
  `f36e88d8c3a073083b9e9e022568b7e9689d0b8b`.
- `T-506` closeout/current-authority PR `#1182` merged at
  `3051cd8733a3ca0aa080a7d58bce664d60180580` from final head
  `ff569c84f4339fdca48ed98471e276c3cc73fcab`.
- Post-closeout main health at `3051cd87` is green for CI, including
  `e2e-gate`, Sonar Main Gate, Secret Scan/gitleaks, and CodeQL. CD/Vercel is
  deployment-only evidence.
- Pre-gate resolver proof on clean main:
  `blocked_requires_current_authority`, `activeSlice=null`, reason
  `umbrella_without_concrete_promoted_slice`.

## Candidate Comparison

| Candidate                                      | Disposition | Rationale                                                                                                                                                                                         |
| ---------------------------------------------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `T-501`                                        | Selected    | Its listed prerequisites are complete (`T-108`, `T-302`, and `T-202`). It is the next ready M5 live-cutover slice after entity migration, and it unblocks later `T-505`.                          |
| `T-502`                                        | Parked      | It depends on `T-307`, which remains TODO, and it deletes/consolidates broad route/layout surfaces. It should not bypass the missing prerequisite or the narrower live-login flag/redirect proof. |
| `T-503`                                        | Parked      | Direct destructive `claims.status` removal remains blocked by the release-cycle proof requirement in the T-503 evidence packet and still needs a fresh destructive-migration approval package.    |
| `T-505`                                        | Parked      | ADR-06 live cutover/cookie-session precedence depends on `T-501`, so it is not independently ready before the live-login flip proof exists.                                                       |
| Other M3/M4/M5, CodeQL high/medium, Dependabot | Parked      | Not the smallest current M5 continuation and not promoted by this gate.                                                                                                                           |

## Promoted Scope

`T-501` is limited to flipping `ida.*` to the sole live login behind a flag and
making country hosts (`ks`, `mk`, `al`, `pilot`) redirect to `ida.*` while
carrying `default_booking_tenant_id`.

The future worker must preserve:

- `apps/web/src/proxy.ts` as the explicit routing/access authority unless the
  `T-501` implementation requires a directly scoped, reviewed change;
- canonical `/member`, `/agent`, `/staff`, and `/admin` routes;
- session tenant/access/legal/booking boundaries from `T-302`/`T-305`;
- completed `T-504` tenant/legal/booking split and `T-506` entity-migration
  semantics;
- country-host alias compatibility behavior from `T-109` except where replaced
  by the promoted redirect behavior under the flag.

## Forbidden Scope

This gate does not authorize implementation. It also does not authorize `T-502`,
direct destructive `T-503`, `T-505`, additional entity migration work, billing
or product UI, schema/RLS/migrations, Operational Brain runtime/live AI,
high/medium CodeQL batches, Dependabot work, README, AGENTS, broad M3/M4/M5, or
broad architecture rewrites.

## Required Future Evidence

The future `T-501` worker must provide:

- active-slice proof resolving exactly `T-501`, implementation, Tier 3;
- feature-flag behavior proof for off and on states;
- redirect proof for `ks`, `mk`, `al`, and `pilot` hosts to `ida.*` carrying
  `default_booking_tenant_id`;
- login/session continuity proof for member, agent, staff, and admin flows;
- hostile/lookalike host and stale-cookie/session-conflict negative proof;
- no tenant-branding or host-as-tenant regression proof for neutral `ida.*`;
- focused route/proxy/auth/session tests proportional to the touched surface;
- Playwright proof for canonical role flows where route behavior changes;
- `pnpm security:guard`, `pnpm pr:verify`, and `pnpm e2e:gate`;
- PR current-head CI, Sonar, CodeQL, gitleaks, pnpm-audit/security,
  pr-finalizer, Pilot Gate, and PR E2E;
- Codex/Copilot feedback disposition;
- bounded Sonnet plus Gemini Tier 3 review if callable/available, with Opus
  only for unresolved high-risk routing/auth ambiguity;
- Codex Security diff scan if available, or exact manual-start/tooling blocker;
- human approval or explicit waiver for routing/auth/session/proxy risk before
  merge readiness.
