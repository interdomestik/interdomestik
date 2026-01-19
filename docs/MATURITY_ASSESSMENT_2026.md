# Interdomestik Engineering Maturity Assessment

**Date**: January 19, 2026  
**Assessor**: Principal Engineer Analysis  
**Scope**: Architecture, Security, Testing, CI/CD, Reliability, Observability, Data Safety, Documentation, Process

---

## Executive Summary

| #   | Finding                                                                                                                                                                                         |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **Architecture is strong**: Strict Core Purity modularization with `*_core.ts` files is above-average for startups; dependency injection and contract boundaries are enforced via purity audit. |
| 2   | **Security has critical gaps**: `assertAgentClientAccess` is a **placeholder** with no DB check; RLS is enabled on some tables but most snapshots show `isRLSEnabled: false`.                   |
| 3   | **Test coverage is improving**: 28 `_core.test.ts` files + 20 domain tests + ~70 E2E specs is respectable; unit test coverage on pure logic is solid.                                           |
| 4   | **CI is minimal but functional**: Single workflow does lint → typecheck → build → migrate → seed → smoke; missing E2E gate run and coverage thresholds.                                         |
| 5   | **Gatekeeper for flake mitigation exists**: `m4-gatekeeper.sh` implements deterministic reset + seed, addressing Supabase reset flakiness.                                                      |
| 6   | **Observability is nascent**: Sentry is integrated, SLOs are defined in docs, but no alerting or dashboards are wired up.                                                                       |
| 7   | **Delivery contract is excellent**: 725-line `delivery-contract.yml` with regex checks is rare for early-stage companies.                                                                       |
| 8   | **E2E security tests exist but are incomplete**: `security-isolation.spec.ts` tests cross-tenant + role gates, but messaging isolation is not tested.                                           |
| 9   | **No middleware file**: Auth handled via layout guards + API route checks; this is unconventional but can work if enforced everywhere.                                                          |
| 10  | **Runbook exists but is thin**: Only covers webhooks, documents, cron; missing incident response, on-call, and escalation procedures.                                                           |

---

## Maturity Scorecard

| Category                                 | Score (1-5) | Justification                                                                                                                        |
| ---------------------------------------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| **Architecture Quality**                 | 4           | Strict Core Purity pattern, domain packages, contracts folder, purity audit. Rare at startup stage.                                  |
| **Security & Isolation**                 | 2.5         | E2E tests found real issue (agent→admin access). But `assertAgentClientAccess` is placeholder. RLS mostly disabled. No threat model. |
| **Test Strategy (Unit/Integration/E2E)** | 3.5         | 48 unit tests on pure logic, ~70 E2E specs, delivery contract guards. Coverage not enforced in CI.                                   |
| **CI/CD & Release Discipline**           | 2.5         | Basic CI exists. No coverage gates, no canary/rollback, no feature flags, no staging environment visible.                            |
| **Reliability / Flake Control**          | 3           | Gatekeeper script, deterministic seed, claim counter race-safety. Good foundation.                                                   |
| **Observability**                        | 2           | Sentry wired, SLOs documented, but no alerts, no dashboards, no distributed tracing.                                                 |
| **Code Quality & Maintainability**       | 3.5         | ESLint, Prettier, Commitlint, Turbo, husky. Strong DX. Some large files remain.                                                      |
| **Data Safety**                          | 3           | Drizzle migrations, unique indexes, transactional claim creation. RLS gaps, no backup runbook.                                       |
| **Documentation & Runbooks**             | 2.5         | RUNBOOK.md covers operational basics. No incident playbook, no architecture diagrams, no ADRs.                                       |
| **Engineering Process**                  | 2           | Conventional commits enforced. No visible PR template, no planning artifacts (PRD/RFC), no retros.                                   |

**Composite Score: 2.9 / 5** (Solid early-stage startup, gaps before production scale)

---

## Top 10 Risks (Ranked by Severity)

