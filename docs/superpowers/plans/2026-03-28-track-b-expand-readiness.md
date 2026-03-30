# Track B Expand Readiness Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a fresh, bounded, evidence-complete KS pilot line that can support a future explicit `expand` decision without mixing in Track A product polish.

**Architecture:** This work has two layers. First, fix only the small rollout blockers that would weaken the next pilot's credibility or measurement quality. Second, run a fresh bounded continuation on a new pilot id and produce the canonical evidence, rollup, executive review, and closeout artifacts required by the expand gate. Do not touch routing, auth, tenancy, or `apps/web/src/proxy.ts`.

**Tech Stack:** Next.js 15, TypeScript, Vitest, Playwright, pnpm pilot scripts, docs/pilot authority artifacts, Drizzle/PostgreSQL.

---

## File Map

**Pre-start code and test files**

- Modify: `scripts/pilot/query_week1_totals.ts`
- Create: `scripts/pilot/pilot-rollup-core.ts`
- Create: `scripts/pilot/pilot-rollup-core.test.ts`
- Modify: `apps/web/src/app/[locale]/(app)/member/claim-report/page.tsx`
- Modify: `apps/web/src/app/[locale]/(app)/member/green-card/page.tsx`
- Modify: `apps/web/src/app/[locale]/(app)/member/benefits/page.tsx`
- Modify: `apps/web/src/app/[locale]/(app)/member/incident-guide/page.tsx`
- Create: `apps/web/src/app/[locale]/(app)/member/claim-report/page.test.tsx`
- Create: `apps/web/src/app/[locale]/(app)/member/green-card/page.test.tsx`
- Modify: `apps/web/src/app/[locale]/(app)/member/benefits/page.test.tsx`
- Create: `apps/web/src/app/[locale]/(app)/member/incident-guide/page.test.tsx`
- Modify: `apps/web/e2e/gate/member-home-cta.spec.ts`
- Modify: `apps/web/src/app/[locale]/(site)/legal/privacy/_core.entry.tsx`
- Modify: `apps/web/src/app/[locale]/(site)/legal/cookies/_core.entry.tsx`
- Modify: `apps/web/src/messages/en/legal.json`
- Modify: `apps/web/src/messages/mk/legal.json`
- Modify: `apps/web/src/messages/sq/legal.json`
- Modify: `apps/web/src/messages/sr/legal.json`
- Create: `apps/web/src/app/[locale]/(site)/legal/privacy/_core.entry.test.tsx`
- Create: `apps/web/src/app/[locale]/(site)/legal/cookies/_core.entry.test.tsx`
- Create: `apps/web/e2e/gate/public-legal.spec.ts`

**Pilot authority artifacts for the fresh bounded line**

- Create: `docs/pilot/V1_0_0_EXPAND_READINESS_STARTER_PACK.md`
- Modify: `docs/pilot/PILOT_EXEC_REVIEW_TEMPLATE.md`
- Create: `docs/pilot/PILOT_WEEK1_KPI_ROLLUP_TEMPLATE.md`
- Create: `docs/pilot/PILOT_CLOSEOUT_TEMPLATE.md`
- Create: `docs/pilot/live-data/pilot-claim-timeline-export.template.sql`
- Create: `docs/pilot/PILOT_EVIDENCE_INDEX_<new-pilot-id>.md` via `pnpm release:gate:prod -- --pilotId <new-pilot-id>`
- Update: `docs/pilot-evidence/index.csv` via `pnpm release:gate:prod -- --pilotId <new-pilot-id>`
- Create: `docs/pilot/live-data/<new-pilot-id>_day-<n>_claim-timeline-export.csv`
- Create: `docs/pilot/live-data/<new-pilot-id>_day-<n>_claim-timeline-export.sql`
- Create: `docs/pilot/PILOT_WEEK1_KPI_ROLLUP_<new-pilot-id>.md`
- Create: `docs/pilot/PILOT_EXEC_REVIEW_<new-pilot-id>.md`
- Create: `docs/pilot/PILOT_CLOSEOUT_<new-pilot-id>.md`

**No-touch zones**

- `apps/web/src/proxy.ts`
- `apps/web/src/lib/proxy-logic.ts`
- `apps/web/src/lib/tenant/**`
- `apps/web/src/lib/auth/**`
- `apps/web/src/server/auth/**`
- `apps/web/src/app/api/**`
- `packages/shared-auth/**`
- `packages/database/**`
- `packages/domain-membership-billing/**`
- `.github/workflows/**`
- `scripts/release-gate/**`

