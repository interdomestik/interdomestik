---
plan_role: input
status: draft
source_of_truth: false
owner: platform
last_reviewed: 2026-09-09
---

# T-117C — nonce-compatible member rendering

> Status: repeat promotion pending in PR `#1728`; runtime remains denied until exact merge and live resolution.

The user authorized this bounded outcome. Promotions through #1723 merged exactly, while product PR #1724 failed closed before merge after its final-head full gate exposed a public no-JavaScript shell regression. Failure closeout #1726 restored inactive authority. Prerequisite #1727 then admitted the minimal six-path repair while preserving replay of the historical 44- and 45-path maps. The repaired product diff is rematerialized as candidate `783dd9436b2c1bddd051345a697fa874badc7a4d`, tree `8e8a159954150b7d028a4c94c156255d51a355d1`, binary-diff SHA-256 `da06c9772e1c1f12c1350061a4e0808451c97658f34ff52e5fb0b84d98b9b506`. Promotion #1728 remains denied until exact owner review, checks, squash merge and live resolution match.

## Outcome

At the existing localized member home, compose Case, Actions and Updates as named routes in one URL-transparent `(portal)` group. All other 17 member destinations remain outside that group. Preserve one request identity, exactly two tenant projections, neutral-host/default-tenant drafts, disclaimer, responsive shell and current authenticated readiness markers.

An artifact built for the existing authorized nonce-off mode enables Cache Components and may prerender anonymous document chrome/loading only. The locale root renders public children directly so the public shell remains visible without JavaScript; four public request-time consumers opt out individually. A report-mode artifact disables Cache Components and preserves fresh per-request nonce rendering. Deployment nonce mode is observed and bound, never downgraded for performance. Personalized chrome and data remain request-bound; this delivery does not promise a personalized prerendered portal shell.

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
23. `apps/web/src/app/[locale]/(auth)/login/page.tsx`
24. `apps/web/src/app/[locale]/(auth)/register/page.tsx`
25. `apps/web/src/app/[locale]/(site)/nps/[token]/page.tsx`
26. `apps/web/src/app/[locale]/(site)/pricing/page.tsx`
27. `apps/web/src/app/[locale]/(staff)/staff/layout.tsx`
28. `apps/web/src/app/[locale]/admin/commissions/page.tsx`
29. `apps/web/src/app/[locale]/admin/layout.tsx`
30. `apps/web/src/app/[locale]/admin/members/number/[memberNumber]/page.tsx`
31. `apps/web/src/app/[locale]/admin/settings/page.tsx`
32. `apps/web/src/app/[locale]/admin/users/[id]/page.tsx`
33. `apps/web/src/app/[locale]/components/home/footer.test.tsx`
34. `apps/web/src/app/[locale]/components/home/footer.tsx`
35. `apps/web/src/app/[locale]/components/home/free-start-intake-shell/use-draft-lifecycle.ts`
36. `apps/web/src/app/[locale]/layout.tsx`
37. `apps/web/src/app/[locale]/stats/page.tsx`
38. `apps/web/src/app/api/claims/route.ts`
39. `apps/web/src/app/api/csp-report/route.ts`
40. `apps/web/src/app/api/e2e/branches/route.ts`
41. `apps/web/src/app/track/[token]/page.test.tsx`
42. `apps/web/src/app/track/[token]/page.tsx`
43. `apps/web/src/components/dashboard/member-portal-runtime-boundary.test.tsx`
44. `apps/web/src/components/dashboard/member-portal-runtime.tsx`
45. `apps/web/src/components/pricing/business-lead-form.test.tsx`
46. `apps/web/src/components/pricing/business-lead-form.tsx`
47. `apps/web/src/components/shell/request-boundary.test.tsx`
48. `apps/web/src/components/shell/request-boundary.tsx`
49. `apps/web/src/instrumentation.ts`
50. `apps/web/src/lib/rendering-build-mode.test.ts`
51. `apps/web/src/lib/rendering-build-mode.ts`

