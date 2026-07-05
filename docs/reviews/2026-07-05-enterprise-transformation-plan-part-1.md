---
plan_role: input
status: draft
source_of_truth: false
owner: platform
last_reviewed: 2026-07-05
parent: docs/reviews/2026-07-05-enterprise-transformation-plan.md
---

# Enterprise Transformation Plan — Capability Areas 1-7

> Status: Transformation-plan appendix, docs-only input. This creates no
> runtime authority.

Each area uses the same lens: target, current maturity, gap, capabilities,
evidence, sequence, dependencies, owner type, horizon, and stop risk.

## 1. Architecture & Domain Boundaries

**Target:** domain packages with contract-tested boundaries; outbox as the only
cross-domain channel; read models outbox-only; DOM packaging executed when
promoted. **Now:** M3-. Evidence includes T-201, T-204/T-408, T-208/b, ARCH-M1,
T-305, and the modularity guard. **Gap:** boundary erosion risk as velocity
resumes. **Capabilities:** dependency-direction lint, per-domain CODEOWNERS,
DOM slices through authority. **Evidence:** boundary-lint green and quarterly
import-graph snapshots. **Sequence:** snapshots now, lint in 90 days, DOM in
6-12 months. **Owner:** platform. **Stop risk:** product pressure creating
cross-domain imports "just this once."

## 2. Tenant Isolation & Authorization

**Target:** `access_tenant_id` is provably the isolation boundary everywhere;
four contexts stay separate; `actor_role_on_session` enforced on every
protected surface. **Now:** M2+. Evidence includes T-301/302/302b/303/304/305/
306, tenant-leak harness, T-109, T-114, d08, and sec06-08. **Gap:** proofs are
per-slice, B2 is open, role-session proof beyond `/member` is missing. **Needs:**
B2 record, consolidated tenant-isolation proof, role-session assertions,
quarterly access review. **Owner:** security + platform. **Horizon:** now to 90
days. **Stop:** reproduced leak or B2 residual freezes promotion.

## 3. Security Program

**Target:** threat models current, findings register live, secrets rotation
scheduled, dependency policy enforced, independent pen test passed, high-risk
diffs reviewed by two seniors. **Now:** M2+. Evidence includes CodeQL, gitleaks,
Sonar, `security:guard`, ent-tm01-09, sec06-11, p33, ent-sca01-04. **Gap:** no
findings register, no pen test, no rotation schedule, no tm10 for public Help
Now/SW/cache. **Needs:** findings register, tm10, rotation calendar, scoped pen
test after Stage-1 surfaces stabilize. **Owner:** security. **Stop:** any
high/critical finding creates a red baseline.

## 4. Privacy / GDPR & Legal Evidence

**Target:** DSR lifecycle rehearsed; crypto-shredding includes storage objects
and logs; DPIA exists before Art. 9 scope; processor register and retention
schedule are current. **Now:** M2+. Evidence includes T-104d-h, deletion API,
ent-dlv01/02, p39-dg05, T-507, T-506a. **Gap:** DPIA, processor/DPA register,
retention schedule, log-PII answer, and DSR rehearsal are missing. **Needs:**
processor register, DSR rehearsal, DPIA, log-PII audit, retention schedule.
**Owner:** DPO/counsel + platform. **Stop:** medical scope without DPIA is hard
blocked.

## 5. Billing / Revenue / Finance Correctness

**Target:** finance can reconstruct any member's money history without
engineering help; monthly Paddle/internal reconciliation is reviewed; refund,
dunning, grace, and success-fee paths are test-covered. **Now:** M2/M3-.
Evidence includes T-204/T-408, T-112, T-407, p2, sec10/11, dunning cron, tm07.
**Gap:** routine reconciliation and finance-readable reconstruction are not
proven; Memo 1 remains unsigned. **Needs:** Memo 1, first reconciliation report,
finance-day rehearsal, refund E2E. **Owner:** finance + platform. **Stop:** any
unexplained reconciliation delta pauses paid acquisition.

## 6. Release Engineering & CI/CD

**Target:** weekly production releases are boring; release candidate process is
written; rollback is rehearsed quarterly; post-deploy smoke auto-halts; gate
flake rate is measured. **Now:** M3-. Evidence includes `pr:verify`,
`security:guard`, `e2e:gate`, Pilot Gate, golden specs, quarantine lane,
release templates, delivery contracts, Checkly, sp01/sp02, ent-sca03/04.
**Gap:** rollback cadence, deploy-halt rehearsal, RC checklist, and flake-rate
number. **Needs:** one-page RC checklist, rollback/deploy-halt drill, flake
metric. **Owner:** release engineering. **Stop:** red main blocks promotion.

## 7. Observability, SLOs & Incident Response

**Target:** SLOs are enforced; every public/member surface is in the alert
catalog; incidents are rehearsed; status page and customer-notice templates
exist; support can trace actions by correlation ID. **Now:** M2+. Evidence
includes SLOS.md, d07 Sentry burn-rate alerts, ent-alert01-14, route tagging,
INCIDENT_PLAYBOOK.md, and Checkly. **Gap:** no on-call rota, `/help-now` alert
coverage not confirmed, no game-day record, no status page. **Needs:** B7,
rota, game day, status page, SLO-freeze rule. **Owner:** ops + platform.
**Stop:** an unacknowledged test page means the rota is not real.