## Chunk 1: Pre-Start Blockers

### Task 1: Make The Weekly Rollup Reusable For The Next Pilot

**Owner:** `platform + qa`

**Why this exists:** `scripts/pilot/query_week1_totals.ts` is hardcoded to the March KS live cohort. The next bounded line needs a reusable, pilot-id-specific rollup path for triage SLA, public-update SLA, and `2 Operating-Day Progression Rate`.

**Files:**

- Create: `scripts/pilot/pilot-rollup-core.ts`
- Create: `scripts/pilot/pilot-rollup-core.test.ts`
- Modify: `scripts/pilot/query_week1_totals.ts`

- [x] **Step 1: Write failing unit tests for rollup calculations**

Create `scripts/pilot/pilot-rollup-core.test.ts` with pure tests for:

- triage SLA numerator and denominator
- public-update SLA numerator and denominator
- progression numerator and denominator
- claims with missing timeline or message evidence
- zero-denominator behavior

- [x] **Step 2: Run the new test file and verify it fails**

Run:

```bash
pnpm exec vitest run scripts/pilot/pilot-rollup-core.test.ts
```

Expected: FAIL because `scripts/pilot/pilot-rollup-core.ts` does not exist yet.

- [x] **Step 3: Implement pure rollup helpers**

Create `scripts/pilot/pilot-rollup-core.ts` that exports pure functions for:

- selecting the pilot cohort from claim records
- computing triage SLA
- computing public-update SLA
- computing progression to `verification`, `evaluation`, `negotiation`, or `resolved` within `48` hours
- formatting numerator, denominator, ratio, and missing-evidence counts

- [x] **Step 4: Refactor the CLI wrapper to accept pilot-specific inputs**

Modify `scripts/pilot/query_week1_totals.ts` to accept:

```text
--pilotId <pilot-id>
--tenantId <tenant-id>
--start <YYYY-MM-DD>
--end <YYYY-MM-DD>
```

The wrapper should:

- load claim, message, and stage-history records
- call the pure helper functions
- print exact numerator and denominator values
- print progression output, not just triage and update SLA

- [x] **Step 5: Run the unit tests and verify they pass**

Run:

```bash
pnpm exec vitest run scripts/pilot/pilot-rollup-core.test.ts
```

Expected: PASS.

- [x] **Step 6: Smoke-test the CLI on the old live cohort**

Run:

```bash
pnpm exec tsx scripts/pilot/query_week1_totals.ts --pilotId pilot-ks-live-2026-03-18 --tenantId tenant_ks --start 2026-03-18 --end 2026-03-25
```

Observed locally:

- the command now runs and prints the requested metrics
- the local DB does not contain the historical March cohort, so the current local result is `0 / 0`
- this is an environment-data gap, not a script-path failure

- [ ] **Step 7: Commit**

```bash
git add scripts/pilot/pilot-rollup-core.ts scripts/pilot/pilot-rollup-core.test.ts scripts/pilot/query_week1_totals.ts
git commit -m "feat: parameterize pilot KPI rollup"
```

### Task 2: Remove Placeholder Member Pages That Would Weaken Rollout Credibility

**Owner:** `web + qa`

**Why this exists:** The member dashboard sends users to four real routes that currently render literal placeholder text. This is a Track B blocker because it weakens any claim that the broader member-facing release surface is ready for expansion.

**Files:**

- Modify: `apps/web/src/app/[locale]/(app)/member/claim-report/page.tsx`
- Modify: `apps/web/src/app/[locale]/(app)/member/green-card/page.tsx`
- Modify: `apps/web/src/app/[locale]/(app)/member/benefits/page.tsx`
- Modify: `apps/web/src/app/[locale]/(app)/member/incident-guide/page.tsx`
- Create: `apps/web/src/app/[locale]/(app)/member/claim-report/page.test.tsx`
- Create: `apps/web/src/app/[locale]/(app)/member/green-card/page.test.tsx`
- Modify: `apps/web/src/app/[locale]/(app)/member/benefits/page.test.tsx`
- Create: `apps/web/src/app/[locale]/(app)/member/incident-guide/page.test.tsx`
- Modify: `apps/web/e2e/gate/member-home-cta.spec.ts`

- [x] **Step 1: Write failing route tests for non-placeholder behavior**

Add route tests that assert:

- the page does not render `Placeholder content.`
- the page includes honest bounded content
- the page includes a primary next-step CTA to an already-proven flow

