---
plan_role: canonical_plan
status: active
source_of_truth: true
owner: platform
last_reviewed: 2026-09-16
tracker_path: docs/plans/current-tracker.md
execution_log_path: docs/plans/2026-03-03-implementation-conformance-log.md
status_command: pnpm plan:status
---

# Current Program

> Authority: This document alone defines the current repository execution phase, committed
> priority, and sequence. Detailed contracts remain in the linked content-addressed artifacts.

## Current Phase

Migration trials 1–3 and ordinary protected-PR harness adoption are complete.
PR #1761 delivered bounded delivery/finalizer repair as
`a1eaeb654109312d303f1eeb97f709f39048bf26`; PR #1762 delivered its main-push test-harness repair
as `12b22bada268dc0961d32792a553e54dea9a2bff`. T210 completed through product PR #1763: final head
`87c291f21d74c9a1dfd8d92683124c29af89f4f7`, tree
`a24e6b186f829994a693eb89fb95981e5db024e9`, and squash merge
`00794c98cc6b4d395493370552ab7b9eae525db7` matched. Protected-main CI `34703433627`, SonarCloud
Code Analysis check `103580834614`, and Sonar Main Gate `34703433721` attempt 2 passed at the exact
merge.
`T410-NOTIFICATION-ACK-CORRECTNESS` completed through protected product PR #1765. Shared shell
navigation completed through protected product PR #1770 and exact-main health as recorded below.
`T410-OPTIMISTIC-NOTIFICATION-ACK` completed through protected product PR #1771.
`T410-PESSIMISTIC-MUTATION-BOUNDARY` protected-merged through PR #1772 as
`62376c156bc0058e0491d550f261cb621eb4f02e` at 2026-09-15T05:02:15Z; exact-merge static, unit,
E2E, audit, CodeQL, gitleaks, Sonar analysis and Sonar gate checks succeeded. This closes that bounded
convention slice without claiming full T-410 completion. `MEMBER-CASE-OVERVIEW-ENTRY` completed
through PR #1775 as `55875e31b024e6ac9f4648f106be3bfea96facbd`.
`MEMBER-CASE-WORKSPACE-REDESIGN` completed through protected product PR #1776 as
`06d90f570d8757764a9fac8124ee924bd3b8aa1f`; all 13 required exact-main checks, including the
Sonar main gate, passed. `MEMBER-CASE-DETAIL-CONTINUITY` completed through protected product PR
#1777: head `2797a96f7a2af63aae75f2e284e197208e3afe2c`, squash merge
`b5a234b30b9cb6ed89ae6d81b81960a3a8135b25`, and all required exact-main checks passed. The owner
completed `MEMBER-EVIDENCE-UPLOAD-LOCALE-CONTINUITY` through protected PR #1778 as
`81a219608dacf4ee9cfd8ee9f201e8ab156e54d2`; all 13 exact-main checks passed. S1 completed
through protected PR #1780 as `f3d36b2e7781654fe5448fab11da891368d95f19`, with all 13
exact-main checks passed. S2 completed through protected PR #1781 as
`de15d4cac87d7ba6ce15d98c75069445bb84dcb4`, with all 13 exact-main checks passed.
The bounded roadmap acceptance-link amendment completed through protected PR #1782 as
`7db57a30c35112a679271e6469d20974f83dd061`. The owner has selected S3 from that exact main;
the active increment is the supported member submission → staff acceptance into verification →
member continuity prefix, not the whole S3 journey.

## Owner-adopted enterprise delivery sequence (2026-09-15)

The owner adopts this near-term sequence after the enterprise audit and Opus 5 consultation.
`MEMBER-EVIDENCE-UPLOAD-LOCALE-CONTINUITY`, S1, S2 and the acceptance-link amendment are
completed. S3 is selected from the amendment's protected merge.
Select one bounded successor at a time below. S1–S3 are roadmap labels, not replacements for
architecture T IDs. This section governs successor ordering over older suggestions.

Core M0–M5 has recorded acceptance, not proof of conformance by every app-layer consumer.
T-410 remains partial; T-411 retains its SVC-CORE/FLIGHT-03 dependencies. Unknown overlay status
proves neither completion nor absence. Preserve delivered shell, projections, timeline and contracts.
SRS v0.9 (2026-08-17 review baseline; SHA-256
`8bc2b69c9babf8f228941378a01a32340f23d3ff061f92c574a9a908472981a2`) guides requirement mapping;
repo/program/accepted ADR authority remains controlling until explicitly amended.

1. **S1 — Agent message visibility.** Reproduce internal latest-message and unread-count leakage
   through the actual query path and identify client/RLS behavior. Reuse existing visibility logic
   where bounded; preserve tenant/assignment scope, ordering and selected-claim limits. Require
   database-backed internal/public, internal-only, unread, cross-tenant and unassigned cases plus
   rendered-output exclusion. Check in-flight ownership first. Inventory sibling reads inside S1;
   do not fix unrelated hits or change general agent messaging authority. Production assessment
   runs alongside remediation and creates no implicit production access or deployment authority.
2. **S2 — Branch overview scope protection.** The selected brief must determine whether current
   contracts authorize tenant-wide branch-manager aggregates. If not, explicitly withhold metrics
   without canonical branch attribution or restrict the page under that contract. If authorized,
   preserve them and limit this slice to missing-branch failure handling and tests. Do not invent
   attribution or silently remove capabilities; an unresolved contract blocks only that decision.
   Verify actual route admission, metric content, two same-tenant branches, another tenant,
   missing branch and unchanged tenant-admin output on the real query path. Attribution-correct
   restoration follows its approved decision; no global auth rewrite.
3. **S3 — Member–staff evidence journey.** Exercise submission, staff acceptance, evidence request,
   member upload and staff acknowledgement on the existing shell. Map steps to SRS IDs and existing
   contract receipts; reuse current E2E/multi-role fixtures and the localization predecessor. Stop
   at the first unsupported handoff and select its bounded contract gap next; do not absorb it
   into this slice or claim complete end-to-end acceptance. Include continuity, contracted events,
   internal-message exclusion and unauthorized member/agent/branch paths. A representative locale
   does not replace existing four-locale coverage; branding isolation applies where exercised.

The selected S3 increment stops after the real supported path: member submission, authorized staff
transition from `submitted` to `verification`, and member-visible status/public-history continuity
with staff-private history excluded. The first reproduced unsupported handoff is IDA-CLM-010:
there is no evidence-request aggregate/command/read model with request correlation and due date, so
the generic upload path cannot prove a request-bound member upload or staff acknowledgement. S4 is
therefore a proposed conditional successor, not selected work. This increment does not claim full
S3, request-bound upload/acknowledgement, four-locale user acceptance or deployment readiness.

### Owner-adopted product-readiness roadmap (2026-09-15)

Maintain the [requirement disposition map](requirement-disposition-map.md) as the full SRS and
architecture-frontier index, not another execution queue. Update affected requirement evidence
with each slice. Unknown applicability is unresolved, never an implicit post-pilot deferral.
Pilot readiness does not close the enterprise backlog; only cited owner decisions defer scope.
Each mapped requirement separately records software, operational and business readiness, evidence
and accountable ownership. Whole-requirement completion requires all applicable dimensions satisfied;
not-applicable dimensions need a reason. Prepare operations and business acceptance alongside their
dependent slices, not only at S14; no existing approval or delivered capability is inferred missing.

The owner adopts the corrected Opus consultation as the following product-readiness sequence.
S1–S3 retain their bounded scopes; the localization predecessor is delivered. UI/UX is part of each user-facing
outcome, not a final polish phase. All role journeys use the delivered unified shell; legacy
dashboards are not the visual target. Credit #1775–#1777 and other delivered contracts before
selecting a gap. Roadmap rows are bounded outcome families, not permission for one large PR.
Split a family into the smallest useful increments at selection; preserve the family identifier.

| Order             | Outcome and required UI/UX                                                                                                                                 | Direct dependency / acceptance and cut point                                                                                                                                                                              |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| S4, conditional   | Repair the first unsupported S3 handoff, with minimal UI integration where needed.                                                                         | S3 reproduction; real contract and extended journey proof. Repeat only for an evidenced next gap; no entire domain refactor.                                                                                              |
| S5                | Member front door and first case: public guidance, situation selection, preparation, secure save/account continuity, submission and confirmation.          | Reconcile existing front-door authority and receipts first. Prove a new member reaches the correct saved case without lost input or misleading commitments; implement only missing steps.                                 |
| S6                | Member continuation and membership access: truthful status, permitted next action, evidence, messages, membership/Asistencë ID access and contextual help. | Reuse delivered workspace/detail and S3. Prove return visits, information requests and recovery from errors. Do not duplicate existing panels or invent required documents, owners, states or ETAs.                       |
| S7                | Staff handling: usable owned/unowned queue, case review, evidence request/acknowledgement and distinct internal/public communication.                      | Existing handling/assignment contracts and S1/S3 where exercised; member–staff round-trip and internal-note exclusion. New reassignment or lifecycle rules are separate contract gaps.                                    |
| S8                | Agent clients and bounded handoff: permitted case depth, clear recipient and transfer acknowledgement.                                                     | S1 and established assignment/visibility/handoff contracts. Test assigned/unassigned and cross-tenant paths. Only a genuine unresolved authority change waits for business disposition.                                   |
| S9                | Agent-assisted member activation: offer/invite, onboarding and first-case continuity.                                                                      | Existing attribution, membership and Paddle contracts plus S8 only where reused. Prove attribution preservation and member ownership; exclude campaigns and new payment providers.                                        |
| S10               | Branch-manager oversight: scoped queue, permitted actions/escalations and attributable metrics.                                                            | S2 and reused handling contracts. Two-branch/missing-branch/admin baselines. Preserve authorized aggregates; attribution decisions block only affected metric restoration, not the whole journey.                         |
| S11               | Tenant-admin operations: people, branch assignment, settings and access lifecycle on the unified shell.                                                    | Existing tenant/auth contracts. Split invite/first-login and deactivation/revocation into bounded increments if needed; prove correct scope and the contracted revocation behavior. No custom-role/auth rewrite.          |
| S12               | Platform-admin operations: tenant onboarding, technical support and platform controls distinct from tenant business authority.                             | Verify the existing platform contract and only reused S11 dependencies. Prove permitted technical actions and forbidden business/cross-tenant actions; no implicit impersonation or privilege expansion.                  |
| H1, priority lane | First unmet SVC-CORE clause, then SVC-06 Help Now: clear urgent entry, approved guidance, fallback and human-contact path.                                 | Retain business priority as soon as direct dependencies and country/content/stop rules permit. Split core gaps from entry UI; prove approved-country and stop-rule behavior. No invented dispatch, representation or ETA. |
| S13               | Member/staff outcome and closure: understandable decision, permitted follow-up and contracted recovery/payment information.                                | Verify closure/recovery receipts and pilot scope; implement only gaps. Prove authorized transitions and truthful financial display, not new settlement mechanics.                                                         |
| S14               | Whole-pilot rehearsal and readiness disposition across all in-scope roles.                                                                                 | Delivered journey receipts, representative-user task results and operational proof below. No deployment implied.                                                                                                          |