Ordered writer-array SHA-256: `34b78b5355079747ae1166d70a955be94faaff2e7599492daa8b10fc96a1bc1b`. Hash the canonical ordered array with compact JSON and no trailing newline. Fifty-one governed paths are a closed map enforced by prerequisite #1727 on protected main; Git reports 50 rename-aware paths because the source member page becomes `portal-context.ts`, while `--no-renames` reports all 51 governed paths. Additions invalidate the freeze. Delete the old member home page only when its behavior has moved to the home group. Preserve all predecessor and unrelated files.

## Rendering and security contract

1. Validate build CSP mode as off/report, reject malformed/enforce, and derive `cacheComponents = mode === 'off'`. Compile only the non-secret built-mode constant; do not inline or overwrite raw runtime `CSP_NONCE_MODE`.
2. In instrumentation register, compare actual runtime mode to the built constant and reject mismatches before request readiness and dynamic initialization. Preserve the static Sentry import and `onRequestError` behavior. Prove next-start and standalone launch.
3. Root locale params enumerate supported locales only. Render locale children directly so public document chrome, login, registration, pricing and NPS remain visible without JavaScript. Their dynamic APIs remain request-time; in each listed public `page.tsx`, Next.js 16.3.3 route-segment config `export const instant = false` opts that segment out of Cache Components static-shell/instant validation. Create the pricing lead UUID only on submit. Report-mode root connection/header nonce placement remains intact.
4. The home group layout and every named slot call one request-memoized guarded resolver before data. Preserve session/member/tenant/actor and neutral-host decisions. Cases and Updates share one case promise; Actions shares the membership promise. No identity/projection enters a cross-request cache.
5. Home slots use matching page/default exports; implicit children page/default return null. Root-to-descendant navigation unmounts the group. All 18 routes retain hard-refresh, soft-navigation, back/forward and unknown-route behavior. Keep disclaimer outside the three data Suspense boundaries.
6. Remove obsolete rendering exports only at listed paths. Retain explicit request behavior in protected wrappers/stats and every API session, tenant, fixture, validation, rate-limit and status contract. Public metadata/providers and the independent track route remain compatibility consumers.

Exact framework basis: protected-main Next 16.3.3 plus its tagged CSP, migration, parallel-route, connection, instrumentation and environment contracts. No framework upgrade, use-cache identity, nonce-policy replacement or proxy edit is included.

## Acceptance

| ID  | Contract                                                               | Required evidence                                                                                                                       |
| --- | ---------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| A1  | Exact map; mechanical exports; original boundaries intact              | scope/hash, source review, existing API and all-role regressions                                                                        |
| A2  | Two correct production modes; mismatch never serves                    | off/report builds; effective config/artifact binding; next-start and standalone mismatch probes                                         |
| A3  | Report nonce preserved and fresh without overstating framework support | successive response header/probe/analytics nonce correspondence, unchanged report delivery, and the DG07 two-header limitation detector |
| A4  | One guarded identity, two projections, request isolation               | real RSC invocation/promise instrumentation, revocation and concurrent-tenant cases                                                     |
| A5  | All 18 member routes settle correctly                                  | KS/SQ, MK/MK, neutral host, direct/refresh/soft/back/forward, member and agent-as-member                                                |
| A6  | Disclaimer/siblings/ready markers/a11y remain correct                  | delayed/rejected/empty/lifecycle projections, 320/768/1440 widths, keyboard and 44px targets                                            |
| A7  | Public shell and shared consumers remain valid without JavaScript      | production build; 7/7 focused no-JS scenarios; metadata/locales/providers/track plus role access                                        |
| A8  | Atomic verified delivery and rollback                                  | required gates, current-head review/CI/Sonar/security, exact merge/main health and owned cleanup                                        |