Required destination behavior:

- `/member/claim-report`: CTA to `/member/claims/new`
- `/member/green-card`: CTA to `/member/diaspora`
- `/member/benefits`: CTA to `/member/membership`
- `/member/incident-guide`: CTA to `/member/claims/new` or the support/contact route already used in the member app

- [x] **Step 2: Run the new route tests and verify they fail**

Run:

```bash
pnpm --filter @interdomestik/web test:unit --run src/app/[locale]/(app)/member/claim-report/page.test.tsx
pnpm --filter @interdomestik/web test:unit --run src/app/[locale]/(app)/member/green-card/page.test.tsx
pnpm --filter @interdomestik/web test:unit --run src/app/[locale]/(app)/member/benefits/page.test.tsx
pnpm --filter @interdomestik/web test:unit --run src/app/[locale]/(app)/member/incident-guide/page.test.tsx
```

Expected: FAIL because the pages still contain the placeholder string.

- [x] **Step 3: Replace placeholders with bounded, truthful content**

Implement minimal pages with:

- a truthful heading
- a short explanation of what the member can do now
- no claims about unavailable functionality
- a single CTA into a proven route

Do not add:

- new back-end behavior
- new routing rules
- new auth logic
- broad UI redesign

- [x] **Step 4: Harden the gate assertion**

Update `apps/web/e2e/gate/member-home-cta.spec.ts` so that each CTA destination asserts:

- route marker is visible
- placeholder text is absent
- a concrete CTA or section heading is visible

- [x] **Step 5: Run targeted tests**

Run:

```bash
pnpm --filter @interdomestik/web test:unit --run src/app/[locale]/(app)/member/claim-report/page.test.tsx src/app/[locale]/(app)/member/green-card/page.test.tsx src/app/[locale]/(app)/member/benefits/page.test.tsx src/app/[locale]/(app)/member/incident-guide/page.test.tsx
pnpm --filter @interdomestik/web test:e2e -- apps/web/e2e/gate/member-home-cta.spec.ts --project=gate-ks-sq --project=gate-mk-mk --max-failures=1
```

Observed: PASS after rebuilding the production bundle used by Playwright.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/app/[locale]/(app)/member/claim-report/page.tsx apps/web/src/app/[locale]/(app)/member/green-card/page.tsx apps/web/src/app/[locale]/(app)/member/benefits/page.tsx apps/web/src/app/[locale]/(app)/member/incident-guide/page.tsx apps/web/src/app/[locale]/(app)/member/claim-report/page.test.tsx apps/web/src/app/[locale]/(app)/member/green-card/page.test.tsx apps/web/src/app/[locale]/(app)/member/benefits/page.test.tsx apps/web/src/app/[locale]/(app)/member/incident-guide/page.test.tsx apps/web/e2e/gate/member-home-cta.spec.ts
git commit -m "fix: replace placeholder member CTA destinations"
```

### Task 3: Raise Public Legal Copy To A Minimal Localized Credibility Baseline

**Owner:** `web + legal + qa`

**Why this exists:** Privacy and cookie pages currently render hardcoded English body copy with almost no tests. Track B needs these surfaces to be truthful and localized enough for MK/KS rollout credibility.

**Files:**

- Modify: `apps/web/src/app/[locale]/(site)/legal/privacy/_core.entry.tsx`
- Modify: `apps/web/src/app/[locale]/(site)/legal/cookies/_core.entry.tsx`
- Modify: `apps/web/src/messages/en/legal.json`
- Modify: `apps/web/src/messages/mk/legal.json`
- Modify: `apps/web/src/messages/sq/legal.json`
- Modify: `apps/web/src/messages/sr/legal.json`
- Create: `apps/web/src/app/[locale]/(site)/legal/privacy/_core.entry.test.tsx`
- Create: `apps/web/src/app/[locale]/(site)/legal/cookies/_core.entry.test.tsx`
- Create: `apps/web/e2e/gate/public-legal.spec.ts`

- [x] **Step 1: Write failing unit tests for privacy and cookies localization**

Add tests that assert:

- titles come from the locale namespace
- body sections come from message keys, not hardcoded English
- the pages render route-safe, deterministic content

- [x] **Step 2: Run the legal route tests and verify they fail**

Run:

```bash
pnpm --filter @interdomestik/web test:unit --run src/app/[locale]/(site)/legal/privacy/_core.entry.test.tsx src/app/[locale]/(site)/legal/cookies/_core.entry.test.tsx
```

Expected: FAIL because the current pages hardcode body copy.

- [x] **Step 3: Move privacy and cookie body content into locale messages**

Expand each locale's `legal.json` so `privacy` and `cookies` include:

- section titles
- section body text
- only claims the product can actually support

Keep the text bounded and operational:

- no speculative legal promises
- no unsupported deletion workflow claims beyond what the current product and ops process actually do

- [x] **Step 4: Render the new localized keys**

Modify the privacy and cookies pages to use the new message keys and stop embedding English prose directly in JSX.

- [x] **Step 5: Add a public legal gate spec**

Create `apps/web/e2e/gate/public-legal.spec.ts` to verify on both gate projects:

- `/legal/privacy` loads
- `/legal/cookies` loads
- `/legal/terms` loads
- key localized headings render
- no placeholder text appears

- [x] **Step 6: Run targeted tests**

Run:

```bash
pnpm --filter @interdomestik/web test:unit --run src/app/[locale]/(site)/legal/terms/_core.entry.test.tsx src/app/[locale]/(site)/legal/privacy/_core.entry.test.tsx src/app/[locale]/(site)/legal/cookies/_core.entry.test.tsx
pnpm --filter @interdomestik/web test:e2e -- apps/web/e2e/gate/public-legal.spec.ts --project=gate-ks-sq --project=gate-mk-mk --max-failures=1
```

Observed: PASS after rebuilding the production bundle used by Playwright.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/app/[locale]/(site)/legal/privacy/_core.entry.tsx apps/web/src/app/[locale]/(site)/legal/cookies/_core.entry.tsx apps/web/src/messages/en/legal.json apps/web/src/messages/mk/legal.json apps/web/src/messages/sq/legal.json apps/web/src/messages/sr/legal.json apps/web/src/app/[locale]/(site)/legal/privacy/_core.entry.test.tsx apps/web/src/app/[locale]/(site)/legal/cookies/_core.entry.test.tsx apps/web/e2e/gate/public-legal.spec.ts
git commit -m "fix: localize public legal credibility surfaces"
```