| Rank | Risk                                         | Severity    | Why                                                                                                            |
| ---- | -------------------------------------------- | ----------- | -------------------------------------------------------------------------------------------------------------- |
| 1    | **`assertAgentClientAccess` is placeholder** | 🔴 Critical | Agent can access any member's messages without DB check. Lines 71-79 in `permissions.ts` have no enforcement.  |
| 2    | **RLS disabled on most tables**              | 🔴 Critical | Drizzle snapshot shows `isRLSEnabled: false` on 40+ tables. Direct DB access bypasses app-layer checks.        |
| 3    | **No middleware auth guard**                 | 🟠 High     | Auth relies on layout guards per route group; a missed layout = open route. No centralized edge enforcement.   |
| 4    | **No coverage threshold in CI**              | 🟠 High     | Code can ship without tests. No mutation testing. Regressions can slip through.                                |
| 5    | **Messaging isolation not E2E tested**       | 🟠 High     | `security-isolation.spec.ts` tests claims and admin access but not message threads between agent-client pairs. |
| 6    | **No feature flags / canary**                | 🟡 Medium   | Risky deployments without gradual rollout. No kill switch for new features.                                    |
| 7    | **No incident playbook**                     | 🟡 Medium   | RUNBOOK covers operational tasks, not outage response (who pages, RCA template, rollback steps).               |
| 8    | **No backup verification**                   | 🟡 Medium   | No runbook for DB restore, no periodic restore drill.                                                          |
| 9    | **CI doesn't run full E2E gate**             | 🟡 Medium   | CI only runs `--grep smoke`; the 21 golden tests and RBAC tests are skipped.                                   |
| 10   | **No Sentry burn-rate alerts**               | 🟢 Low      | SLOs are documented but not wired to alerting; degradation detection is manual.                                |

---

## Actionable Roadmap

### Next 2 Weeks (Quick Wins)

| Item                                                | Outcome                                  | Work                                                                  | Acceptance                                              | Owner   |
| --------------------------------------------------- | ---------------------------------------- | --------------------------------------------------------------------- | ------------------------------------------------------- | ------- |
| **1. Implement `assertAgentClientAccess` for real** | Agents can only message assigned clients | Add DB check in `permissions.ts` for `agent_clients` table            | Unit test passes with mock DB, E2E test added           | Backend |
| **2. Add E2E messaging isolation test**             | Catch cross-client message leaks         | Add spec: Agent A cannot read Agent B's client messages               | Test in `e2e/smoke/security-isolation.spec.ts` passes   | QA      |
| **3. Enable RLS on critical tables**                | Defense-in-depth                         | Migration to enable RLS on `claims`, `users`, `messages`, `documents` | `SELECT current_setting('role')` shows policies applied | Backend |
| **4. Add coverage gate to CI**                      | No blind spots                           | Add `vitest --coverage` step, fail if < 60% lines                     | CI fails on PR with < 60% coverage                      | DevOps  |
| **5. Run full E2E gate in CI**                      | Catch RBAC regressions                   | Change CI from `--grep smoke` to `e2e/gate e2e/golden`                | CI runs ~40 specs, not ~5                               | DevOps  |

### 30 Days

| Item                                      | Outcome                         | Work                                                                | Acceptance                                | Owner    |
| ----------------------------------------- | ------------------------------- | ------------------------------------------------------------------- | ----------------------------------------- | -------- |
| **6. Write incident playbook**            | Clear outage response           | doc: escalation, on-call rotation, RCA template, rollback procedure | Document reviewed, linked from RUNBOOK.md | Eng Lead |
| **7. Wire Sentry burn-rate alerts**       | Automated degradation detection | Configure 3 SLO alerts per SLOS.md                                  | Slack/email fires on simulated spike      | DevOps   |
| **8. Add SAST scan to CI**                | Catch secrets + vuln patterns   | Add `gitleaks` or `trivy` step                                      | CI fails on secrets in code               | DevOps   |
| **9. Create staging environment**         | Safe pre-prod testing           | Vercel preview + Supabase staging project                           | PR previews run against non-prod DB       | DevOps   |
| **10. Audit all layouts for auth guards** | No open routes                  | Script to verify every layout.tsx has `requireSession`              | Script runs in CI (custom check)          | Backend  |

### 60 Days

| Item                                   | Outcome                    | Work                                                       | Acceptance                         | Owner      |
| -------------------------------------- | -------------------------- | ---------------------------------------------------------- | ---------------------------------- | ---------- |
| **11. Implement feature flags**        | Safe rollout               | Integrate LaunchDarkly/PostHog, wrap 1 feature             | Feature toggled without deploy     | Full-stack |
| **12. Migration rollback procedure**   | Recover from bad migration | Document + test `drizzle rollback`, add to runbook         | Runbook section, tested in staging | Backend    |
| **13. Threat model for multi-tenancy** | Catalogue attack surfaces  | STRIDE on tenant isolation, agent scoping, public tokens   | Markdown doc with mitigations      | Security   |
| **14. Add backup restore drill**       | Verify recoverability      | Test restore from Supabase backup to local, document steps | Documented, timed (< 30 min)       | DevOps     |
| **15. Increase coverage to 70%**       | More safety net            | Add tests to low-coverage modules                          | CI threshold bumped                | Backend    |

### 90 Days

