# Interdomestik Program Charter (Canonical)

- version: `1.0.0`
- effective_date: `2026-03-03`
- supersedes: `Planning draft discussed on 2026-03-03 in execution planning thread`
- change_control_rule: `Out-of-scope changes require explicit owner approval and updated conformance record before implementation continues.`

## 1. Executive Summary

This charter defines the baseline enterprise delivery program for Interdomestik under Phase C controls. It preserves no-touch boundaries, deterministic release gates, tenant isolation stop-the-line rules, and evidence-based release discipline while introducing a governed path for continuous engineering improvement.

## 2. Current-State Gap Matrix

| Workstream                 | Current State                            | Target State                        | Key Gap                                         |
| -------------------------- | ---------------------------------------- | ----------------------------------- | ----------------------------------------------- |
| A. Agent memory foundation | Orchestrator/retry/metrics lanes exist   | Typed governed memory lifecycle     | Memory registry + governed promotion missing    |
| B. Trust and compliance    | Strong release gates and tenant checks   | Audit-ready trust fabric            | Boundary contracts need memory-aware governance |
| C. Desktop workflows       | Role-specific portals + gate markers     | Enterprise desktop operations       | Ops depth and reporting gaps                    |
| D. Mobile operations       | PWA and voice/upload primitives          | Field-resilient completion flows    | Offline-safe field loop incomplete              |
| E. Integrations ecosystem  | Paddle + webhook + notifications present | Connector-grade ecosystem           | Generic connector framework incomplete          |
| F. Reliability and release | Deterministic release-gate discipline    | Predictive reliability intelligence | Memory/eval feedback not yet integrated         |

## 3. Workstream Maturity Scores

- A: `34/100`
- B: `82/100`
- C: `68/100`
- D: `41/100`
- E: `47/100`
- F: `87/100`

## 4. Prioritized Epic Backlog

1. `B1` Boundary Change Contract
2. `A1` Memory Registry & Candidate Capture
3. `A2` Memory Retrieval Injection & Promotion Controls
4. `F1` Release Determinism Hardening
5. `A3` Learning Quality Eval + Stale Cleanup
6. `B2` Tenant Isolation Control Expansion
7. `C1` Desktop Ops Hardening
8. `F2` Reliability Intelligence + RC Checkpoints
9. `E1` Integration Backbone Contract
10. `D1` Mobile Foundation
11. `D2` Mobile Field MVP
12. `C2` Desktop Enterprise Pack
13. `E2` Connector MVP(s)

## 5. Timeline Options

- Lean: `32 weeks`
- Balanced (recommended): `26 weeks`
- Aggressive: `20 weeks`

## 6. Recommended Plan and Critical Path

- Active option: `Balanced`
- Critical path: `A1 -> A2 -> B1 -> F1 -> C1 -> D1 -> E1 -> D2 -> F2`
- Sequencing note: execution order can differ from raw RICE rank when lower-ranked epics are prerequisites for higher-risk controls.

## 7. 30/60/90 + 6-Month Implementation Plan

- 30 days: `A1` + `A2` start + `B1` advisory bootstrap
- 60 days: `A2/B1` stabilize, `F1` start, `C1` start
- 90 days: `F1/C1` complete, `D1/E1` begin
- 6 months: `D2/F2` complete; `C2/E2` contingent on KPI gates

## 8. Agent Memory Operating Model

- Stores: `episodic`, `procedural`, `semantic`
- Status lifecycle: `candidate -> validated -> canonical -> obsolete`
- Promotion: by policy pass or owner/HITL, with HITL mandatory for security-sensitive lessons
- Conflict/supersession tracking: required for canonical memory hygiene

## 9. Verification and Governance Model

Mandatory Phase C lanes remain unchanged:

- `pnpm pr:verify`
- `pnpm security:guard`
- `pnpm e2e:gate`

Release evidence discipline remains anchored by:

- `scripts/release-gate/run.ts`
- `scripts/release-gate/check-no-skip.mjs`
- `scripts/release-gate/verify-required-specs.mjs`
- `scripts/release-gate/write-rc-manifest.mjs`
- `scripts/release-gate/streak/capture-streak.mjs`

## 10. KPI Scorecard

Engineering:

- lead time
- change failure rate
- regression rate
- MTTR

Product ops:

- claim cycle time
- mobile field completion
- onboarding time

Business proxy:

- time-to-value
- pilot conversion signals
- retention proxies

## 11. Sprint 1 Starter Backlog

- `A1.1` typed schema and lifecycle
- `A1.2` deterministic indexing and IDs
- `A2.1` advisory retrieval hook
- `B1.1` protected-path taxonomy
- `F1.0` baseline reliability snapshot

## 12. Risks, Assumptions, Open Questions

Risks:

- false-positive advisory signals
- QA bandwidth constraints
- runtime expansion from added lanes

Assumptions:

- team composition unchanged
- no-touch boundaries remain fixed
- no auth/routing/tenancy architecture refactors

Open questions:

- threshold tuning for advisory-to-enforced transition
- connector order of operations after foundation

## Evidence Basis (Repo-Relative)

- `package.json`
- `scripts/release-gate/v1-required-specs.json`
- `scripts/release-gate/run.ts`
- `scripts/security-guard.mjs`
- `scripts/m4-gatekeeper.sh`
- `apps/web/e2e/gate/tenant-resolution.spec.ts`
- `apps/web/e2e/pilot/c2-03-cross-tenant-write-isolation.spec.ts`
- `packages/database/test/rls-engaged.test.ts`
- `apps/web/src/lib/canonical-routes.ts`
- `apps/web/src/app/[locale]/(staff)/staff/claims/_core.entry.tsx`
- `apps/web/src/components/pwa-registrar.tsx`
- `packages/domain-membership-billing/src/paddle-server.ts`