Required commands remain `pnpm pr:verify`, `pnpm security:guard`, `pnpm e2e:gate`, applicable capacity/modularity/type checks and focused evidence. Existing C31 save/resume/delete and member/diaspora/documents/membership/overlay collectors retain their assertions. Required skips are failures; use only an existing explicit exact-head skip policy where applicable, never a new exception invented by this gate.

## Authorized feasibility sequence

The user-authorized feasibility candidate is complete at commit `783dd9436b2c1bddd051345a697fa874badc7a4d`, tree `8e8a159954150b7d028a4c94c156255d51a355d1`, base `f2cffbe8d09185f0ae7d85a5b6d1db85f2a07cbd`, and binary-diff digest `da06c9772e1c1f12c1350061a4e0808451c97658f34ff52e5fb0b84d98b9b506`. Git reports 50 rename-aware and 51 no-renames paths. A production Next build generated 426 pages and all seven focused no-JavaScript scenarios passed on Z620 in 18.4 seconds; focused unit coverage and web type-check also passed. These facts do not activate runtime before promotion.

Record this as explicit user-authorized feasibility, not `runtimeAuthorized:true`, production deployment or a completed migration trial. Do not spoof the Lean resolver, owner marker, branch or evidence.

## Merged exact prerequisite

PR #1727 merged head `fb3c09592e11494d14f19f21a708a1e85010017b` as protected-main commit `f2cffbe8d09185f0ae7d85a5b6d1db85f2a07cbd`. It admits writer hash `34b78b5355079747ae1166d70a955be94faaff2e7599492daa8b10fc96a1bc1b`, exactly 51 governed writers and the bounded capacity delta while retaining executable replay of historical 44- and 45-path maps. Earlier promotions, failures and closeouts remain historical evidence and do not count as product trials.

## Adversarial review disposition

Historical reviews inform the risk model but do not approve these rematerialized bytes. After promotion, one repo-owned current-head review must cover the exact candidate and 51-path map. Resolve correctness findings before merge; do not invalidate green exact-head evidence for redundant assertions or ceremony-only edits.

## Promotion and reviewer contract

Promotion writes exactly this gate, its sibling admission, current-program and current-tracker. Gate/admission bind base `f2cffbe8d09185f0ae7d85a5b6d1db85f2a07cbd` and candidate commit `783dd9436b2c1bddd051345a697fa874badc7a4d`, tree `8e8a159954150b7d028a4c94c156255d51a355d1`, with binary-diff digest `da06c9772e1c1f12c1350061a4e0808451c97658f34ff52e5fb0b84d98b9b506`. Use live promotion PR `#1728`; bind product branch `codex/t117c-rendering-r4`, the exact 51 governed writers, and closeout writers ordered program then tracker. PR `#1728` was reserved from the bound base with a `[skip ci]` empty commit; its final four-file commit is the sole check-bearing promotion candidate.

Generate `approvalMarker(slice, promotionHeadSha, promotionTreeSha)` only from finalized facts. The exact owner action is one matching COMMENTED GitHub review by arbenl/62884977 with `commit_id` equal to the promotion head and body equal to the generated marker. Confirm four-path scope, owner marker, exact base/sole-parent/merge-tree equality and live validator resolution before product execution.

## Rollback and exclusions

Before merge, discard only owned candidate state. After merge, revert the exact atomic T-117C product merge, rebuild with the same authorized nonce mode, and restore inactive program/tracker. Preserve CUTOVER/DATA/PORTAL and unrelated histories/environments. Trigger deterministic failure closeout on auth/tenant/nonce/query/route/a11y/capacity/exact-head/main-health failure.

Proxy, canonical URLs, auth providers/helpers, tenant helpers, domains, database/RLS, Paddle billing, catalogs, package/lockfile, CI/browser configuration, README, AGENTS and architecture documents are outside the product map. No provider deployment is authorized by this draft. Both rendering modes, the public no-JavaScript repair, all slot files and infrastructure prerequisites together remain at most one prospective product trial; no further trials are invented.
