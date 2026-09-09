---
plan_role: input
status: draft
source_of_truth: false
owner: platform
last_reviewed: 2026-09-09
---

# T-117C — nonce-compatible member rendering

> Status: historical-replay-safe repeat promotion pending in PR `#1723`; runtime remains denied until exact merge and live resolution.

The user authorized this bounded outcome. Promotions #1703, #1710, #1715, and #1721 merged exactly; product PRs #1705, #1711, and #1718 failed closed before merge. PR #1718 reached its promoted tree, where final-head Next 16.3.3 runners exposed a missing request Suspense boundary and prerender-time UUID creation. Failure closeout #1719 restored inactive authority. Prerequisite #1720 admitted the corrected 45-writer map. Harness repair #1722 then restored historical 44-path replay and merged head `64b06f2adf4c46f76092b3d1dc0f89a49f78700b` as protected-main commit `576335a7127d8af1d41d5fb2619cae0d9db742e8`. The unchanged product diff is rematerialized as candidate `6cc90357159de86b820f3643bd1c21d8900ecfc7`, tree `544886da686c20a0a122ab18e18ea6226c1998ae`, binary-diff SHA-256 `58c5ac619ddadf1076343e1def0986d10bd7e6d3b02ae88c53be202fbe759dd6`. Promotion #1723 remains denied until exact owner review, checks, squash merge and live resolution match.

## Outcome

At the existing localized member home, compose Case, Actions and Updates as named routes in one URL-transparent `(portal)` group. All other 17 member destinations remain outside that group. Preserve one request identity, exactly two tenant projections, neutral-host/default-tenant drafts, disclaimer, responsive shell and current authenticated readiness markers.

An artifact built for the existing authorized nonce-off mode enables Cache Components and may prerender anonymous document chrome/loading only. A report-mode artifact disables Cache Components and preserves fresh per-request nonce rendering. Deployment nonce mode is observed and bound, never downgraded for performance. Personalized chrome and data remain request-bound; this delivery does not promise a personalized prerendered portal shell.

## Exact product writer map

1. `apps/web/e2e/gate/member-home-cta.spec.ts`
2. `apps/web/e2e/gate/member-parallel-routes.spec.ts`
3. `apps/web/e2e/gate/rendering-build-mode.spec.ts`
4. `apps/web/next.config.mjs`
5. `apps/web/src/app/[locale]/_core.entry.test.tsx`
6. `apps/web/src/app/[locale]/_core.entry.tsx`
7. `apps/web/src/app/[locale]/(agent)/agent/layout.tsx`
8. `apps/web/src/app/[locale]/(app)/layout.tsx`
9. `apps/web/src/app/[locale]/(app)/member/(portal)/@actions/default.tsx`
10. `apps/web/src/app/[locale]/(app)/member/(portal)/@actions/page.tsx`
11. `apps/web/src/app/[locale]/(app)/member/(portal)/@case/default.tsx`
12. `apps/web/src/app/[locale]/(app)/member/(portal)/@case/page.tsx`
13. `apps/web/src/app/[locale]/(app)/member/(portal)/@updates/default.tsx`
14. `apps/web/src/app/[locale]/(app)/member/(portal)/@updates/page.tsx`
15. `apps/web/src/app/[locale]/(app)/member/(portal)/default.tsx`
16. `apps/web/src/app/[locale]/(app)/member/(portal)/layout.tsx`
17. `apps/web/src/app/[locale]/(app)/member/(portal)/page.tsx`
18. `apps/web/src/app/[locale]/(app)/member/(portal)/portal-context.test.ts`
19. `apps/web/src/app/[locale]/(app)/member/(portal)/portal-context.ts`
20. `apps/web/src/app/[locale]/(app)/member/layout.tsx`
21. `apps/web/src/app/[locale]/(app)/member/page.test.tsx`
22. `apps/web/src/app/[locale]/(app)/member/page.tsx`
23. `apps/web/src/app/[locale]/(staff)/staff/layout.tsx`
24. `apps/web/src/app/[locale]/admin/commissions/page.tsx`
25. `apps/web/src/app/[locale]/admin/layout.tsx`
26. `apps/web/src/app/[locale]/admin/members/number/[memberNumber]/page.tsx`
27. `apps/web/src/app/[locale]/admin/settings/page.tsx`
28. `apps/web/src/app/[locale]/admin/users/[id]/page.tsx`
29. `apps/web/src/app/[locale]/components/home/footer.test.tsx`
30. `apps/web/src/app/[locale]/components/home/footer.tsx`
31. `apps/web/src/app/[locale]/components/home/free-start-intake-shell/use-draft-lifecycle.ts`
32. `apps/web/src/app/[locale]/layout.tsx`
33. `apps/web/src/app/[locale]/stats/page.tsx`
34. `apps/web/src/app/api/claims/route.ts`
35. `apps/web/src/app/api/csp-report/route.ts`
36. `apps/web/src/app/api/e2e/branches/route.ts`
37. `apps/web/src/app/track/[token]/page.test.tsx`
38. `apps/web/src/app/track/[token]/page.tsx`
39. `apps/web/src/components/dashboard/member-portal-runtime-boundary.test.tsx`
40. `apps/web/src/components/dashboard/member-portal-runtime.tsx`
41. `apps/web/src/components/shell/request-boundary.test.tsx`
42. `apps/web/src/components/shell/request-boundary.tsx`
43. `apps/web/src/instrumentation.ts`
44. `apps/web/src/lib/rendering-build-mode.test.ts`
45. `apps/web/src/lib/rendering-build-mode.ts`