## Chunk 2: Fresh Bounded Continuation

### Fresh-Line Scaffolding Status

- [x] Starter pack created: `docs/pilot/V1_0_0_EXPAND_READINESS_STARTER_PACK.md`
- [x] Executive review template tightened for the `v1.0.0` decision gate
- [x] Week-1 KPI / SLA rollup template created
- [x] Closeout template created
- [x] Generic live export SQL template created

### Task 4: Start A Fresh KS Expand-Readiness Pilot Line

**Owner:** `platform + admin ks`

**Files:**

- Create: `docs/pilot/PILOT_EVIDENCE_INDEX_<new-pilot-id>.md`
- Update: `docs/pilot-evidence/index.csv`

- [ ] **Step 1: Choose a fresh pilot id**

Use:

```bash
export PILOT_ID="pilot-ks-expand-readiness-<YYYY-MM-DD>"
```

Do not reuse:

- `pilot-ks-v1-0-0-2026-03-28`
- `pilot-ks-process-proof-2026-03-20`
- `pilot-ks-live-2026-03-18`

- [ ] **Step 2: Run the local authority preflight**

Run:

```bash
pnpm pilot:check
```

Expected: exit `0`.

- [ ] **Step 3: Run the fresh production gate**

Run:

```bash
pnpm release:gate:prod -- --pilotId "$PILOT_ID"
```

Expected:

- exit `0`
- one canonical `docs/release-gates/YYYY-MM-DD_production_<deployment>.md`
- one copied `docs/pilot/PILOT_EVIDENCE_INDEX_<pilot-id>.md`
- one new pointer row in `docs/pilot-evidence/index.csv`

- [ ] **Step 4: Bind the rollback target**

Run:

```bash
pnpm pilot:tag:ready -- --pilotId "$PILOT_ID" --date <YYYY-MM-DD>
```

Expected: `pilot-ready-YYYYMMDD` exists and matches the same pilot-entry artifact set.

- [ ] **Step 5: Record day 1 immediately**

Run:

```bash
pnpm pilot:evidence:record -- --pilotId "$PILOT_ID" --day 1 --date <YYYY-MM-DD> --owner "<owner>" --status green --incidentCount 0 --highestSeverity none --decision continue --bundlePath n/a
pnpm pilot:observability:record -- --pilotId "$PILOT_ID" --reference day-1 --date <YYYY-MM-DD> --owner "<owner>" --logSweepResult clear --functionalErrorCount 0 --expectedAuthDenyCount <n> --kpiCondition within-threshold --incidentCount 0 --highestSeverity none --notes n/a
pnpm pilot:decision:record -- --pilotId "$PILOT_ID" --reviewType daily --reference day-1 --date <YYYY-MM-DD> --owner "<owner>" --decision continue --observabilityRef day-1
```