| Item                                              | Outcome                       | Work                                              | Acceptance                                 | Owner    |
| ------------------------------------------------- | ----------------------------- | ------------------------------------------------- | ------------------------------------------ | -------- |
| **16. Distributed tracing (Sentry transactions)** | Debug slow paths              | Instrument key API routes with spans              | Trace visible in Sentry for `/api/claims`  | Backend  |
| **17. Canary deployments**                        | Gradual rollout               | Vercel traffic splitting or custom                | 10% traffic to new version before full     | DevOps   |
| **18. ADR repository**                            | Architecture decision history | Create `docs/adr/`, template, first 3 ADRs        | At least 3 historical decisions documented | Eng Lead |
| **19. PR template with checklist**                | Quality gate                  | `.github/pull_request_template.md`                | All PRs use template                       | Eng Lead |
| **20. Periodic security audit**                   | External validation           | Engage a penetration tester for multi-tenant RBAC | Report reviewed, findings prioritized      | Eng Lead |

---

## Testing Plan

### Unit Tests (Target: 10–20 high-value pure logic tests)

These are **non-negotiable** because they test business invariants without infrastructure:

| #   | Module                     | Test                                         | Why                                  |
| --- | -------------------------- | -------------------------------------------- | ------------------------------------ |
| 1   | `claim-number.ts`          | Race-safe counter increment                  | Prevents duplicate claim numbers     |
| 2   | `claim-number.ts`          | Format CLM-{TENANT}-{YYYY}-{NNNNNN}          | Ensures traceability                 |
| 3   | `member-number.ts`         | Race-safe member number                      | Prevents duplicates                  |
| 4   | `permissions.ts`           | `scopeFilter` returns correct SQL            | Enforces tenant + agent scoping      |
| 5   | `permissions.ts`           | `allowedClaimStatusTransitions` per role     | Prevents illegal status changes      |
| 6   | `permissions.ts`           | `assertAgentClientAccess` throws on mismatch | **CRITICAL - not tested today**      |
| 7   | `subscription-status.ts`   | Lifecycle transitions                        | Prevents invalid subscription states |
| 8   | `handlers.test.ts`         | Paddle webhook idempotency                   | Prevents double-apply                |
| 9   | `status.test.ts`           | Claim status FSM                             | Only allowed transitions             |
| 10  | `assign.test.ts`           | Agent assignment rules                       | Only branch-scoped agents            |
| 11  | `get.test.ts`              | Message retrieval scoping                    | Only thread participants             |
| 12  | `notify.test.ts`           | Notification dedup                           | No spam                              |
| 13  | `create.test.ts`           | Commission calculation                       | Correct percentages                  |
| 14  | `link.test.ts`             | Referral link generation                     | Valid format                         |
| 15  | `get-agents.test.ts`       | Agent filtering by branch                    | Only branch-scoped results           |
| 16  | `get-staff.test.ts`        | Staff CSV role filtering                     | Correct role in output               |
| 17  | `_core.test.ts` (various)  | Page core logic                              | No side effects                      |
| 18  | `analyzePolicyCore`        | Validation + flow                            | Rejects bad files                    |
| 19  | `share-pack/_core.test.ts` | Token expiry + scope                         | No invalid access                    |
| 20  | `health/_core.test.ts`     | Readiness check                              | Correct format                       |

### E2E Smoke Suite (Target: 8–12 high-value, fast tests)

These are **blocking** for merge; run in ~2 minutes:

| #   | Test                                | File                         | Why                                         |
| --- | ----------------------------------- | ---------------------------- | ------------------------------------------- |
| 1   | Member login + dashboard            | `golden-gate.spec.ts`        | Auth + basic nav                            |
| 2   | Member cannot access /admin         | `golden-gate.spec.ts`        | RBAC                                        |
| 3   | Tenant KS cannot see MK claims      | `golden-gate.spec.ts`        | Tenant isolation                            |
| 4   | Agent cannot access /admin          | `security-isolation.spec.ts` | Role gate                                   |
| 5   | Cross-tenant API returns 404        | `security-isolation.spec.ts` | Non-enumeration                             |
| 6   | Public token scope containment      | `security-isolation.spec.ts` | Token abuse                                 |
| 7   | Admin sees global stats             | `golden-gate.spec.ts`        | Dashboard load                              |
| 8   | Branch dashboard V2 loads           | `golden-gate.spec.ts`        | KPI panel                                   |
| 9   | **NEW: Agent messaging isolation**  | (to create)                  | Agent A cannot read Agent B client messages |
| 10  | Cash verification queue loads       | `verification.spec.ts`       | Payment flow                                |
| 11  | Health endpoint returns 200         | `api-permissions.spec.ts`    | Infra smoke                                 |
| 12  | Session cookie is httpOnly + secure | `security/headers.spec.ts`   | Cookie security                             |