Ordered writer-array SHA-256: `b92e38a0712d08f188630d282f49bb4034aac2388573a061a4043985bc174f17`. Hash the canonical ordered array with compact JSON and no trailing newline. Forty-five governed paths are a closed map enforced by the prerequisite on protected main; Git reports 44 rename-aware paths because the source member page becomes `portal-context.ts`, while `--no-renames` reports all 45 governed paths. Additions invalidate the freeze. Delete the old member home page only when its behavior has moved to the home group. Preserve all predecessor and unrelated files.

## Rendering and security contract

1. Validate build CSP mode as off/report (missing retains existing off default), reject malformed/enforce, and derive `cacheComponents = mode === 'off'`. Compile only the new non-secret built-mode constant; do not inline/overwrite raw runtime `CSP_NONCE_MODE`.
2. In instrumentation register, compare actual runtime mode to the built constant and reject mismatches before request readiness and before exception handlers/dynamic initialization. Preserve the existing static Sentry import and onRequestError behavior. Prove both next-start and standalone launch; a unit comparison is insufficient.
3. Root locale params enumerate supported locales only. Root off-mode messages use the existing bundled loader with identical strict/fallback behavior. Root locale children use the narrow request Suspense boundary required by Next 16.3.3 above app/member/agent/staff/admin entries while preserving existing guards. Draft UUID creation occurs only at the initiating event, never during prerender. Report-mode root connection/header nonce placement remains intact. Keep the contractual generic document page-ready marker; no authenticated readiness/data appears before authorization.
4. The home group layout and every named slot call one request-memoized guarded resolver before touching data. Transfer the existing complete session/member/tenant/actor and neutral-host decisions unchanged. Cases and Updates share one case promise; Actions shares the membership promise. No slot independently queries, and no identity/projection enters a cross-request cache.
5. Home slots use matching page/default exports; implicit children page/default return null. Root-to-descendant navigation unmounts the group. All 18 routes retain hard-refresh, soft-navigation, back/forward and unknown-route behavior. Keep disclaimer outside the three data Suspense boundaries and reuse existing region error/empty states.
6. Remove the 13 obsolete rendering exports only at listed paths. Retain explicit request behavior in protected wrappers/stats and every API session, tenant, fixture, validation, rate-limit and status contract. Global public metadata/providers and the independent track route are mandatory compatibility consumers, even when unchanged.

Exact framework basis: the protected-main Next 16.3.3 dependency closure plus its tagged CSP, migration, parallel-route, connection, instrumentation and environment contracts. No further framework upgrade, use-cache identity, nonce-policy replacement or proxy edit is included.

## Acceptance

| ID  | Contract                                                               | Required evidence                                                                                                                       |
| --- | ---------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| A1  | Exact map; mechanical exports; original boundaries intact              | scope/hash, source review, existing API and all-role regressions                                                                        |
| A2  | Two correct production modes; mismatch never serves                    | off/report builds; effective config/artifact binding; next-start and standalone mismatch probes                                         |
| A3  | Report nonce preserved and fresh without overstating framework support | successive response header/probe/analytics nonce correspondence, unchanged report delivery, and the DG07 two-header limitation detector |
| A4  | One guarded identity, two projections, request isolation               | real RSC invocation/promise instrumentation, revocation and concurrent-tenant cases                                                     |
| A5  | All 18 member routes settle correctly                                  | KS/SQ, MK/MK, neutral host, direct/refresh/soft/back/forward, member and agent-as-member                                                |
| A6  | Disclaimer/siblings/ready markers/a11y remain correct                  | delayed/rejected/empty/lifecycle projections, 320/768/1440 widths, keyboard and 44px targets                                            |
| A7  | Global config preserves shared consumers                               | production public metadata/locales/root providers/track plus agent/staff/admin access                                                   |
| A8  | Atomic verified delivery and rollback                                  | required gates, current-head review/CI/Sonar/security, exact merge/main health and owned cleanup                                        |

Required commands remain `pnpm pr:verify`, `pnpm security:guard`, `pnpm e2e:gate`, applicable capacity/modularity/type checks and focused evidence. Existing C31 save/resume/delete and member/diaspora/documents/membership/overlay collectors retain their assertions. Required skips are failures; use only an existing explicit exact-head skip policy where applicable, never a new exception invented by this gate.

