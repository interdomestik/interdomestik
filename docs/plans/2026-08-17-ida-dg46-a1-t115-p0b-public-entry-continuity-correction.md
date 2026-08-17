---
document_id: IDA-DG46-A1-T115-P0B-PUBLIC-ENTRY-CONTINUITY-CORRECTION
date: 2026-08-17
status: corrective_candidate_pending_exact_arben_approval
authority: advisory_until_exact_hash_approval_and_docs_only_canonical_merge
parent_gate: IDA-DG46-R1
parent_gate_sha256: 2d67308c0d4781d5d9f06edcec2e25e963c8e06f50268fbd431541e863ef0565
implementation_pr: 1581
implementation_head: bcd02c968576a585209cb0538a992630b9d03957
base_main: 1505ff841c16d8fe41057a12e012bb27e359bf9c
risk_tier: 2
runtime_authorized: false
product_mutation_authorized: false
deployment_authorized: false
production_authorized: false
---

# IDA-DG46-A1 — T-115 P0B public-entry continuity correction

## Exact correction

Supersede only DG46-R1's pending-state render precedence. In UI V2, when
`authClient.useSession()` reports `{ data: null, isPending: true }`, render the
existing anonymous public Hero and Free Start intake, plus one neutral localized
non-interactive session-status skeleton. Do not emit funnel tracking or redirect
until the session resolves. When the session resolves, preserve the existing
anonymous or member behavior unchanged.

This corrects a real exact-head browser failure, not a flaky candidate. PR
`#1581` E2E run `32030795511`, job `95390208493`, attempted the required gate
three times and each time the anonymous public route never exposed
`free-start-intake-shell` because Better Auth remained pending. The existing
`different-email-recovery` proof is a canonical anonymous public-entry consumer;
blocking it makes P0B invalid. The original contract's “Hero/intake must not
render while pending” is therefore withdrawn. No timeout, cookie probe, auth
client change, route/global loading boundary, browser-test exception, retry, or
session-state inference is authorized.

## User outcome and falsifiable hypothesis

Outcome: a visitor can always begin the existing public journey while the
browser session is unresolved, without recording an identity-sensitive landing
event before resolution.

Hypothesis: the pending public-entry availability count changes from `0 → 1`
for the existing browser gate, while pending funnel-tracker calls remain `0` and
the resolved anonymous/member outputs remain byte-for-byte prop-equivalent.

`KEEP`: focused pending proof passes, the exact-head E2E public-entry consumer
passes once, no pending tracker/redirect occurs, and all required checks pass.
`REVERT`: public entry remains hidden, a pending analytics/redirect call appears,
or a resolved branch changes. `INCONCLUSIVE`: preserving public entry requires
auth/session, route, storage, browser-fixture, or fourth-writer work; stop and
select another slice. Roll back by reverting the one product commit; no data
rollback exists.

## Frozen scope

The sole implementation outcome is public-entry continuity during unresolved
null-session state. The maximum product/test writer map remains exactly:

1. `apps/web/src/app/[locale]/components/home/public-entry-session-skeleton.tsx`
2. `apps/web/src/app/[locale]/components/home/home-page-runtime.tsx`
3. `apps/web/src/app/[locale]/components/home/home-page-runtime.test.tsx`

`scripts/repo-size-budget.json` remains conditional deterministic metadata only
after staged exact product paths require it. The skeleton may be rendered with
the already-authorized public runtime, but has no controls, user/tenant/host
data, network/storage write, or session-derived content.

Forbidden: `apps/web/src/proxy.ts`, routes, pages, layouts, headers, auth or
session implementation, tenant resolution, analytics implementation, drafts,
claims, recovery, membership, billing, schema/RLS, translations/message values,
Hero copy/layout, dashboard, CI/workflows, Docker/Supabase, AI OS/Brain,
deployment and production. Do not alter the E2E spec: it remains a read-only
consumer. No second slice or P0B scope beyond this correction is promoted.

## Acceptance matrix and evidence

| State                           | Required                                         | Prohibited                                        |
| ------------------------------- | ------------------------------------------------ | ------------------------------------------------- |
| UI V2, null session, pending    | localized status plus current public Hero/intake | funnel tracking, redirect, controls inside status |
| UI V2, null session, resolved   | current anonymous output                         | new pending status or behavior                    |
| UI V2, member session, resolved | current member output                            | new public-entry behavior                         |
| UI V1                           | existing null/redirect branch                    | skeleton or routing change                        |

Before any code, amend the focused unit test RED to assert the new pending
contract: visible status, Hero/intake present with the existing anonymous props,
and zero tracker/redirect calls. Then implement the smallest root-cause fix.
Run the focused home runtime test, modularity guard, E2E contract check,
deterministic size check, security guard and one current-head GitHub Ubuntu PR
E2E. Do not rerun the failed E2E before a new head invalidates it. A single
bounded senior review must assess the current corrective diff; the earlier Opus
output is unrecoverable and cannot be counted as a verdict. Current Sol High
review remains in progress and may be used only if it produces a recoverable
current-diff verdict; otherwise use the authorized fallback route once.

## Authority boundary

This is a docs-only corrective authority. It authorizes no product mutation,
branch, active execution, Brain session, deployment or production action. After
its docs merge, prepare a new runtime receipt bound to then-current main and
this correction; the prior R1 receipt and PR #1581 head are invalidated for
merge until that separate exact-hash approval. Preserve all valid focused and
security evidence; only E2E/finalizer/current-head review proof is invalidated.