Expected: the copied evidence index contains day 1, day-1 observability, and day-1 decision rows.

- [ ] **Step 6: Commit**

```bash
git add docs/pilot/PILOT_EVIDENCE_INDEX_${PILOT_ID}.md docs/pilot-evidence/index.csv docs/release-gates/*.md
git commit -m "docs: start fresh expand-readiness pilot line"
```

### Task 5: Run The Bounded Window With Daily Canonical Evidence

**Owner:** `platform + qa + admin ks + staff lead`

**Files:**

- Create: `docs/pilot/live-data/<new-pilot-id>_day-<n>_claim-timeline-export.csv`
- Create: `docs/pilot/live-data/<new-pilot-id>_day-<n>_claim-timeline-export.sql`
- Update: `docs/pilot/PILOT_EVIDENCE_INDEX_<new-pilot-id>.md`

- [ ] **Step 1: Export the daily canonical cohort snapshot**

For each operating day, create:

```text
docs/pilot/live-data/<new-pilot-id>_day-<n>_claim-timeline-export.sql
docs/pilot/live-data/<new-pilot-id>_day-<n>_claim-timeline-export.csv
```

Expected: one checked-in SQL and one checked-in CSV per operating day.

- [ ] **Step 2: Record daily evidence**

Run `pnpm pilot:evidence:record` for each day using the actual release report path and the correct incident/severity state.

- [ ] **Step 3: Record daily observability**

Run `pnpm pilot:observability:record` before the decision row each day.

- [ ] **Step 4: Record daily decision proof**

Run `pnpm pilot:decision:record` after observability each day.

- [ ] **Step 5: Compute daily risk from the canonical source**

Each day, review:

- triage SLA misses
- public-update SLA misses
- stalled post-triage claims
- Sev status age
- auth bounce or rate-limit issues affecting custody

Expected: the active daily view can explain why the pilot is `continue`, `pause`, `hotfix`, or `stop`.

- [ ] **Step 6: Stop immediately on any stop criterion**

If any of the following occurs, stop and record it:

- privacy or tenant breach
- branch leakage
- aggregate-only member leak
- unresolved Sev1
- unresolved Sev2 older than one operating day

- [ ] **Step 7: Commit daily evidence in small batches**

```bash
git add docs/pilot/PILOT_EVIDENCE_INDEX_${PILOT_ID}.md docs/pilot/live-data/${PILOT_ID}_day-*_claim-timeline-export.*
git commit -m "docs: record ${PILOT_ID} daily pilot evidence"
```

### Task 6: Re-Prove Privacy / RBAC On The Corrected Baseline

**Owner:** `qa + admin ks`

**Files:**

- Update: `docs/pilot/PILOT_EVIDENCE_INDEX_<new-pilot-id>.md`
- Reference: `docs/pilot/scenarios/PD05B-privacy-rbac-corrected-baseline.md`

- [ ] **Step 1: Run the corrected-baseline preflight**

Run:

```bash
pnpm pilot:check
```

Expected: exit `0`.

- [ ] **Step 2: Perform the short browser verification pass**

Verify:

- `/sq/member`
- `/sq/agent`
- `/sq/staff/claims`
- `/sq/admin/overview`

Expected:

- role boundaries hold
- no cross-tenant or cross-branch visibility
- no aggregate-only leak

- [ ] **Step 3: Record PD05B in observability**

Run:

```bash
pnpm pilot:observability:record -- --pilotId "$PILOT_ID" --reference day-5 --date <YYYY-MM-DD> --owner "<owner>" --logSweepResult clear --functionalErrorCount 0 --expectedAuthDenyCount <n> --kpiCondition within-threshold --incidentCount 0 --highestSeverity none --notes "PD05B green on corrected baseline"
```

Expected: the copied evidence index references `PD05B` directly.

- [ ] **Step 4: Record the matching decision row**

Run:

```bash
pnpm pilot:decision:record -- --pilotId "$PILOT_ID" --reviewType daily --reference day-5 --date <YYYY-MM-DD> --owner "<owner>" --decision continue --observabilityRef day-5
```

