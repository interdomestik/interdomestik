---
plan_role: input
status: draft
source_of_truth: false
owner: platform
last_reviewed: 2026-07-05
parent: docs/reviews/2026-07-05-enterprise-transformation-plan.md
---

# Enterprise Transformation Plan — Capability Areas 8-13

> Status: Transformation-plan appendix, docs-only input. This creates no
> runtime authority.

## 8. Performance & Scale

**Target:** CI-enforced budgets for public/member surfaces; 10x pilot load test
for Help Now, member reads, uploads, and webhooks; N+1 audit; graceful
degradation for AI/email/push/Paddle/storage outage. **Now:** M2. Evidence
includes ent-perf01-06, upload latency runs, p23, and MOB budgets on paper.
**Gap:** budgets not enforced, no realistic load test, degradation not
chaos-tested. **Needs:** MOB gate budget checks, k6-class load test, degradation
drill. **Owner:** platform. **Stop:** p95 SLO breach at 1x blocks Stage-2
claims.

## 9. Support Operations & Runbooks

**Target:** the first 10 runbooks exist and are rehearsed: login failure, tenant
mismatch, upload failure, billing failure, document access, erasure request,
pack content hotfix, deploy halt, restore, breach notice. **Now:** M2-. Evidence
exists in RUNBOOK.md, INCIDENT_PLAYBOOK.md, ent-ops02, and audit trails, but
support practice is undocumented. **Gap:** only about 3/10 runbooks; no
support-facing lookup procedure; B6 missing. **Needs:** B6 first, then login,
tenant, upload, billing, remaining runbooks, support-access procedure, metrics.
**Owner:** ops. **Stop:** support improvising member lookups without role
discipline.

## 10. Commercial Readiness

**Target:** validated conversion funnel, five-KPI dashboard live, L5-reviewed
pricing/fee promises, sponsor kit quoting real controls, governed agent channel
when promoted, churn/renewal measured. **Now:** M2. Evidence includes c01-c06,
funnel events from MOB-01, pricing surfaces, membership tiers, and the mobile
strategy docs; live non-dark funnel data is zero. **Gap:** no populated
dashboard, memos unsigned, L5 not run, wedge unproven. **Needs:** memos, L2,
MOB-01b, dashboard, L5, sponsor kit, 90-day expansion review. **Owner:**
leadership + product. **Stop:** paid acquisition before dashboard exists.

## 11. User Trust & UI/UX Maturity

**Target:** mobile design system built as contracted; trust architecture live
through ReviewBadge, FeeMathSheet, consent, equal-dignity, filing-grade PDFs,
and scripted accessibility. **Now:** M2+ on design, M1 on built product. The
design package is strong; the built mobile product is one dark slice. **Gap:**
execution: Figma, PDFs, and MOB-02/03/05 wave. **Needs:** gate closeouts and
trust metrics in the KPI dashboard. **Owner:** product/design. **Stop:** audit
stop conditions 1-5 and 9; growth pressure must not erode equal-dignity.

## 12. AI / Automation Governance

**Target:** AI remains advisory, consent-backed, tenant-scoped,
document-scoped, and audit-backed; evals run on every AI change; provider,
model, and prompt versions are recorded; deterministic fallbacks exist. **Now:**
M3- on governance design, M2 on operational proof. Evidence includes
T-403/403b/404/405, ai01-06, p37, and d666f553. **Gap:** continuous eval proof
is thin; provider outage degradation untested; "AI never" list is implicit.
**Needs:** AI governance charter, eval cadence proof, degradation drill. **Owner:**
platform + counsel. **Stop:** AI output reaching members without consent context
or ReviewBadge framing.

## 13. Engineering Process & Quality Culture

**Target:** slice/gate discipline survives success; two-senior approval for
`proxy.ts`, shared-auth, RLS, billing, and destructive schema diffs; reviewer
routing reliability measured; new senior engineer productive in one week from
docs alone. **Now:** M3. Evidence includes planning-governance policy, 90+ revs,
conformance log, modularity guard, review remediation, and quarantine burndown.
**Gap:** founder-dependent resolver, no codified two-approval rule, no
onboarding test. **Needs:** CODEOWNERS/protected-path rule, resolver succession
note, onboarding dry run. **Owner:** leadership + platform. **Stop:** no merged
slice without tracker closeout.