### Tests to **Quarantine or Remove** (Low ROI)

| Test                         | Reason                                                                       |
| ---------------------------- | ---------------------------------------------------------------------------- |
| `visual/*.spec.ts`           | Flaky cross-browser screenshots; use periodic visual regression tool instead |
| `repro-sq.spec.ts`           | One-off debug test; remove after fix                                         |
| `quarantine/*.spec.ts`       | By definition unstable; fix or delete within 30 days                         |
| Individual locale variations | Consolidate into parameterized tests                                         |

---

## What Professional Companies Do Better

| Practice                    | Our Status                    | Industry Standard                                                    |
| --------------------------- | ----------------------------- | -------------------------------------------------------------------- |
| **PRD / RFC / Design Doc**  | None found                    | Every feature > 1 week has a written proposal reviewed before coding |
| **ADRs**                    | None                          | Record key architecture decisions with context and tradeoffs         |
| **Feature Flags**           | None                          | All features behind flags; kill switch in prod                       |
| **Canary / Blue-Green**     | None                          | 1–10% traffic to new version before full rollout                     |
| **Coverage Thresholds**     | Not enforced                  | CI fails on < X% coverage (usually 70-80% for mature teams)          |
| **Mutation Testing**        | None                          | Stryker/PIT to validate test quality, not just coverage              |
| **Typecheck in Pre-Commit** | Not in lint-staged            | `tsc --noEmit` runs on every commit                                  |
| **SAST/DAST**               | Dependency review only        | `gitleaks`, `semgrep`, Snyk in CI; DAST with OWASP ZAP periodically  |
| **Secrets Management**      | `.env.local`                  | Vault/1Password/Doppler with rotation, no secrets in repo            |
| **On-Call Rotation**        | Not documented                | PagerDuty/Opsgenie with runbooks, SLA for ack/resolve                |
| **Incident RCA Template**   | Not documented                | Blameless postmortems within 48h of any P0/P1                        |
| **Performance Budgets**     | Next.js build size check only | Lighthouse CI, bundle size delta alerts                              |
| **Chaos Engineering**       | None                          | Periodic failure injection in staging (e.g., kill DB, delay API)     |
| **Dependency Updates**      | Manual                        | Renovate/Dependabot with auto-merge for patch versions               |

---

## Top 12 Next Actions (Prioritized by ROI)

| Priority | Action                                                       | ROI Rationale                              |
| -------- | ------------------------------------------------------------ | ------------------------------------------ |
| 🔴 1     | **Implement `assertAgentClientAccess` with real DB check**   | Closes critical security gap in messaging  |
| 🔴 2     | **Enable RLS on `claims`, `users`, `messages`, `documents`** | Defense-in-depth against direct DB access  |
| 🔴 3     | **Add E2E test for agent messaging isolation**               | Prevents next messaging leak from shipping |
| 🟠 4     | **Run full `e2e:gate` in CI (not just smoke)**               | Catches RBAC regressions automatically     |
| 🟠 5     | **Add coverage threshold (60%) to CI**                       | Forces test writing, prevents blind spots  |
| 🟠 6     | **Write incident playbook (escalation, RCA template)**       | Reduces MTTR when production breaks        |
| 🟠 7     | **Wire Sentry burn-rate alerts for SLOs**                    | Automated detection vs. manual checking    |
| 🟡 8     | **Add SAST (`gitleaks`) to CI**                              | Prevents secrets in code                   |
| 🟡 9     | **Audit all layouts for auth guards**                        | Prevents missing-guard routes              |
| 🟡 10    | **Create staging Supabase project + Vercel preview**         | Safe testing before prod                   |
| 🟡 11    | **Document migration rollback procedure**                    | Recovery from bad migrations               |
| 🟡 12    | **Start ADR repository with 3 historical decisions**         | Onboarding + decision history              |

---

## Assumptions Made

1. **No middleware file is intentional**: The delivery contract explicitly forbids middleware.ts. If this is accidental, priority shifts to adding centralized edge auth.

2. **Supabase is in pooler mode**: If using direct connections without PgBouncer, RLS may not apply as expected; verify connection config.

3. **Staging environment does not exist**: If there is a hidden staging, ignore staging-related roadmap items.

4. **On-call rotation is informal or none**: If there is a rotation, document it; if none, establish one before scaling.

---

_Generated for internal engineering review. Review quarterly or after major incidents._