Expected: decision proof links back to the PD05B observability row.

- [ ] **Step 5: Commit**

```bash
git add docs/pilot/PILOT_EVIDENCE_INDEX_${PILOT_ID}.md
git commit -m "docs: record PD05B boundary proof for ${PILOT_ID}"
```

## Chunk 3: Closeout And Decision Pack

### Task 7: Produce The Week Rollup And Executive Review

**Owner:** `platform + admin ks`

**Files:**

- Create: `docs/pilot/PILOT_WEEK1_KPI_ROLLUP_<new-pilot-id>.md`
- Create: `docs/pilot/PILOT_EXEC_REVIEW_<new-pilot-id>.md`

- [ ] **Step 1: Run the parameterized rollup helper on the fresh cohort**

Run:

```bash
pnpm exec tsx scripts/pilot/query_week1_totals.ts --pilotId "$PILOT_ID" --tenantId tenant_ks --start <YYYY-MM-DD> --end <YYYY-MM-DD>
```

Expected: exact numerator and denominator outputs for:

- triage SLA
- public-update SLA
- progression
- missing-evidence counts

- [ ] **Step 2: Write the canonical week rollup**

Create `docs/pilot/PILOT_WEEK1_KPI_ROLLUP_<new-pilot-id>.md` with:

- source artifact list
- quantified triage SLA
- quantified public-update SLA
- quantified progression
- Sev age result
- evidence-custody judgment
- explicit statement on whether post-hoc repair was required

- [ ] **Step 3: Write the executive review from the canonical template**

Create `docs/pilot/PILOT_EXEC_REVIEW_<new-pilot-id>.md` and answer directly:

- narrow objective
- whether operation stayed clean without repair
- whether progression improved enough
- whether PD05B passed
- why `repeat_with_fixes` or `expand` is justified now
- exact stop date or end condition if not `expand`

- [ ] **Step 4: Reject expansion unless every expand condition is actually met**

Use `expand` only if:

- the pilot id is evidence-complete
- no Sev1 and no unresolved Sev2 older than one operating day exist
- PD05B is green
- triage and public-update SLA remain within threshold
- `2 Operating-Day Progression Rate` is no longer the known weak point
- the review explains why prior canonical `no` decisions no longer apply

- [ ] **Step 5: Commit**

```bash
git add docs/pilot/PILOT_WEEK1_KPI_ROLLUP_${PILOT_ID}.md docs/pilot/PILOT_EXEC_REVIEW_${PILOT_ID}.md
git commit -m "docs: add ${PILOT_ID} week-one rollup and executive review"
```

### Task 8: Write The Formal Closeout And Defend The Decision

**Owner:** `admin ks + platform`

**Files:**

- Create: `docs/pilot/PILOT_CLOSEOUT_<new-pilot-id>.md`

- [ ] **Step 1: Create the closeout artifact**

Write `docs/pilot/PILOT_CLOSEOUT_<new-pilot-id>.md` with:

- pilot id
- closeout date
- status
- expansion ready: `yes` or `no`
- decision posture
- canonical references to evidence index, rollup, and executive review

- [ ] **Step 2: Check the decision against the authority docs**

Verify the outcome against:

- `docs/pilot/PILOT_GO_NO_GO.md`
- `docs/pilot/V1_0_0_BOUNDED_CONTINUATION_PLAN.md`
- `docs/pilot/V1_0_0_EXECUTIVE_DECISION_GATE.md`

- [ ] **Step 3: If the answer is still not `expand`, stop cleanly**

Expected:

- decision remains bounded
- no continuation by inertia
- next action names a new explicit objective and end condition

- [ ] **Step 4: Run final verification before declaring success**

Run:

```bash
pnpm pr:verify
pnpm security:guard
pnpm e2e:gate
```

Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add docs/pilot/PILOT_CLOSEOUT_${PILOT_ID}.md
git commit -m "docs: close out ${PILOT_ID}"
```

## Exit Criteria

This plan is complete only when all of the following are true:

- a fresh KS pilot id exists
- its copied evidence index is fully populated
- PD05B is recorded and green
- the new week rollup contains exact progression evidence
- the executive review answers the expand-gate questions directly
- the closeout artifact exists
- the final decision is explicit

## Recommendation

Run this plan in two phases:

1. pre-start blocker removal
2. fresh bounded continuation on a new pilot id

Do not start the live line until Tasks 1 through 3 are complete. They are the minimum work needed to avoid repeating the current evidence and credibility gaps.