After S3, use this default ordering, advancing a ready independent outcome when a direct dependency
is blocked and recording why in the tracker. H1 retains its priority lane; it is not postponed by
table position. UI preparation may run in parallel with disjoint ownership; shared files and heavy
verification remain coordinated. Flight/T-411/SVC-DASH/CQRS retain their architecture dependencies,
not blanket prerequisite status. No completion is inferred from a row, a mockup or a helper proposal.

At selection, map only that outcome's SRS/architecture requirements to existing implementation,
mounted UI and delivery receipts. Record implemented, verified, user-validated or missing separately.
Each UI brief states the task, screen/interaction change, direct contracts, forbidden scope and
acceptance, including keyboard/focus, mobile reflow, loading/error/empty/retry and truthful copy.
Preserve existing EN/SQ/MK/SR coverage; pilot cohort choices do not silently narrow locale contracts.

#### Acceptance links adopted on 2026-09-16

The whole-source reconciliation confirms 510 numbered clauses, including acceptance/attributes,
and retains supplementary controls. It establishes traceability, not whole-requirement completion.
Use the [requirement map](requirement-disposition-map.md#acceptance-links-for-existing-outcomes)
at each existing family selection. The audit's 43 groupings are not a new slice queue; its 468
unresolved requirements are neither mandatory pilot work nor approved post-pilot deferrals.
S3 and conditional S4 retain their exact cut points above; later diaspora/service gaps never
expand them. Credit the delivered shell, member surfaces, S1/S2, Trip Mode and service contracts.

| Existing destination                      | Acceptance to reconcile before its dependent outcome                                                                                                                                                                                                                                                                                                                                       |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| S5/S6 preparation; H1 guidance            | DIA-001–008: corridor/context, signed/current packs, integrity/expiry and full retry/recovery states. DIA-009–012: reviewed police/EAS/emergency guidance; DIA-010 applies to both Trip Mode and H1. DIA-019: preserve EN/SQ/MK/SR and reconcile historical scoped German authority before affected language acceptance, not a universal fifth locale.                                     |
| Later S5/S7 handoff; conditional recovery | DIA-013–015: validated facts, consent/authority recheck and receiver acknowledgement, reusing S3/S4 contracts without enlarging them. DIA-016/018: cross-border legal/entity/partner approval before professional action or marketing promises, including S5/S6 copy. DIA-017 remains conditional under OD-18; DIA-020 requires minimized analytics.                                       |
| H1 and individually selected services     | Preserve each SVC-01–10 row and direct edges in the architecture tracker; H1 covers the first unmet core clause and SVC-06, not all services. The map links each service's distinct acceptance. VONESA remains separate with FLIGHT/T-411/CQRS dependencies; no blanket flight prerequisite.                                                                                               |
| S6/S9 membership; S8/S9 CRM               | First prove existing active/grace membership and Asistencë ID access; reconcile lifecycle exceptions separately. S9 proves assisted offer/Paddle activation and attribution, not a prerequisite for S6 access. CRM acceptance includes consent/provenance, dedup, suppression/retention and accepted/rejected/timed-out handoff; campaigns remain excluded from S9.                        |
| S7 handling; S13 closure                  | Separate insurer dispatch/ack/failure, objection and task/deadline exceptions from the first evidence round-trip. Prepare finance reconciliation and privacy revocation/DSR/hold outputs before dependent promises. Recovery/partner/mandate/cost authority precedes professional action; S13 remains truthful outcome/display, not new settlement mechanics or a predecessor to recovery. |
| S10–S12 role journeys; each consumer/S14  | Exercise branch scope, purpose-bound support, read-only audit and independent business approval only where applicable; reuse canonical roles, not new job-title runtime roles. Attach SEC/NFR/OPS, BR/SOD, KPI/interface/AI/import acceptance to selected consumers. CI alone does not satisfy business/operating acceptance.                                                              |

Locate accepted operating outputs first: country/content reviewer, dated sources and expiry;
receiving queue/calendar/escalation; qualified partner and mandate/cost approval; financial
reconciliation/statutory responsibility; processor/retention/DSR evidence; support/incident/restore
rehearsal and representative-user/accessibility/language results. Prepare them alongside software,
before the first dependent promise; S14 assembles their scoped evidence. Missing references are
not proof of absent outputs or unassigned owners. The chief prepares evidence; accountable owners
accept their outputs. Reuse all 29 approved OD policies in the owner-held SRS decision register (see the map
baseline/source reference), including MK→KS→AL; gift/sponsor stays dark under OD-18 controls.

**Unresolved owner choices, only where not already settled:** additional pilot services/corridors/
cohorts; inclusion of professional recovery, VONESA, gift/sponsor, broader CRM campaigns, new
interfaces, AI purposes or legacy-data import. Resolve only the choice affecting the next consumer,
not the whole enterprise backlog. Resolve an actual SRS/ADR or scoped-language conflict only after
checking accepted authority. These links adopt no new capability, pilot inclusion or deferral.

#### Pilot acceptance, not merely CI acceptance

- Confirm existing decisions before reopening any: countries, services, cohort and roles,
  membership/billing/recovery scope, support hours, and release/rollback ownership. The chief records
  unresolved decisions with the product owner or named delegate and the first dependent slice;
  no new sign-off ceremony is imposed for already accepted decisions.
- Every in-scope role completes its core tasks and cross-role handoffs on the redesigned shell.
  Run small representative-user rounds alongside relevant increments and a final rehearsal;
  include disabled users and staff exception/support scenarios. Record failures and corrections;
  automated browser success is not user validation. No task-blocking issue remains at pilot admission.
- Assess applicable WCAG 2.2 A/AA criteria across complete pilot processes, with manual keyboard,
  screen-reader and responsive checks as well as automation. Track criterion-level results;
  a spot check or absence of severe findings does not establish AA conformance. Resolve applicable
  failures before claiming conformance and state any narrower assessment honestly.
- Validate all four locale journeys and obtain appropriate language review of critical copy.
  Show only contract-backed status, ownership and next action; out-of-scope capabilities must not
  appear as working promises or bypass server-side authorization.
- Required tenant/branch/role/privacy, data integrity, security and delivery checks remain mandatory.
  Support ownership, monitoring/alerts, incident handling and rollback must have usable evidence.
  Reuse existing legal/data-protection/billing and release evidence where valid; resolve actual gaps.
- S14 records readiness or concrete unmet criteria. Controlled pilot release needs separate explicit
  deployment authorization. Merged, deployed and user-accepted remain distinct states.

#### Research applied to this roadmap

Reuse the primary sources checked on 2026-09-15: [AirHelp's public claim guide](https://www.airhelp.com/en/blog/how-to-use-airhelp-to-claim-flight-compensation/)
supports guided intake and stable claim references; [Allianz's public help page](https://www.allianztravelinsurance.com/travel/insurance-101/how-our-website-can-help.htm)
supports status and missing-document clarity; [ADAC's assistance description](https://www.adac.de/services/pannenhilfe/was-ist-pannenhilfe-online/)
supports location fallback and assistance continuity. These are public descriptions, not measured
usability improvements or inspected private portals. The unsupported Allianz no-save claim is not
adopted. Use original design and existing domain semantics, not competitor branding or fee models.
[W3C conformance requirements](https://www.w3.org/TR/WCAG22/#conformance-reqs) and
[GOV.UK research planning](https://www.gov.uk/service-manual/user-research/plan-user-research-for-your-service)
inform complete-process accessibility and small iterative user rounds. Refresh relevant evidence
at slice design only when needed. Verified fm, Safari/Simulator and profiling tools are optional
measured aids, not new infrastructure, production AI or prerequisites.

The chief prepares evidence; the product owner decides business policy or names a delegate.
Record the accountable person and needed-by slice in the tracker for branch attribution, agent
authority/SRS-ADR conflicts and country/content/stop-rule approval. A blocked decision blocks only
its dependents; record why a ready independent outcome advances. Check only direct predecessors;
T-410 disposition, T-115/OD17 reconciliation, stale SVC-CORE-b and unrelated inventory are not
prerequisites for S1–S3. Material scope/authority changes remain subject to explicit disposition.

Use the existing model/helper and review policy. Every slice must satisfy `pnpm pr:verify` (including
full E2E), `pnpm security:guard`, capacity and protected-delivery requirements. Reuse prior gate
evidence only where repository contracts permit and source, relevant configuration and environment
identity remain valid; being the same PR is not sufficient. Do not duplicate E2E already validly
covered by `pr:verify`, and never treat unrelated or invalidated proof as satisfying a required gate.
Update canonical evidence with ordinary delivery, verify exact-main health, then retire the clean
worktree and start the next implementation fresh. Preserve dirty/unmerged work until reconciled.
No routine promotion/closeout PR or tooling project is added. Merged is not deployed or user-accepted.
Reuse the 2026-09-15 DORA small-batch/AI and GOV.UK whole-journey research; measured local tools
are supplemental, not another prerequisite. This is sequencing authority, not completion evidence.

## Completed S2 — Branch Overview Scope Protection

S2 completed through #1781 at `de15d4cac87d7ba6ce15d98c75069445bb84dcb4`; all 13
exact-main checks passed. The retained brief below describes the delivered bounded scope,
not an active selection. It was medium complexity with a
security-sensitive authorization edge, Sol/high, from protected main
`f3d36b2e7781654fe5448fab11da891368d95f19`. The mounted unified-shell route is
`/[locale]/admin/overview`; proxy admission remains unchanged and `apps/web/src/proxy.ts` is
read-only. Accepted ADR-09 and shared-auth scope define `branch_manager` as branch-scoped, so the
tenant-wide overview is not an authorized branch-manager capability. Assigned branch managers
redirect to their canonical branch detail, while missing assignments fail closed; `admin`,
`super_admin` and `tenant_admin` retain the tenant-wide overview.

The actual branch-detail query already scopes its branch, pipeline, counts, staff and cash metrics
by tenant and branch. Its per-agent open/SLA subqueries omitted the branch predicate, allowing
same-tenant sibling-branch claims attributed to the same agent to contaminate the branch view.
Add the explicit branch predicate while preserving tenant equality and the existing metric
definitions. Verify the mounted route and real database query in KS/MK with two same-tenant
branches, a foreign tenant, missing branch, the complete metric list and unchanged tenant-admin
output. The local runtime role may bypass RLS, so explicit query predicates remain required.

Sonnet 5 and Gemini preparation were served through the repository-owned reviewer routes as
`claude-sonnet-5` and `gemini-3.1-pro-preview`; their initial empty-diff verdicts are retained as
preparation, not passing implementation review. The changed-diff Sonnet follow-up reported focused
guard/evidence gaps; equivalent page/query unit coverage was added and the existing route helper
plus admitted E2E tree were confirmed. Gemini's changed-diff route timed out without output, so its
failed receipt is retained without repetition. The one required final Opus review was served as
`claude-opus-5` and reported findings. Accepted corrections add overview-reader role defense,
telemetry for branch-detail scope denial, and a fixture-owned synthetic foreign tenant. The proposed
extra cash/query tests are covered by existing cash predicate unit proof and the mounted real-query
regression; comment removal keeps the touched legacy source below its original size and within the
executable modularity policy.

At product head `b3fa63e46be0754762f12d1a8678b716f4f6616a`, focused unit proof passes
19/19, web type-check passes, and the exact production-build KS/MK Playwright lane passes 2/2
against isolated `interdomestik_ci_s2_d02f`; failure- and success-path fixture residue checks are
zero. Exact capacity registration is 21,166 product/test bytes: 873 source bytes and 20,293 test/E2E
bytes across seven existing paths and five new files. The fixed-baseline evaluator grows 630 bytes,
the capacity budget self-size grows 2,293 bytes, file growth is five, and reserve plus unrelated
allocations remain unchanged. Admitted E2E tree
`354b38ebe3d79b06b994103aa63dc21baf2f5294` passes its contract guard. A full required run and
separate security guard passed on the immediate pre-review-correction product candidate. Renewed
uninterrupted `pnpm pr:verify` passed on evidence head
`81c87bdcdc5cf0a5019bfb06ced8917d3ba6f7aa` (tree
`60405a4a2922b838adae5660cabd1fff2b2f8ec1`): 1,186 CI contracts, 154 release tests, 41 RLS
tests, 3,412 web tests/12 skips, 81.11% repository line coverage, 262 browser passes/12 skips and
13 smoke passes/11 skips. Separate `pnpm security:guard` passed. Full-log SHA-256 is
`60150d194b16f79da7039ad3e251e4cb70f878bb491004b135a2de42a2c35f3e`; security-log SHA-256 is
`7865d7a498a8435749920e68875ab522a958f36ddf012b94385eb88cb284bea1`. Protected delivery and
exact-main health subsequently passed through #1781 as recorded above.

The currently mounted branch dashboard presentation is legacy and is not the visual target. S2
makes no styling, information-architecture, shell-redesign, deployment or user-acceptance claim;
a current-trends redesign remains a separate bounded product slice and must preserve these scope
contracts.

## Completed S1 — Agent Message Visibility

`S1-AGENT-MESSAGE-VISIBILITY` completed through protected PR #1780: head
`9dc383ad` and squash merge `f3d36b2e7781654fe5448fab11da891368d95f19`, with all 13
required exact-main checks passed. It was high complexity, Astra/high. Scope was the
agent workspace's latest-message and unread-count reads plus database-backed and rendered
regressions. Preserve active agent-client assignment, tenant/branch scope, selected-claim
retention, the 100-row cap, ordering and DTO shape. No general agent messaging authority,
proxy/auth/routing/schema refactor, dashboard redesign or deployment is selected.

The actual core reproduced internal-only content/count leakage. Local runtime `db` aliases
`dbRls`, but its configured fallback role is BYPASSRLS; the tenant-only message policy does
not encode internal-message visibility. Reuse the established conversation reader's
`isInternal = false` semantics and exact tenant equality through one local predicate for both reads.
`NULL` visibility remains excluded, matching that reader. Source inventory identifies separate
legacy/V2 unread readers; they are recorded, not expanded into S1.

Research checked 2026-09-15: installed Drizzle 0.45.2 and local PostgreSQL 15.8.
[PostgreSQL RLS](https://www.postgresql.org/docs/15/ddl-rowsecurity.html) explains that BYPASSRLS
roles bypass policies; [Drizzle select](https://orm.drizzle.team/docs/select) documents filters
and PostgreSQL distinct-on ordering. Adopt explicit public/tenant predicates before count or
latest-row selection; reject reliance on a client alias as proof of RLS. Verify actual role,
policies, both tenant fixtures and rendered exclusion. No production posture is inferred.

Renewed full `pnpm pr:verify` and separate `pnpm security:guard` passed at `94ac9167`.
Dedicated fixture agents/branches and a deterministic CRM test agent resolve the hosted
cross-project and sibling-consumer findings. Protected delivery and exact-main health passed for
PR #1780. No deployment or broader agent messaging authority is claimed.

## Completed Member Evidence Upload Locale Continuity

`MEMBER-EVIDENCE-UPLOAD-LOCALE-CONTINUITY` completed through protected PR #1778 as
`81a219608dacf4ee9cfd8ee9f201e8ab156e54d2`, with all 13 exact-main checks passed. It was medium
complexity, Sol/high: localize the established member `ClaimEvidenceUploadDialog` wrapper and prove
it on the mounted claim-detail header/evidence and documents surfaces. The shared upload component,
direct/signed transport, MIME handling, claim/category mapping, optional AI-extraction consent,
reset/focus behavior and raw provider/server errors remain authoritative and unchanged. No backend
taxonomy, auth/proxy/tenant/RLS, schema/database/storage/API, billing, routing, dependency or shared
admin-consumer expansion is selected.

The candidate adds exact EN/SQ/MK/SR wrapper catalogs and active-locale payload wiring. Four-locale
unit contracts cover exact copy/no English fallback, consent false/true/reset, file-change and reopen
reset, direct/signed payloads, pending/cancel/failure/success, raw error passthrough and focus return.
The deterministic mounted lane passes 8/8 across SQ/EN and MK/SR with both detail triggers and the
documents trigger, keyboard activation, 320px/desktop layout, long copy, actual dark mode, reduced
motion and blocked upload traffic. The exact admitted E2E tree is
`469d483c0727f755a5dd27eb02f54192c484ebf6`; its fail-closed resolver passes 12/12. Sonnet 5 and
Gemini supplied bounded implementation/test counterexamples; accepted corrections include canonical
category/error assertions and extraction-specific MK consent. Fresh independent Astra/high review
found no actionable issue and independently passed the focused contract/capacity checks. Final full
proof, protected review, merge and exact-main health passed for #1778. No deployment is claimed.

## Completed Member Case Detail Continuity

`MEMBER-CASE-DETAIL-CONTINUITY` completed through protected product PR #1777 as
`b5a234b30b9cb6ed89ae6d81b81960a3a8135b25`. It was medium complexity, Sol/high: presentation
and native navigation across the already mounted
`MemberClaimDetailOpsPage`, four locale catalogs and focused UI/browser contracts. The risk drivers
are coupled information hierarchy, localization, focus/reflow behavior and exact existing-content
contracts; no auth/session, tenant/RLS, route, query, schema, document-lifecycle, billing or other
high-risk boundary was selected. Fresh independent Astra/high review followed the required Sonnet 5
design/implementation and Gemini counterexample/test contributions before final proof.

The delivered slice implements the localized identity header and native section anchors on
the mounted detail page without changing routing, authorization, tenancy, data or shared-panel
contracts. Focused component proof passes 8/8; the isolated seed contract passes 8/8; and the
corrected deterministic continuity gate passes 4/4 across SQ/EN and MK/SR, including keyboard,
reflow, enlarged text, dark and reduced-motion behavior. The conditional golden passes 4/4 while
reporting no seeded detail link, so the isolated gate remains the authoritative mounted proof. The
exact admitted E2E tree is `5674d194c0a301beecdb98c1c81c96b7d9ffe5d5`. The executable modularity
guard passes after compacting the focused Ops test to 281 lines and assigning only the four
`claims.json` catalogs the owner-approved `member-case-detail-continuity-contract`; no threshold,
exception or capacity was widened. Protected review, final proof, merge and exact-main health passed;
no deployment or claimant usability validation is claimed.

The approved confidence-first design continues the case-first member workspace into one coherent
detail experience. It adds a clear localized return to `/member`, strong case identity, and native
in-page links to existing progress, evidence, public history and member messaging. Progress remains
distinct from the existing Case Companion next step. Existing SLA, trust, recovery, matter
allowance, case description, consent, upload, ordered public timeline and external-only messaging
remain visible and semantically unchanged. The mounted page remains authoritative; the V2 variant
is not activated.

### Detail continuity acceptance

- Use native locale-aware links and hash targets; add no tab state, navigation engine, client
  dependency, invented milestone, ETA, required document, handler or outcome.
- Preserve exact case identity, status, dates, public timeline order, legal/disclaimer meaning,
  membership/SLA/recovery data, conditional actions, consent/upload contracts, focus behavior and
  `allowInternal={false}` messaging.
- Keep solid reading surfaces with restrained Crystal depth around identity/navigation. Do not copy
  operator branding or expand this into a portal or membership-pricing redesign.
- Localize the return and section navigation in SQ/MK/EN/SR. Verify descriptive link purpose,
  keyboard operation and visible focus, 320/390/768/1440 reflow, enlarged text, dark mode and
  reduced motion.
- Map any changed label, order or exact copy to affected unit, gate, golden and smoke assertions;
  reconcile the browser-corpus fingerprint only through focused resolver contracts.

### Detail-specific research and decisions

Checked 2026-09-15. AirHelp's public contact page exposes claim status through one customer area and
asks members to use their claim reference when contacting support; Allianz's public Claim Centre
combines online submit/track with a human-support fallback. Adopt recognizable case identity,
progress and contextual support; reject their branding, policy taxonomy and any unverified portal
behavior. W3C's WCAG 2.2 bypass-blocks guidance names links to page areas, landmarks and headings as
ways to help keyboard and assistive-technology users reach content efficiently; adopt a labelled
native section list and structural targets without claiming full conformance. The installed Next.js
16.3.3 Link contract retains anchor semantics and hash navigation; use it without a new client state
layer. The still-applicable #1776 Apple/Google/WCAG brief supports readable hierarchy, selective
emphasis, solid content surfaces, reflow and visible focus. Expected benefit: members can orient to
the correct case, distinguish state from action, and reach evidence, history or a human conversation
without hunting through the complete page. Test that behavior directly; no usability uplift is yet
claimed.

## Completed Member Case Workspace Redesign

`MEMBER-CASE-WORKSPACE-REDESIGN` completed the new member arrival and case-continuation experience
within the mounted unified shell. Initial journey/design reconciliation was high complexity,
Astra/high; execution was medium complexity, Sol/high, across three existing presentation
components over established contracts. Protected product PR #1776 merged as
`06d90f570d8757764a9fac8124ee924bd3b8aa1f`; all 13 required exact-main checks passed.

The complete intended journey is public guidance and situation selection → anonymous preparation →
secure save/account continuity → member arrival → evidence, case progress and support → explicitly
agreed recovery where applicable. The entry tree in
[the original front-door authority](./2026-08-17-ida-t115-p0a-canonical-front-door-dg45.md),
[mobile journey input](../product/mobile-experience-blueprint-part-2.md), T-116 summaries,
T-117 shell and T210 detail timeline were reconciled with the mounted screens. The mobile blueprint
is design input, not authority for its example ETAs, handler assignments, offline packs or collapsed
case prioritization. The original case-first intent is adopted; unsupported behavior is excluded.

### First experience and interaction acceptance

- A generous workspace heading and calm, original Crystal-compatible presentation lead into a
  dominant case column and a narrower supporting column. Keep the existing unified navigation.
- Every represented case stays in source order and visibly exposes its reference, truthful status,
  existing next-step text, document count and one clear localized detail link. Missing/blank references
  keep distinct numbered fallbacks. No task engine, new priority ranking or inferred missing files.
- Preserve Case → Actions → Timeline reading order, the parallel slots and their independent loading,
  error and empty states. A failed case region must not withhold an available membership action.
- Preparation and membership use the unchanged lifecycle-dependent destinations and warnings.
  Help Now remains a recognizable existing link, separate from asynchronous case continuation.
- The overview date rows represent incident dates and current status, so label them as case dates
  and status. They are not the detailed T210 history and must not imply last-update timestamps.
- Preserve the visible disclaimer before the regions while reducing its visual dominance. Use clear
  section-specific loading/error/empty copy in SQ/MK/EN/SR without new outcome or timing promises.
- Verify native keyboard/focus, at least 44px primary targets, long translations/references,
  320/390/768/1440 CSS-pixel reflow, enlarged text, dark mode and reduced motion. Keep readiness
  markers, canonical routes, exact case mapping and existing protected detail destinations.

The in-task design checkpoint was presented before product edits on 2026-09-15. It is a synthetic
preview of the new hierarchy; current mounted screens are behavioral evidence, not a visual lock.
This slice did not claim completion of the full member journey or select T411/SVC-CORE/Help Now.
Proxy, auth/tenant/RLS, queries, schema/database, claim/money/legal writers, Paddle and deployment
remained outside scope. The owner subsequently selected `MEMBER-CASE-DETAIL-CONTINUITY` above.

### Dated research and concrete decisions

Checked 2026-09-15; operator evidence below is public description unless explicitly noted. No
competitor authenticated portal or user study was inspected, and no usability improvement is yet
measured. Installed stack: Next.js 16.3.3, React 19.2.8, next-intl 4.13.4 and Tailwind 3.4.19.

| Primary source                                                                                                                                                                                                                                               | Evidence and decision                                                                                                                                                                                                                                                                                          | Member need and testable benefit                                                                                                      |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| [AirHelp contact and tracking](https://www.airhelp.com/en/contact-us/)                                                                                                                                                                                       | Public tracking description and variable wait explanation. Adopt recognizable case continuation and honest state; reject promised ETAs/outcomes and copied trade dress.                                                                                                                                        | Member can identify and open the matching case; assert exact links and existing status text.                                          |
| [Allianz Claim Centre](https://www.allianz-assistance.co.uk/help-and-advice/claim-centre.html)                                                                                                                                                               | Public submit/track and support description. The linked [portal entry](https://allianz-protection.com/homepage) was inspected in Playwright: policy-type choice before access. Deeper flow was not inspected after locator timeouts. Adopt clear start/continue distinction; reject unrelated policy taxonomy. | Existing case work remains visually primary while membership/preparation remains reachable. Validate both populated and empty states. |
| [ADAC assistance](https://www.adac.de/services/pannenhilfe/)                                                                                                                                                                                                 | Public urgent-assistance entry and contact alternatives. Keep urgent guidance distinct; reject dispatch, location and arrival-time promises unsupported by Interdomestik data.                                                                                                                                 | Members can distinguish Help Now from case work; check distinct native destinations.                                                  |
| [Apple mobile design](https://developer.apple.com/design/tips/) and [layout](https://developer.apple.com/design/human-interface-guidelines/layout)                                                                                                           | Official mobile guidance supports readable hierarchy, contextual controls and adaptable layout. The HIG page required JavaScript; indexed official text and the public tips page supply the bounded guidance. Adopt generous targets and stacking; reject desktop-only density and decorative motion.          | Check narrow screens, text enlargement and keyboard visibility; Safari/Simulator supplement Playwright proof.                         |
| [WCAG reflow](https://www.w3.org/WAI/WCAG22/Understanding/reflow.html), [target size](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html), [focus visibility](https://www.w3.org/WAI/WCAG22/Understanding/focus-not-obscured-minimum.html) | Standards guidance: 320 CSS-pixel reflow, AA 24px target minimum with exceptions, unobscured focus. Choose 44px controls as a design target; do not claim full conformance from component tests.                                                                                                               | Measure overflow/target bounds and keyboard focus in actual browser.                                                                  |
| [Next.js parallel slots](https://nextjs.org/docs/app/api-reference/file-conventions/parallel-routes)                                                                                                                                                         | Context7 official-source guidance and installed package docs confirm independent loading/error streaming and named slot props. Preserve the existing layout and promise boundaries.                                                                                                                            | Slow/rejected case data cannot serialize or remove the other regions.                                                                 |

### Visual trends and performance acceptance

Additional owner-requested trend research checked 2026-09-15:
[Apple WWDC26 design guidance](https://developer.apple.com/wwdc26/guides/design/) emphasizes
readability, consistency and adaptation; [Apple materials guidance](https://developer.apple.com/design/human-interface-guidelines/materials)
keeps Liquid Glass in the navigation/control layer rather than reading content. Adopt restrained
depth and solid case surfaces within the existing shell; do not add per-card glass effects.
[Google expressive-design research](https://design.google/library/expressive-material-design-google-research)
supports emphasis through size, color and grouping; adopt a clear case action and next-step hierarchy,
without transferring its study results to this untested member population.
[Adobe's April 2026 palette guidance](https://www.adobe.com/express/learn/blog/what-trending-color-palettes-mean)
supports selective accents within a stable palette. Keep existing brand and semantic tokens across
light/dark states; no independent trend palette or token-definition change is selected.

Performance is part of acceptance: inspect client JavaScript/dependency growth, font/image requests,
layout stability and rendering cost, then measure the production build where available. The current
source adds no imports, client hooks, queries, dependencies, image/font assets or animation library;
it removes the outer case-region glass panel. These are source observations, not measured speed gains.
Production timing and layout-shift evidence remain pending; development timings are not a baseline.

### Completed Member Case Overview Entry

`MEMBER-CASE-OVERVIEW-ENTRY` is a medium-complexity Sol/high presentation integration over the
mounted T-116 case-summary registry and T-117/T-118 unified portal shell. It gives each already
authorized represented case one clear, localized, keyboard-accessible entry to its matching existing
`/member/claims/[id]` detail route. It does not activate T-411 Smart Next Step, add a query, change
visibility, prioritize cases, or introduce new state, entitlement, ETA, status or event semantics.

Acceptance requires exact per-case route mapping for multiple cases; a unique numbered display and
link fallback when a reference is absent; descriptive SQ/MK/EN/SR link copy; one link and no nested
interactive control per card; visible focus; usable 320 CSS-pixel reflow; and unchanged loading,
error, empty, disclaimer, streaming, status, next-step and document-count behavior. Proxy/routes,
auth/tenant/RLS, DB/schema, billing, money/legal writers and deployment remain excluded.

Research was checked or reused on 2026-09-15. AirHelp's public claim guide describes a unique claim
ID and online status tracking; Allianz Assistance's public Claim Centre describes online tracking
with a human-support fallback. These are public descriptions, not authenticated usability audits.
WCAG 2.2 guidance for
[link purpose](https://www.w3.org/WAI/WCAG22/Understanding/link-purpose-in-context.html),
[visible focus](https://www.w3.org/WAI/WCAG22/Understanding/focus-visible.html), and
[reflow](https://www.w3.org/WAI/WCAG22/Understanding/reflow.html) supports descriptive link names,
persistent focus indication and one-direction reading at 320 CSS pixels. The installed stack is
Next.js 16.3.3, React 19.2.8 and next-intl 4.13.4; the current
[Next Link reference](https://nextjs.org/docs/app/api-reference/components/link) retains anchor
semantics and client navigation. Adopt recognizable reference, truthful status/next action,
explicit case entry, visible focus and wrapping cards; reject invented times/outcomes, copied trade
dress, marketing claims as usability proof, and any generic task framework. Test with focused
component/context contracts, all four locale catalogs, existing route/browser gates, keyboard focus,
mobile/desktop screenshots and 320-pixel reflow.

## Delivered History

`IDA-LA01-LEAN-AUTHORITY-BOOTSTRAP` completed in PR `#1629`: approved head
`2845d36523f9f4f186f595336d9b3cd0d5158b00`, tree `3657eac816f4ce16678b68f74fff2f5a1a389593`,
and squash `9f35b2eaf4904f8c0a02542632b51a92f8df4d3e` matched. Nine checks, 12/12 threads,
zero-issue Sonar, and main were green; CD `32860119345` stopped pre-build with zero effects.

`IDA-UI07-MINIMAL-ENTRY-DOOR-CUTOVER` completed in PR `#1634`: approved head
`6d7430b53dae921c2835e2729a322aece326812b`, tree
`fe087d45535aca6797ecd83172d90ba8a730442d`, and squash merge
`92abb4ba4f7db614840357ebb5ad4dc99b9ee21e` matched the frozen base/tree. The public entry door is
now Header, HomePageRuntime (canonical Hero V2, Free Start, and preserved session/analytics),
PricingSection, then Footer. Eight legacy sections are reversibly unmounted; their files and E2E
contracts remain unchanged. Nine required checks, the broad E2E gate, pilot gate, Sonar, focused
unit/browser evidence, and exact-main identity were green.

`T-118-CRYSTAL-PRIMITIVES` completed through promotion `#1637` and product `#1638`. Head
`449832314edad1706fc31d9688c13c5cdc302fe2`, tree
`26f300fedc342b477c1bd1ad79a17611f950d26c`, and squash
`79defe7af8d22dc26d78f4845a321f8906720794` matched the ten-path allocation. The presentational
primitives remain unmounted; exact proof and main were green. `#1636` remains the capacity proof.

`T-117A-UNIFIED-PORTAL-SHELL` completed through promotion `#1641` and product `#1642`, using its
[gate](./2026-08-27-t117a-unified-portal-shell-design-gate.md),
[admission](./2026-08-27-t117a-unified-portal-shell-admission.json), and allocation. Head
`86b9609d388b6dcab597cf7f6a6ebddd2fa00be7`, tree
`5bd0aa814a48aa722e1760f9c2f0cc4602a28ae7`, and squash
`a99d30903e1a6a36fad811992349384db05331a8` matched. The accessible presentational shell remains
unmounted; exact proof and main were green. `#1640` remains the capacity proof.

`T-116-CASE-SUMMARY` completed through promotion `#1646` and product `#1647`, using its
[gate](./2026-08-27-t116-case-summary-design-gate.md),
[admission](./2026-08-27-t116-case-summary-admission.json), and allocation. Head
`860c240e48024f2757d633589148d945e02595b4`, tree
`ff1077ee9be1f4ce399919fcdb42882469e3038d`, and squash
`cde8af2c95915b0d6aa7555bb26b94249edbdfaf` matched. Its tenant read projection and pure renderer
remain unmounted; exact proof and main were green. `#1644` and `#1645` remain prerequisite proofs.

`T117B-DATA` completed through re-promotion `#1661` and product `#1658`, using its
[gate](./2026-08-28-t117b-data-design-gate.md),
[admission](./2026-08-28-t117b-data-admission.json), and allocation. Head
`b9e735535ae812c0824ecb7e7a874fe78e78303d`, tree
`728768ab05bc47a0f1cb25ec78ed6a6444264ffc`, and squash
`124ec51cefd022dd7103a4f958cb9ebef5427dad` matched. Request identity, two projections, exact-head
proof, and protected main were green.

`T117B-PORTAL` completed through promotion `#1665` and product `#1666`, using its
[gate](./2026-08-28-t117b-portal-design-gate.md), eleven-path
[admission](./2026-08-28-t117b-portal-admission.json), and allocation. Product head
`2ad7708bf5b694a392e7d41e13f7e98fb2fcc5a2`, tree
`368ca4056be5d14d8661b110518f5551c97b643b`, and squash
`d4edda418f991a4c8f4a35ef8e854d4a6efd3b33` matched. It supplies the unmounted DATA-backed
presentation; proof and main were green. CUTOVER's zero-sum ownership prerequisite completed in
PR `#1676`, with squash `64a5403f5d7f55891a353fe4d914a7ad2bab30bc` and tree
`e80746833fb974829035a83c99dbd95a50911c9f`; exact PR and protected-main health were green, and CD
was cancelled before deployment. Repairs through `#1686` established the 21-path map; its final
prerequisite squash is `01117c712f56ce0ce12750605b3fbf0b337d24c3`, tree
`7e44c5a177b8da0770b8e12a445037b62e9cfee4`.

`T117B-CUTOVER` completed through `#1691/#1675` with its exact 21-path
[admission](./2026-08-28-t117b-cutover-admission.json). Head `503d4b179251f9d3d06e07349ec80f85805565ae`,
tree `61b2316606c9b3facd6c8aff2a14bb4402d80c82`, and squash
`31cae997e42dbc0bee13ca670899b988576bd42c` matched. The member route mounts DATA-backed PORTAL
through one fail-closed request identity while preserving neutral-host drafts. Exact-head and main
checks were green; CD had no deployment effect. T-117C `#1724` failed on public no-JS;
`#1726/#1727` closed and admitted its repair. Historical build and 7/7 Z620 passed. #1731 admits 52 paths; #1733 admits the final corpus with main verified. #1734 merged; #1737 admits 53 paths, main CI/Sonar passed. Promotion #1738 and product #1736 merged; T117C implementation is delivered. Closeout records an inactive projection; successor promotion remains separate.

Closed `IDA-WF01-ONE-APPROVAL-DELIVERY` remains immutable evidence through its
[closeout](./2026-08-21-ida-wf01-one-approval-delivery-closeout.md),
[authority anchor](./current-authority-v1.json), artifacts, and receipts; it grants no Lean runtime.

T-115 OD17 is terminal. CI01/A1 and PR #1610 remain separate/unpromoted. Workflow Protocol v1
grants no product, auth, routing, tenancy, schema/RLS, billing, provider, E2E, AI, or Docker work.

## M0-M5 Implementation Blueprint

| Phase | Preserved frontier                                                                         |
| ----- | ------------------------------------------------------------------------------------------ |
| M0-M5 | Architecture-finalization program/tracker remain the blueprint; no M0-M5 node is promoted. |

## Ordered Candidate Priorities

| Priority | Candidate                          | Dependencies    | Promotion constraint           |
| -------: | ---------------------------------- | --------------- | ------------------------------ |
|        1 | Locale-aware currency parsing      | Promotion #1753 | Completed migration trial 1/3. |
|        2 | Bounded failed-run retry           | Owner direction | Completed migration trial 2/3. |
|        3 | Unsupported claim AI document type | Trial 2         | Completed migration trial 3/3. |

These rows, the notification correctness increment, shared shell navigation, both notification
acknowledgement increments, `MEMBER-CASE-WORKSPACE-REDESIGN` and `MEMBER-CASE-DETAIL-CONTINUITY`
are completed history, as are S1, S2 and the localization predecessor. The selected work is the
bounded S3 supported-path increment described above; the acceptance-link amendment is completed.

## Shared Shell Navigation Increment

Owner-selected on 2026-09-13 and completed through protected product
[PR #1770](https://github.com/interdomestik/interdomestik/pull/1770); high complexity, Astra/high implementation because role and tenant
navigation must preserve access boundaries. Generalize existing sidebar rendering into one mounted
presentation for member/agent, staff and admin. Existing navigation models, server-authorized role
inputs, agent tiers, staff CRM visibility, admin branch scope and query-sensitive people selection
remain the admission contracts. No new permission model or domain query is introduced. T117A's
Case/Actions/Timeline slots and T117B's member runtime remain caller-owned; this is navigation
reuse, not all-role portal completion. Proxy, canonical URLs, auth, tenancy and readiness markers
remain unchanged. PR #1769 is parked and is not a dependency.

Brief checked 2026-09-13 for installed Next.js 16.3.3, React 19.2.8 and next-intl 4.13.4:
[W3C navigation semantics](https://www.w3.org/WAI/ARIA/apg/patterns/disclosure/examples/disclosure-navigation/)
support named navigation, native links and current-page indication; adopt those principles and
native Tab/Enter behavior, reject a menu widget or custom Space activation. [WCAG consistent
navigation](https://www.w3.org/WAI/WCAG22/Understanding/consistent-navigation.html) supports stable
relative ordering. [next-intl navigation](https://next-intl.dev/docs/routing/navigation) confirms
locale-free `usePathname` and localized links; retain those wrappers. These are reference checks,
not usability validation. Prior T117A shared-shell findings remain applicable.

Owner-supplied front-runners already contributed: Sonnet 5 Medium proposed supplied-item rendering
and caller-owned slots; Gemini 3.1 Pro proposed duplicate/empty/stale-context, route, keyboard/mobile
and server-rejection cases. Adopt applicable repository contracts; reject invented capability
literals, frontend permission maps, universal 403 behavior and a shadow dashboard. These were
proposals, not source reviews or executed tests; no repeat helper call is required.

Acceptance: actual role consumers share navigation rendering; duplicate destinations render once,
query variants remain distinct, one most-specific segment match identifies the current page,
caller selection handles admin people filters, changed inputs replace stale links, empty navigation
preserves caller content, collapsed links retain names, and ordinary mobile activation closes the
existing drawer. Focused tests, independent Astra review, unchanged required repository proof,
protected expected-head merge and exact-main health remain delivery requirements.

Product head `049a6f4b2d8c47d94b71cf4ba8b4195f050c8dd3` squash-merged as
`8e4abb9272a144e91b27b988b2476f5dd45c9c40` on 2026-09-13. Required protected PR checks,
including CI, full E2E, Pilot, security, CodeQL and SonarCloud, passed. Exact-main CI
`34788807428`, Sonar Main Gate `34788807382`, Secret Scan `34788807371`, CodeQL quality
`34788806958` and CodeQL security `34788807132` passed at that merge. A later successful feedback
refresh superseded one unrelated failed refresh; neither run demonstrated a product defect. No
deployment or all-role portal completion is claimed.

## T410 Optimistic Notification Acknowledgement Increment

Owner-selected on 2026-09-14; high complexity and Astra/high implementation because the mounted
notification center combines concurrent React rendering, asynchronous mutation/fetch ordering and
subscriber epochs. Blueprint dependencies T-401 and T-002 are complete. Selected main had no
production `useOptimistic` call. The bounded increment adds immediate read-state presentation for
single and bulk acknowledgement, commits the canonical snapshot only for matching typed success, and
rolls back typed failure, thrown failure or a mismatched notification ID. Action-link navigation
still waits for confirmed success. Claim status and every other mutation domain remain unchanged.

Brief checked 2026-09-14 for installed React 19.2.8. The matching React 19.2 source guidance
requires optimistic dispatch inside an async transition and derives rollback by removing the
optimistic overlay when the action settles without a canonical update; adopt that base/overlay
split. Existing WCAG status-message guidance remains applicable: retain announced processing,
success and error feedback without focusing the status region; pending and rollback keep the
active acknowledgement control mounted and focusable. The earlier correctness increment rejected
speculative state while the available reference documented a different React version; this
increment uses version-matching evidence and explicit rollback tests rather than adding the hook
by name alone. Claude Sonnet 5 supplied the bounded transition proposal and Gemini 3.1 Pro supplied
independent fetch, subscriber and navigation counterexamples; both reported the requested served
models. Gemini's overlapping single/bulk premise is rejected because synchronous refs already
forbid that second action.

Acceptance: single and bulk acknowledgement update the represented unread state immediately;
typed, thrown and wrong-ID failures roll back; duplicate/overlap, subscriber replacement,
fetch-reconciliation and confirmed-before-navigation behavior remain; focused tests, independent
final review, unchanged required repository
proof, protected expected-head merge and exact-main health pass. Server notification actions and
queries, proxy/routes, auth/tenant/RLS, schema, claim status, money/legal actions, billing,
navigation design and deployment remain unchanged.

The candidate keeps the real-Radix focus regression that caught native-disabled focus loss. Its
exact capacity proposal changes T410 total 48,728→52,182 bytes, source 15,088→15,180, tests
32,438→35,800 and files 6→7; exact budget self-attribution is +160 config bytes. Derived global
changes are +3,614 total, +92 source, +3,362 tests, +160 config and +1 file. This proposal uses no
deleted-byte credit, reserve, evaluator change or unrelated allocation. The owner explicitly
approved the initial figures on 2026-09-14. Final review then found that restoring stable allocation
identity requires 25 additional config bytes; the owner approved the corrected +3,614-byte and
+1-file global total on 2026-09-14. No broader capacity authority is inferred.

Product source head `32921c88ae4e41a4ce01500866ace884ad08eba9` passed the unchanged full local
proof and security guard. Protected [PR #1771](https://github.com/interdomestik/interdomestik/pull/1771)
records current-head review, hosted checks, expected-head merge and exact-main health. No deployment
or broader T-410 completion is claimed.

## T410 Pessimistic Mutation Boundary Increment

Owner-selected on 2026-09-14 from exact main `ef1d972ef4c77c4c92dfa135dcf4962e05ca91d6`.
This high-complexity bounded CI-contract slice is now owned by Astra/high after repeated semantic
review escapes required reassignment from Sol/high. It completes the T-410 convention outcome: production
`useOptimistic` consumers must be explicitly audited, and only the delivered reversible notification
acknowledgement module is admitted. T-401 and T-002/T-002b are complete; T-411 remains unselected
because SVC-CORE and FLIGHT-03 are not complete.

Member outcome: claim-status, recovery, subscription, settlement, payout and other unaudited
mutations cannot gain speculative-success presentation without failing the required CI contract.
Acceptance discovers production consumers within the static-reference contract below, rejects an unregistered consumer and stale audited
entry, retains the four notification catalog checks, and passes focused contracts, independent
reviews, frozen required proof, protected expected-head merge and exact-main health. Scope is limited
to the current program/tracker, the existing T410 CI contract and its stable capacity allocation.
App runtime/UI, proxy/routes, auth/tenant/RLS, schema/data, billing behavior, T-411/SVC/FLIGHT,
deployment and general tooling repair remain excluded.

The owner approved the exact stable-allocation adjustment on 2026-09-14: T410 total
52,182→57,982 bytes, tests 35,800→41,600, the existing CI-contract path 700→6,500, global total
61,267,746→61,273,546 and global tests 7,067,147→7,072,947. Files remain seven and budget
self-size remains 62,480. No deleted-byte credit, reserve, new file or guard weakening is used.
To retain byte-identical budget self-size, the unchanged 4,000-byte front-door path cap is encoded
as the equivalent JSON number `4e3`; its parsed allocation is unchanged. After the complete reviewed
correction exposed its footprint, the owner approved a further exact 1,687 bytes: total
57,982→59,669, tests 41,600→43,287, existing CI path 6,500→8,187, global total
61,273,546→61,275,233 and global tests 7,072,947→7,074,634. Files and budget self-allocation
remain unchanged. Any further capacity need must be fully identified and approved before pushing.

PR #1772's repeated failures were review-gate rejections, not permission to repair gate workflows.
Product CI at `bcaee170` passed, but review found missed renamed destructuring assignments and string
data promoted into callable aliases. The comprehensive correction at exact implementation head
`d681cf09326db53e0482aab2df5eee3415158341` uses TypeScript assignment-target classification and
single-file lexical symbol resolution. Literal initializer chains are data: they resolve computed
keys or exclude ordinary data reads, never become callable aliases. Actual callable references are
detected at their imports, exports, member accesses or binding introductions, preserving file-level
discovery through later renaming. Assignment targets, defaults, nested patterns, shadowing and
cycles are covered. Type-only syntax is excluded while runtime generic instantiations and class
extends expressions remain visible. Each production TS/TSX/JS/JSX/MJS/CJS file uses its real filename.
The audited notification consumer retains the forbidden named-mutation inventory, including claim
and subscription cancellation, `createClaimFromSavedDraft`, recovery, settlement, payout, success
fee, airline claim and sponsored membership. Catalog, stale-entry, unregistered-consumer and source
discovery contracts remain intact. Arbitrary runtime-computed names, reassigned-key flow, reflection,
cross-module renamed wrappers and runtime React provenance are outside this bounded static guard.

Fresh independent Astra/high review passed 150 adversarial checks against the 8,187-byte scanner
SHA-256 `0e2f65f8334526655a9e8c2a0a68cdf0c049728f6315af8644df071fb078f9ef`. Its type-only and
runtime-generic findings were corrected before full verification. Four focused contracts (including
58 paired hook/mutation cases), capacity, modularity, formatting and diff checks passed. The actual
verification environment was preflighted before the uninterrupted final run: isolated migrated task
database `interdomestik_ci_t410_boundary_01a09f54_v3`, canonical CI-parity credentials, nip.io
hosts, free port 3000, disk headroom and no competing heavy job; source-map upload was disabled.
The same implementation head passed unchanged `pnpm pr:verify`: 1,181 CI contracts, 154 release
tests, 41 RLS tests, 3,383 web tests/12 intentional skips, 81.29% repository line coverage,
252 browser-gate tests/12 intentional skips and 13 smoke tests/11 intentional skips. Separate
`pnpm security:guard` passed. Earlier passes are historical, not transferred to this correction.
Protected current-head checks, expected-head merge and exact-main health remain required; no
deployment or successor is authorized.

The subsequent commission-writer review found a real inventory gap despite green product CI.
The consolidated correction adds commission references and explicit direct-runtime-import admission
for the audited notification consumer (five modules, eighteen symbols). Forty-eight source-backed
money/legal writers are covered; reader/calculation exclusions do not grant import admission.
The contract remains bounded: changed behavior behind admitted symbols, transitive wrappers,
reflection and reassigned-key flow are not whole-program guarantees.

The owner approved the exact additional 7,077 bytes and one helper file: T410 total 59,669→66,645,
tests 43,287→45,231, source 15,180→20,212, existing CI path 8,187→10,131, helper 0→5,032,
files 7→8; budget self-allocation 62,480→62,581 and capacity-rebase 99,884→99,985.
Global total is 61,282,310, tests 7,076,578, source 8,850,254, config 2,232,807 and files 6,058.
Scope additionally includes `scripts/ci/t410-reference-guard.mjs`; no reserve, deleted-byte credit
or guard weakening. The 123-line helper and 233-line test preserve the reviewed split exactly.
Six focused contracts pass. Exact implementation `ee59416494987281b8fab20c8a947f04325478e7`
passed uninterrupted full proof and security guard: 1,183 CI contracts, 154 release, 41 RLS,
3,383 web/12 skips, 81.29% line coverage, 252 browser-gate/12 skips and 13 smoke/11 skips.
Native Gemini Pro supplied five executed proposals without a new defect; the owner waived Claude
after its five-minute no-output timeout. Independent Astra review remains valid for the unchanged
split. The tracker records identities and limitations. Current-head review disposition, protected
merge and exact-main health remain pending; no deployment or successor is authorized.

Fresh review of `52a0b908` identified defaulted computed-key declarations missing from literal
resolution. The correction follows own initializers on variables, binding elements and parameters;
renamed/array/parameter defaults, lexical aliases, inert data, shadowing and cycles are covered.
Object-property projection and reassigned-key flow remain outside the bounded contract.
The owner approved 759 more bytes and a further 190 bytes for matching the checker's target to
the parser and covering parameter/body shadowing: helper 5,181, test 10,931, T410 total 67,594,
source 20,361 and tests 46,031; global total 61,283,259, source 8,850,403 and tests 7,077,378.
Files, budget self-size, config, reserves and guards are unchanged. Previous full proof is
historical. Renewed full `pr:verify` and separate `security:guard` passed at
`c050edd6de682971cc3cd5e3e7a6eca1e7922519`: 1,183 CI contracts, 154 release tests, 41 RLS tests,
81.29% line coverage, 252 browser-gate passes/12 skips and 13 smoke passes/11 skips.
Protected review and all leaf checks passed at `aa0147ec`, but delivery `34926953847` rejected
Sonar annotations despite its green summary: regex complexity 27/20 and scan complexity 24/15.
The bounded correction splits the equivalent regex alternatives and extracts import-name handling,
preserving conservative matching and import admission. Official `eslint-plugin-sonarjs` 4.2.0
reproduced both findings and now passes both rules. The helper is 5,175 bytes within its unchanged
5,181-byte cap; no tests, capacity, policy or guard are removed. Renewed full `pr:verify` and
separate `security:guard` passed at `4849de16928fb9ccb1d35fccd3e4e541e0e76da1`: 1,183 CI contracts,
154 release tests, 41 RLS tests, 81.29% coverage, 252 browser-gate passes/12 skips and 13 smoke
passes/11 skips. Protected current-head review/checks, merge and exact-main health remain pending.

## Ordinary Product Delivery

The owner adopts the ordinary protected-PR workflow demonstrated by trials 2 and 3
for subsequent explicitly scoped work. This program selects priorities; the tracker
records status. Neither a green gate nor an inactive legacy resolver selects a new
feature or authorizes work outside the owner's scope.

- Use one bounded implementation PR with its tests and necessary status updates.
  No separate routine promotion/closeout PR, per-slice code exception, Brain
  publication, or model approval panel is required.
- `AGENTS.md` supplies repository boundaries; the Interdomestik skill guides
  research, implementation, helper ownership and verification. AI OS/Brain/Wiki
  remain advisory. Legacy slice runners and Lean authority are explicit-only;
  their inactive state is not a prohibition on ordinary authorized product work.
- Preserve tenant/auth/RLS, document lifecycle, data integrity, canonical routes,
  the read-only proxy boundary, required CI and protected expected-head merges.
  Focused tests support iteration; `pnpm pr:verify`, `pnpm security:guard` and
  required E2E evidence still govern delivery. Reuse proof only for matching inputs
  where existing contracts permit; do not run an already-covered heavy lane twice.
- Review according to risk, including substantive review bodies and inline
  comments. Consolidate corrections before the final expensive proof. A real
  security or product failure remains blocking; diagnose infrastructure failures
  before repeating unchanged runs.
- Z620 prospective receipts below establish the historical three-trial result;
  they are not a new recurring migration-qualification requirement. Follow the
  selected task's actual verification requirements and isolate its resources.
- Record prepared, tested, merged, deployed and user-validated states separately.
  Staging remains intentionally dormant; this work authorizes no deployment.
  CD subscribes only to version tags and manual dispatch, not `main` pushes.
  Restore the automatic staging trigger only on explicit owner
  reactivation of staging. Tag/manual releases retain their existing guards;
  they are not authorized by a maintenance merge. PR #1760 establishes this
  boundary before package-command PR #1759 merges. The trusted-parent classifier
  and runtime-sensitive `package.json` classification remain unchanged.

## T210 Member Timeline Delivery

T210 mounted a typed event-presentation registry into the existing single-query T-206 member timeline
path. The query's tenant, claim, entity, public-history join, and `claim.status_changed` visibility
constraints remain unchanged. Valid status events retain their authorized public note; unknown
names/versions and malformed status payloads render a generic row; an erased/unavailable subject
renders a redacted row. Verified `case.*`, `recovery.*`, and `membership.*` version-1 events have
prepared fixed, payload-independent SQ/MK/EN/SR mappings, but are not selected by the current query
and are not delivered member history. Any future visibility expansion requires separate scope. No
raw payload, payload PII, actor identity, internal note, or raw event name reaches the member DTO. Flight and
assistance families remain excluded because no current payload allowlist supports them.

The UI/UX brief was refreshed on 2026-09-12 against official public descriptions:
[AirHelp](https://www.airhelp.com/en/contact-us/) combines dashboard status, email updates, and
explanations for quiet stages; [Allianz Assistance](https://www.allianz-assistance.co.uk/help-and-advice/claim-centre.html)
offers claim tracking with human-support fallback; and
[ADAC](https://www.adac.de/services/apps/pannenhilfe/) describes current status and waiting-time
visibility in its roadside-assistance journey. These are comparison patterns, not evidence that
Interdomestik has reliable ETA data. T210 adopts calm chronological history,
plain fixed labels, and safe fallback continuity in the existing Case Companion surface. It rejects
notification noise, task-list substitution, invented ETAs, raw technical event names, and copied
competitor trade dress. This is public-description evidence, not an authenticated-portal inspection
or claimant usability test. Focused proof covers every registered key, fallback/redaction,
non-mutation/non-leakage, locale resolution, and the shared member timeline rendering path.

Product PR #1763 merged final head `87c291f21d74c9a1dfd8d92683124c29af89f4f7` and tree
`a24e6b186f829994a693eb89fb95981e5db024e9` as
`00794c98cc6b4d395493370552ab7b9eae525db7`. Source-bound local `pr:verify` and
`security:guard` passed at `061ea5910ea63aab67009bccfb2b219505733fa9`. Changes after that proof
were limited to tracker correction, required-test wiring, modularity policy, and capacity budget;
they did not change product behavior. Final-head focused review found no unresolved issue.
Protected-main CI `34703433627`, SonarCloud Code Analysis check `103580834614`, and Sonar Main Gate
`34703433721` attempt 2 passed at the exact squash merge. This records implementation and merge
only; no deployment or claimant usability validation is claimed.

## T410 Notification Acknowledgement Correctness Increment

`T410-NOTIFICATION-ACK-CORRECTNESS` completed as a high-complexity, Astra/high ordinary product slice.
The chief reassigned its sole implementation owner from Sol/high after a reproduced abandoned
React render stranded committed acknowledgement state. Risk drivers include concurrent rendering,
subscriber epochs, asynchronous UI state, typed server outcomes, localization, and accessibility
over an established contract. Existing blueprint dependencies T401 and T002 are recorded complete;
this increment does not claim broader T-410 completion.

The member notification center previously awaited single/all acknowledgement actions but ignored a
returned `{ success: false, error }` before changing the represented rows and a separately stored
unread count. The bounded correction makes read state server-confirmed, derives the count from the
represented list, prevents duplicate and overlapping single/all mutations, ignores stale fetch or
mutation results after subscriber changes, and exposes localized accessible pending, success, and
failure feedback. Bulk acknowledgement still updates the full tenant/user unread backlog but
returns a bounded success result; after confirmation, the client marks its represented requested
rows read and reconciles a bounded authoritative snapshot. Existing lazy fetching and action-link navigation remain, with locale-aware
normalization for stored action paths and disabled semantics while an item is pending. Notification
generation/delivery, server auth and tenant filters, schema, routes/proxy, billing, case/recovery
state, and deployment remain unchanged.

Product PR [#1765](https://github.com/interdomestik/interdomestik/pull/1765) merged final head
`abf37e7c62490ebbbf2d2fbb35685b847e17b68c` as `bc4a7fe940b245f57cbc442258b21f6bb5870a7f`;
both trees match `a817b68d7af207b2c89ba5022cf1e9b8570025b9`. Full `pr:verify`, `security:guard`,
both focused neutral-IDA keyboard variants and independent Astra review passed on that source.
All required hosted checks and strict review readiness passed, with zero unresolved review threads.
Exact-main [CI](https://github.com/interdomestik/interdomestik/actions/runs/34754164766),
[SonarCloud analysis](https://api.github.com/repos/interdomestik/interdomestik/check-runs/103716794800)
and [Sonar Main Gate](https://github.com/interdomestik/interdomestik/actions/runs/34754164793) passed.
The tracker records detailed source-bound evidence. This owner-authorized two-file transcription
records the actual outcome, following #1764; it does not establish routine closeout PRs or authorize
deployment, claimant usability approval, redesign, or a successor.

The following research and intermediate verification notes are historical. Their then-pending
checks are superseded only by the exact final-source and protected-main evidence above.

The shared brief was checked on 2026-09-12. The current
[React `useOptimistic` reference](https://react.dev/reference/react/useOptimistic) describes
temporary pre-confirmation UI and currently documents React 19.3, while this repository resolves
React 19.2.8; this slice rejects speculative read state and does not add `useOptimistic` merely to
match a blueprint term. The
[WCAG 2.2 status-message guidance](https://www.w3.org/WAI/WCAG22/Understanding/status-messages)
supports programmatically announced waiting, result, and error feedback without taking focus; the
slice adopts a restrained live status/alert region with understandable control names. AirHelp's
[public fee description](https://www.airhelp.com/en-int/our-fees/) says claimants are kept updated,
but it neither exposes nor validates its notification UX; this slice therefore adopts only the
member outcome of truthful update handling and rejects copied wording or visual design. Focused
proof must reproduce the false-success bug and cover typed failures, thrown errors, duplicate and
single/all concurrency, count/list consistency, subscriber/fetch races, accessible names, locale
resolution, and the retained member navigation path. A tightly scoped browser regression and the
ordinary required checks remain delivery evidence; no authenticated competitor-portal inspection
or claimant usability validation is claimed.

The 2026-09-13 correction follows React's [ref guidance](https://react.dev/reference/react/useRef)
and [layout-effect timing](https://react.dev/reference/react/useLayoutEffect), checked against
the installed React 19.2.8: commit-phase synchronization prevents abandoned renders from changing
the active subscriber. A real Suspense transition test failed before the correction and passed
after it. The correction also coalesces pending same-subscriber fetches, distinguishes fetch
failure from an empty inbox with a localized retry action, and tests acknowledgement before
navigation. These findings were consolidated before renewed full verification.

The current member screen is a legacy behavioral integration surface only, not an approved visual
target. Browser evidence for this increment proves notification semantics and keyboard operation;
it does not approve or freeze that screen's layout, styling, hierarchy, or navigation presentation.
The owner intends a net-new member UI/UX using current interaction patterns within the unified
portal shell, not separate role-specific dashboard designs. That redesign is separate scope;
canonical role routes and readiness markers remain technical access-control and test contracts.

Source-bound local proof passed at `af64f73c82164a6189a93be7bdcd9b0af1c10a19`: 61 focused
notification/domain tests (57 web and 4 domain), both focused IDA-host browser variants, the full
`pr:verify` gate, and
`security:guard`. The full gate included 1,048 CI contracts, 154 release-gate tests, 41 RLS tests,
81.25% repository line coverage (21,643/26,637), 252 browser-gate passes with 12 intentional skips,
and 13 smoke passes with 11 intentional skips. Repo-owned routes completed Claude Sonnet 5 design
and Gemini 3.1 Pro/Gemini 3.8 Flash test-screening proposals against specification commit
`adc3ca314`; those receipts informed implementation but are not current-head implementation-review
evidence. An earlier independent Astra implementation review passed at `833496eb`. Subsequent
externally reported findings were reproduced and corrected: concurrent single-acknowledgement error
state, pending unread-menu closure, Macedonian/Serbian translations, unread-only bulk writes,
unbounded bulk responses, locale-safe action routing, disabled pending actions, Serbian glossary
consistency, semantic status output, and explicit tenant/user predicates without the deprecated
helper overload. The changed E2E corpus fingerprint is registered within the existing fixed-capacity
CI evidence allocation, with no repository-ceiling increase. The corrected behavior and regressions
are covered by the new source-bound proof.
At that intermediate source, protected review, PR evidence and merge remained pending;
no deployment or claimant usability validation was claimed.

On 2026-09-13 the owner waived Claude and Gemini reviews for this notification increment only
and directed Astra completion. Astra/high is the implementation owner, with a fresh independent
read-only Astra final review before renewed mandatory source-bound verification. Earlier Gemini
wrapper receipts do not establish served-model identity and remain advisory; the isolated native
communication repair is parked, not part of this product PR. No permanent model-policy change,
protected-check bypass, UI redesign or deployment follows from this one-slice waiver.

Renewed source-bound local proof passed at `045b0c7ee609776613ff47a076bf47ce1ec7660c`:
full `pr:verify` (649,494 ms), security guard and both focused IDA notification browser variants.
The full gate passed 1,048 CI contracts, 154 release tests, 41 RLS tests, 81.24% line coverage,
252 browser tests with 12 intentional skips and 13 smoke tests with 11 intentional skips.
Astra independently cleared unchanged production head `b5e67972` with 28 web/four domain tests.
The successful run used a task-only database and supported upload-disabled local environment;
an interrupted earlier Sentry upload remains separately recorded in the tracker. Protected
checks and merge were then pending; no deployment or visual approval is claimed.

The subsequent `aed9f024` review reproduced two fetch-boundary regressions: the action masked
expired sessions as an empty inbox, and revision-discarded fetches missed newly arrived rows.
The bounded correction propagates fetch failures and coalesces a fresh current-subscriber/epoch
fetch after invalidation. Existing server authorization is unchanged. Zero-row bulk success
remains idempotent: another tab may already have acknowledged the authorized unread backlog;
affected-row counts cannot distinguish that from deletion and are not a valid failure rule.
Focused regressions cover both acknowledgement variants, post-mount session expiry and bounded
zero-row success. These changes required renewed source-bound full proof before protected merge.

Review at `61e17a02` reproduced a further bulk ordering: a fetch completed while acknowledgement
was pending, adding a row outside the captured list before the server read the backlog. Successful
bulk acknowledgement now requests bounded reconciliation even when no fetch remains in flight.
The regression matrix covers single/bulk fetch completion before/after acknowledgement, arrivals
still unread after the database write, wrong-ID refusal, failed reconciliation with explicit retry,
and subscriber-epoch isolation. Independent Astra review cleared this correction after 41 focused
web/four domain owner tests passed. Full proof at `61e17a02` remains old-source evidence; the final
correction received its own renewed verification before protected merge, as recorded above.

## T117C Product Delivery

Promotion #1738 bound owner review `5164184965` to head
`8b2cce527d6ec22114eb2fce3e8bad8a3528feb9`. Product #1736 merged verified head
`f13c81712d5fa012c6407337852217473a1c4d4d` as
`c3e79d91d103c373ac9014d136956e8d91815991` on 2026-09-10.
Its 50 changed paths fit the unchanged 53-path authorization. CI `34452735233`,
E2E and smoke `34452735175`, Pilot `34452735196`, finalizer `34452735368`, and
delivery `34452769704` attempt 2 passed. The unused request boundary and its test
were removed; #1729 was closed as superseded. Protected-main CI `34454527870` and Sonar `34454689720` passed at the exact merge. E2E reused PR evidence; coverage ran again and passed.

Product PR #1744 head
`b9128de3b787e26eb08935a4d85cc7580398d6cd` merged as
`be7f1d9f794f4faf338b11dfdfd43e43fe469076`, tree
`0528a173b2d29d2f5d09e4e066467f513607ca4e`. Existing protected-main evidence remained green and
was reused. A later exact clean detached merge rehearsal ran the resource-owned Z620 `e2e-pr` lane in
1,548,982 ms with exit code 0. Gate result SHA-256 is
`5d15d07e940511665631d8819ce72345c49ea1b5885e7372a269850270d2fc59`; redacted log SHA-256 is
`c5ab7f1ac1898f1b82b23d400b7ae8465b7143c0ee29fa9446e6a1a3285718d9`. The task database,
reserved port, processes, and 5.3 GiB temporary checkout were removed; Z620 returned to 96 GiB
free. The run establishes a successful technical baseline but earns no migration credit: live
activation and a repo-bound prospective protocol did not both precede product merge and measured
execution as required by this slice's admission. Migration therefore remains 0/3.

For the completed trials 2 and 3, the owner's explicit execution direction admitted one bounded ordinary product PR
per trial while Lean authority remains inactive. No separate promotion/closeout PR or hard-coded
per-slice policy exception is required. Each candidate must freeze its exact base SHA, product head,
merge-candidate tree and lockfile hash before the repo-native
`z620-resource-run.mjs --lanes=e2e-pr` execution. The clean detached run uses a task-owned database
and port; unchanged protected PR evidence may be reused, and the result, redacted log, hashes,
duration and cleanup state remain external evidence. A run started without that pre-execution
binding or with failed cleanup earns no credit. Both that evidence and the expected-head merge
passed for all three trials. Migration progress is 3/3; the ordinary workflow above now applies.

## Currency Parsing Trial 1 Promotion

Promotion #1753 admitted only `MIGRATION-CURRENCY-PARSING-TRIAL-1`. Product #1754 fixed exact head
`9547770dce4d21b0c9dd24e42d3e38c3a6d61095`, tree
`8825fbc3a039ad5253c49b873b6a1c6343ae27fb`, and merge candidate tree matched the immutable
pre-execution freeze. The Z620 `e2e-pr` lane passed in 1,456,046 ms; result SHA-256 is
`3075f62bd505efabea25d943465a214ece8910c4f222bdea4b0316fa29ec89af` and log SHA-256 is
`6248d80f016c83c520d986017516b20560acde74d42881affc35445fe3cb74a8`. The task database,
reserved port, and runner process were absent after execution; the private workspace returned
clean at the exact head/tree with 5.0 GiB free. GitHub Full E2E attempt 2, Pilot, CI, Sonar,
finalizer, and delivery passed on the unchanged head. Product #1754 then squash-merged as
`a6a634169020e73341932bd37001864b41563733` on 2026-09-11. Migration progress is now 1/3.

[Shared evidence](https://gist.github.com/arbenl/b1c4fbacb88b110d557baa0d401b6d81/53f1e39febca8bce97389993dfdfad4df4630351)
retains the freeze, receipt, gate result, and full Z620 log. The tracker points here for stable proof.

## Failed-run Retry Trial 2

The bounded candidate permits exactly one Inngest retry for a claim-document workflow after a
generic `claim_ai_processing_failed` result. Retry intent comes only from trusted attempt `1`; the
tenant-scoped compare-and-set binds both `status=failed` and that eligible error code before
returning the run to `processing`. Completed work, permanent extraction/deletion failures, later or
duplicate attempts, and a lost compare-and-set race remain skipped. The existing document/claim
tenant joins, RLS transaction boundary, routes, auth, schema and deployment surface remain
unchanged.

Product #1757 fixed head `4a6ebbed9bb8a942d707ad81cef57fcede02dd63`, tree and merge-candidate
tree `fb3ee8f53f290b82b43dbde16fc6cd6a8749f5bf`. The exact-head Z620 `e2e-pr` lane passed
in 1,551,834 ms; result SHA-256 is
`4ad149d001623f5ba63dfb8609e849704e4c26583695c5558e585177a52d0ad6` and log SHA-256 is
`cb44f5d3b3af05b391141a24f31419f35c1f23d444e02fc87aa254469a7516ea`. The task database,
reserved port, and runner process were absent after execution; the clean temporary candidate was
removed while its evidence was retained. All protected PR contexts passed on the unchanged head,
which squash-merged as `1728afd3c76f952de9a6df87502800965e041093` on 2026-09-11. Migration
progress at that checkpoint was 2/3.

## Unsupported Claim AI Document Type Trial 3

The bounded candidate preserves accepted claim image/audio uploads and human access to the source,
but the default AI workflow no longer records a completed metadata-only extraction when it cannot
read the uploaded format. Plain text and PDF decoding remain unchanged. Accepted image/audio MIME
types and unknown types fail permanently as `claim_ai_unsupported_document_type` before either
claim extractor or extraction persistence runs. The existing upload allowlist, consent, document
lifecycle, tenant-scoped failure persistence, retry policy, routes, auth, schema and deployment
surface remain unchanged. Product #1758 merged exact head
`0819504edd2124ce4606e6102d980d78c2279ec4` as
`d54fa720ba812ade5584ada9ab51aa02a9fc0c46` on 2026-09-11 at 16:36:22 UTC.
Head and merge tree matched `145260744f66eee7ecef50d24b1873d181fa71c3`.
The corrected prospective Z620 run passed in 1,553,241 ms with exit 0;
result SHA-256 `629850774c15c55c114d005a2e020c52c98916155c81a64808d5f7ef4bb84437`,
redacted log SHA-256 `f40d568e8c86ca2a56b2c8f50df3d984443695339b8c0bb4770264b6bbb6ab8e`.
The execution owner reported task database/port/process/candidate cleanup and
13/13 successful protected-main checks. No production deployment occurred.
Trial 3 is completed; the three-trial migration is 3/3.

## Staff Current-Claim Tenant Context Promotion

Promotion #1749 and product #1744 are closed; their later rehearsal is baseline evidence only.

## Unified Portal Direction

Use one responsive capability shell, never role copies. `Case → Actions → Timeline` is core; order
is `T-118 → T-117A → T-116 → T-117B → role/task views`. Member starts with Help
Now/Cases/Documents; other roles retain their tasks. Tenant/legal context appears only when useful;
benchmarks guide rationale, not trade dress. T-117B uses async RSC, sibling Suspense,
request-scoped identity, and two projections. `cacheComponents`, PPR, named routes, `next.config`,
and global headers remain T-117C.

## Selection Constraints

- Each implementation branch has one integration owner. Independent helpers use
  disjoint file ownership or isolated worktrees; reviewers remain read-only.
- Ordinary delivery follows the workflow above. Exact writer-map admission is
  required only when explicitly invoking a legacy governed slice, not as an
  additional promotion step for every ordinary PR.
- For the explicit legacy Lean workflow, invalid authority/proof fails closed with `runtime_authorized:false`, `activeSlice:null`, and
  successors blocked; a valid `promotion_pending` projection may name `activeSlice` while runtime
  remains false.
- Modularity follows `scripts/modularity-guard-policy.mjs`, not a universal
  150-line ceiling. No unrelated splitting or minification to satisfy prose.
- Models, Z620, cache data, and advisory memory can support evidence but cannot grant authority.
- The repository validator remains the authority for an explicitly invoked Lean
  slice. External skills and MCP state cannot grant or block that slice, and
  ordinary-PR adoption does not change its inactive projection.
- Existing unrelated worktrees, branches, PRs, artifacts, histories, and provider state are preserved.

## Lean Authority

<!-- prettier-ignore -->
```json lean-authority
{
  "schemaVersion": 1,
  "authority": "lean-tier12-v1",
  "lifecycle": "inactive",
  "owner": {
    "login": "arbenl",
    "id": 62884977
  },
  "activeSlice": null
}
```

## Historical Authority

Rev 243 history is recoverable from
[the archive manifest](./history/current-authority/2026-08-16-through-rev-243.manifest.json), SHA-256
`355229c5d24a6fa5f0986b6ce41423cbdc5caea16b291f1335a7264b2be5fc78`. Architecture-finalization,
OD17, and CI01 remain historical and inactive.

<!-- prettier-ignore -->
The next active governed implementation goal is resolved only by the repo-owned Lean authority validator.