## Authorized feasibility sequence

The user-authorized disposable feasibility candidate is complete at the exact commit/tree/base/diff identity above and retains the corrected canonical 45-path map. Git reports 44 rename-aware paths and 45 paths with rename detection disabled. The product branch remains governed by the pending promotion; these artifact bytes do not activate it. Preserve host/session/tenant/API protections and the established deployment nonce mode.

Record this as explicit user-authorized feasibility, not `runtimeAuthorized:true`, live promotion, production deployment or a completed product trial. Do not spoof the Lean resolver, owner marker, branch or evidence. Preserve its real inactive result. The final governed product branch is admitted only after the exact prerequisite/promotion chain below. Store failed proof and revise a changed writer map before proceeding; no implicit extra writer is authorized.

The corrected candidate is bound by binary-diff SHA-256 and by the 44 rename-aware / 45 no-renames path proofs above. Capacity uses the protected-main `t117c-rendering` allocation updated by PR #1720: 87,023 tracked bytes, 20 additions, and the exact per-category/per-path ceilings in `scripts/repo-size-budget.json`. Reserve is unchanged.

## Merged exact prerequisite

PRs #1700, #1704, #1707, #1709, and #1713 established the earlier exact policy, capacity, evidence-pin, history, and topology prerequisites. Promotion #1715 merged, then product #1718 failed closed before merge when its final-head Next 16.3.3 runners exposed the two bounded rendering defects. PR #1719 restored inactive authority. PR #1720 merged head `24fbb4550dfca06914477c5f03cf9a49d8821679` as protected-main commit `1ccdf308f07b407f9eabdececc0224bbca70807d` with tree `ee5905b7cad378a32841bee5d91a9e9b555e88`, admitting writer hash `b92e38a0712d08f188630d282f49bb4034aac2388573a061a4043985bc174f17`, exactly 45 governed writers, and the bounded capacity delta. PR #1721 merged the corrected promotion, then PR #1722 restored replay of its historical 44-path predecessors without adding writer paths. These repairs and promotions are not product trials; delivery still requires this repeat promotion and one governed product execution.

## Adversarial review disposition

The prior `pnpm review:opus` receipt covers only the pre-correction candidate. Its findings retain the rendering/security constraints but do not approve the corrected bytes. After promotion, one repo-owned current-head review must cover the exact corrected candidate and 45-path map; resolve new findings before merge.

## Promotion and reviewer contract

Promotion writes exactly this gate, its sibling admission, current-program and current-tracker. Gate/admission bind base `576335a7127d8af1d41d5fb2619cae0d9db742e8` and candidate commit `6cc90357159de86b820f3643bd1c21d8900ecfc7`, tree `544886da686c20a0a122ab18e18ea6226c1998ae`, with the unchanged diff digest above. Use live promotion PR `#1723` in the matching canonical pending projections. Bind product branch `codex/t117c-rendering-r4`, the exact 45 governed writers, and closeout writers ordered program then tracker. PR `#1723` was reserved from the bound base with a `[skip ci]` empty commit; the final four-file commit is the sole check-bearing promotion candidate. No placeholder or owner marker is accepted.

The historical Opus review informs the risk model but does not satisfy review for the corrected candidate. Obtain one repo-owned current-head review after promotion so the reviewer sees the active gate/admission and exact product diff together. Consolidate any remaining architecture/security/QA finding into the closed map before merge, and retain route/model/timestamp/exit/blocker receipts. A review of unrelated runtime source does not cover these T-117C bytes; quota, absent output or a blocked route is never approval.

Generate `approvalMarker(slice, promotionHeadSha, promotionTreeSha)` only from valid finalized facts. The final exact owner action is one matching COMMENTED GitHub review by arbenl/62884977 with commit_id equal to the promotion head and body equal to the generated LEAN_AUTHORITY_APPROVAL_V1 marker. Apply existing user authorization through the approved workflow; no renewed broad chat confirmation is needed. Confirm four-path scope, owner marker, exact base/sole-parent/merge-tree equality and live validator resolution before governed product execution. Commands: `node scripts/lean-current-authority.mjs status --repo=<bound-root>` and `conformance`; exit zero alone is not runtime admission.

## Rollback and exclusions

Before merge, discard only owned candidate state. After merge, revert the exact atomic T-117C product merge, rebuild with the same authorized nonce mode, and restore inactive program/tracker. Preserve CUTOVER/DATA/PORTAL and unrelated histories/environments. Trigger deterministic failure closeout on auth/tenant/nonce/query/route/a11y/capacity/exact-head/main-health failure.

Proxy, canonical URLs, auth providers/helpers, tenant helpers, domains, database/RLS, Paddle billing, catalogs, package/lockfile, CI/browser configuration, README, AGENTS and architecture documents are outside the product map. No provider deployment is authorized by this draft. Both rendering modes, all slot files and infrastructure prerequisites together remain at most one prospective product trial; no further trials are invented.
