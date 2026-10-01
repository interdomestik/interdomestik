# Staging staff–member–admin acceptance scenario

Scope: S7-LIVE-STAFF-MEMBER-ACCEPTANCE. Prepared 2026-10-01; this document is a test procedure, not a passing receipt. Record execution in the existing slice receipt.

## Setup and authority

- Read current-program.md, current-tracker.md, the linked architecture program/tracker and relevant accepted ADRs. Resolve actual shipped M0–M5 state from current source and gates; never treat a planned milestone as implemented.
- Use https://staging.interdomestik.com only. Owner-authorized synthetic accounts: member.ks.a2@interdomestik.com, staff.ks@interdomestik.com and admin.ks@interdomestik.com. Confirm each account's displayed identity and role after normal UI login.
- Local credentials: /Users/arbenlila/.codex/private/interdomestik-staging-accounts.json. Owner fills sharedPassword once. Read as JSON data, never source as shell code. Do not echo password, capture it in screenshots, copy it into Git, receipts, prompts for external reviewers, or browser storage exports.
- Use the Browser skill and the explicitly selected in-app browser. Tabs can share a session: log out and verify the next identity; separate tabs alone do not isolate accounts. Do not inject sessions or bypass login. Stop dependent steps if login/logout fails, retaining the observed failure.
- Record deployed SHA, browser surface, date, fixture IDs, actor and result for each step. Automated execution is distinct from Arben's human acceptance.

## Execution

| Step | Actor                 | Action                                                                                                                                                                                           | Required result                                                                                                                                             |
| ---- | --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1    | Member                | Log in; inspect dashboard, unfiltered case list and two owned case details; reload each.                                                                                                         | Same accessible case IDs across views; details load without 404; status projections agree.                                                                  |
| 2    | Member                | Search an owned case by a supported label/identifier; clear query, filter status, back/forward.                                                                                                  | No lost characters or stale results; empty state only for a genuinely empty result.                                                                         |
| 3    | Member → Staff        | Click logout; revisit protected member page; log in as staff.                                                                                                                                    | Old identity is no longer accessible after refresh; staff identity and correct portal appear.                                                               |
| 4    | Staff                 | Locate the member and the same case; confirm tenant and assignment.                                                                                                                              | Search finds the expected synthetic fixture under supported search semantics; assignment permits the operation.                                             |
| 5    | Admin, only if needed | Log out/in as admin; inspect synthetic member and case assignment using supported UI. If necessary, assign the selected synthetic case to the test staff through the normal supported operation. | Admin remains a governance actor. No role elevation or direct database changes to make tests pass. If assignment operation is unavailable, record blocked.  |
| 6    | Staff                 | On the confirmed fixture, submit one allowed public update with a unique TEST-S7 timestamp marker. Add a separately marked internal note only where supported.                                   | One acknowledged save, no duplicate mutation; supported status transition only. Internal content is explicitly private.                                     |
| 7    | Member                | Log out/in as member; open the same case and refresh.                                                                                                                                            | Public update appears once with correct state; internal marker and staff-only controls are absent.                                                          |
| 8    | Member                | Visit the previously observed staff/admin URLs.                                                                                                                                                  | Access denied or safely redirected; no privileged content. Cross-tenant checks require an approved other-tenant synthetic fixture; otherwise mark untested. |
| 9    | Staff → Member        | Recheck persisted state after logout/login.                                                                                                                                                      | Same durable result and ownership scope; no stale previous-role state.                                                                                      |

Known prerequisite failure: on 2026-10-01 member dashboard showed five cases; case list showed zero; golden_ks_a_claim_02 and golden_ks_a_claim_10 returned 404, including reload. Resolve and rerun step 1 before any dependent case writes. Do not report the journey as passed while this persists.

Use existing synthetic fixtures first. Do not create billing transactions, send external notifications, upload personal documents, perform irreversible legal decisions, or delete audit history for cleanup. If a selected operation has such side effects, choose an authorized harmless alternative or record that step blocked.

## Search timing

Measure member-case search and staff/admin member/case search separately on supported fields. Record one first attempt and five repeated attempts with identical query and data; mark cache state unknown unless demonstrated. Start at final keystroke/submit and stop when the correct settled result is visible. Record time to loading feedback separately. Capture numeric samples, median and range, result correctness, browser and SHA. Do not call five samples a reliable p95. Browser automation wall-clock overhead is included; separate network/server timings only when actually observed. Use an existing approved latency budget if present; otherwise report baseline, not an invented pass threshold. Compare before/after only with the same procedure and fixture.

## M0–M5 conformance before every implementation

Record applicable ADR/invariant, existing code boundary, and focused regression proof in the existing receipt. Check transition sole-writer and guards (M0); event/read-model foundations (M1); case/recovery separation and staff operational ownership (M2); server-resolved access tenant, RLS and cache isolation, distinct from host/legal/booking identity (M3); derived product views and mandatory applicable AI/billing contracts (M4); and only the actually authorized live-cutover compatibility state (M5). Preserve Supabase Auth → better-auth → shared-auth layering, canonical routes and page-ready contracts. A staging defect does not authorize architecture refactoring, proxy edits, a live cutover or bypassing RLS.

## Completion

Record pass/fail/blocked/untested per step with evidence and fixture mutations in the existing receipt. Retain synthetic TEST markers as evidence; list any cleanup still needed. Reconcile canonical program/tracker through the existing authorized amendment after delivery evidence. Never equate green CI, prepared scenario, or agent browser execution with human sign-off.

## Owner visual direction — 2026-10-01

Arben supplied PHOTO-2026-09-28-14-35-36.jpg and PHOTO-2026-09-28-19-00-27.jpg as the future design direction and explicitly said the present design will change completely. Treat current screens as behavior under test, not a visual baseline to preserve.

Owner clarification (2026-10-01): the images are directional inspiration only. Their colors, palette, styling, layout, navigation and copy are NOT approved design decisions and must not be adopted automatically. Before designing or changing UI/UX, follow the installed Interdomestik skill: research current design practices and current end-to-end journeys for members, agents, staff and admins using relevant primary sources and comparable products. Record checked sources/date, adopt-or-reject reasoning, and testable usability benefits in the existing task artifact. Evaluate accessible, responsive alternatives against actual user needs and current M0–M5 architecture; do not copy a mockup or adopt a trend merely because it is fashionable. Reuse still-applicable research only when its scope and freshness are justified. Keep role-specific needs and cross-role handoffs explicit.

Keep acceptance based on outcomes, stable accessibility semantics and contractual page-ready markers. Avoid tests coupled to present card positions, CSS classes or exact decoration. Update UI locators with each design change while preserving privacy, role separation, tenant isolation, draft-versus-submitted truth, and consistent case state across views.

Visual references do not prove shipped capabilities or authorize promises: offline, biometric login, notifications, automatic estimates, flight availability and free/paid service claims must match approved scope and implemented behavior. This direction does not start a redesign or change M0–M5 architecture by itself.
