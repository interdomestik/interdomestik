---
plan_role: input
status: draft
source_of_truth: false
owner: platform
last_reviewed: 2026-09-08
---

# T-117C — nonce-compatible member rendering

> Status: repeat promotion pending in PR `#1708`; runtime remains denied until exact merge and live resolution.

The user authorized this bounded outcome. PRs #1700 and #1704 established the exact policy and capacity. Promotion #1703 merged exactly; product #1705 then closed unmerged when audit exposed its E2E-tree pin dependency. Closeout #1706 restored inactive authority and CI repair #1707 preapproved only the old and qualified T117C E2E trees. The product candidate remains commit `4e3c333038cf888e2cb31846082fd94d08759fd8`, tree `f3a79932e2f693fb120c6fd166a55ab858ca413c`, binary-diff SHA-256 `5571db81bda9239c8af21afc2e496eeacdec04db7c1e6f380fae7e1c43915230`. Repeat promotion #1708 remains denied until exact owner review, checks, squash merge and live resolution match.

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
31. `apps/web/src/app/[locale]/layout.tsx`
32. `apps/web/src/app/[locale]/stats/page.tsx`
33. `apps/web/src/app/api/claims/route.ts`
34. `apps/web/src/app/api/csp-report/route.ts`
35. `apps/web/src/app/api/e2e/branches/route.ts`
36. `apps/web/src/app/track/[token]/page.test.tsx`
37. `apps/web/src/app/track/[token]/page.tsx`
38. `apps/web/src/components/dashboard/member-portal-runtime-boundary.test.tsx`
39. `apps/web/src/components/dashboard/member-portal-runtime.tsx`
40. `apps/web/src/components/shell/request-boundary.test.tsx`
41. `apps/web/src/components/shell/request-boundary.tsx`
42. `apps/web/src/instrumentation.ts`
43. `apps/web/src/lib/rendering-build-mode.test.ts`
44. `apps/web/src/lib/rendering-build-mode.ts`

Ordered writer-array SHA-256: `5cb7ef250dab08aa31b5acb7949c915819653febb2326de1fd821edd29bb0118`. Hash the canonical ordered array with compact JSON and no trailing newline. Forty-four paths are a closed map enforced by the prerequisite on protected main; additions invalidate the freeze. Delete the old member home page only when its behavior has moved to the home group. Preserve all predecessor and unrelated files.

## Rendering and security contract

1. Validate build CSP mode as off/report (missing retains existing off default), reject malformed/enforce, and derive `cacheComponents = mode === 'off'`. Compile only the new non-secret built-mode constant; do not inline/overwrite raw runtime `CSP_NONCE_MODE`.
2. In instrumentation register, compare actual runtime mode to the built constant and reject mismatches before request readiness and before exception handlers/dynamic initialization. Preserve the existing static Sentry import and onRequestError behavior. Prove both next-start and standalone launch; a unit comparison is insufficient.
3. Root locale params enumerate supported locales only. Root off-mode messages use the existing bundled loader with identical strict/fallback behavior. Root child Suspense and request boundaries above app/member/agent/staff/admin entries preserve existing guards. Report-mode root connection/header nonce placement remains intact. Keep the contractual generic document page-ready marker; no authenticated readiness/data appears before authorization.
4. The home group layout and every named slot call one request-memoized guarded resolver before touching data. Transfer the existing complete session/member/tenant/actor and neutral-host decisions unchanged. Cases and Updates share one case promise; Actions shares the membership promise. No slot independently queries, and no identity/projection enters a cross-request cache.
5. Home slots use matching page/default exports; implicit children page/default return null. Root-to-descendant navigation unmounts the group. All 18 routes retain hard-refresh, soft-navigation, back/forward and unknown-route behavior. Keep disclaimer outside the three data Suspense boundaries and reuse existing region error/empty states.
6. Remove the 13 obsolete rendering exports only at listed paths. Retain explicit request behavior in protected wrappers/stats and every API session, tenant, fixture, validation, rate-limit and status contract. Global public metadata/providers and the independent track route are mandatory compatibility consumers, even when unchanged.

Exact framework basis: Next 16.2.12 tagged CSP, migration, parallel-route, connection, instrumentation and env documentation recorded in candidate R2. No framework upgrade, 16.3-only API, use-cache identity, nonce-policy replacement or proxy edit is included.

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

The user-authorized disposable feasibility candidate is complete at the exact commit/tree/base/diff identity above and retains the canonical 44-path map. The product branch remains governed by the pending promotion; these artifact bytes do not activate it. Preserve host/session/tenant/API protections and the established deployment nonce mode.

Record this as explicit user-authorized feasibility, not `runtimeAuthorized:true`, live promotion, production deployment or a completed product trial. Do not spoof the Lean resolver, owner marker, branch or evidence. Preserve its real inactive result. The final governed product branch is admitted only after the exact prerequisite/promotion chain below. Store failed proof and revise a changed writer map before proceeding; no implicit extra writer is authorized.

The exact candidate's slice delta is 42,565 bytes and net +16 files; positive deltas are 40,885 test/E2E bytes and 12,934 source/script bytes. Capacity uses protected-baseline facts instead: PR #1704 owns 39 new product paths plus both promotion artifacts, retains the five inherited T117B owners and counts 20 file additions. Reserve is unchanged.

## Merged exact prerequisite

PR #1700 merged the exact T-117C policy exception, focused tests, modularity classification and reviewer routes. It recognizes Tier 3, writer hash `5cb7ef250dab08aa31b5acb7949c915819653febb2326de1fd821edd29bb0118`, exactly 44 writers and the closed T117B-CUTOVER predecessor.

PR #1704 repaired capacity ownership with its 20-addition ceiling and full gate. PR #1707 then admitted exactly the current and qualified T117C E2E trees after #1705 failed closed. These repairs are not product trials; delivery still requires repeat promotion and governed product execution.

## Adversarial review disposition

`pnpm review:opus` ran on the exact candidate from `2026-09-08T15:31:17.582Z` to `2026-09-08T15:38:04.640Z`. The repo wrapper recorded configured and provider-reported model `claude-opus-5`, exit `0`, no timeout or blocker, and verdict `FINDINGS` against the bound base/head/tree/diff. That verdict is retained as finding evidence and is not treated as approval.

The findings were independently traced against the exact Z620 artifacts and current framework/runtime source:

- The governance refusal is resolved only by this four-file promotion; the product branch remains blocked until it merges.
- The off-mode prerender manifest inventories 275 concrete routes and 129 dynamic patterns. Protected member routes are partial shells with request holes, `/api/claims` is absent from prerendered routes, and the required-server-files records prove Next `16.2.12` accepted `cacheComponents: true`. Nonce freshness belongs to report mode; off-mode request freshness is covered by real session revocation with original-cookie replay in both tenant projects.
- The sole proxy authority verifies signed cookies and introspects active sessions before protected rendering. React/Next allocate `cache()` storage per RSC request. Edge instrumentation registration is awaited and rejection propagates before request handling. The exact startup matrix also rejected every built/runtime mismatch for both launch forms.
- Generated app-path and prerender manifests distinguish the home portal group from sibling member pages. The locale-aware pathname wrapper hides Next's documented soft-navigation retention, while hard refresh uses the sibling route tree. Same-document soft/back/forward and hard-refresh cases passed in both modes.
- The presentational runtime currently has no protected imports, and the decorative initial skeleton is intentionally hidden while route-specific readiness and soft-navigation live status remain authoritative. Restoring a structural import assertion and adding an initial-load announcement are bounded follow-ups; neither exposes data nor invalidates the qualified behavior.

No production blocker remained after this evidence disposition, so the qualified candidate identity is unchanged. After promotion, the governed product head still requires one current-head repo-owned review over the promoted authority and exact 44-path diff; any new finding must be resolved before merge.

## Promotion and reviewer contract

Promotion writes exactly this gate, its sibling admission, current-program and current-tracker. Gate/admission bind base `7254cbe54a83e7e5762ec429b87e82ff5eca7930` and final candidate commit/tree/diff above. Use live promotion PR `#1708` in the matching canonical pending projections. Bind product branch `codex/t117c-rendering-r2`, the exact 44 writers, and closeout writers ordered program then tracker. PR `#1708` was reserved from the bound base with a `[skip ci]` empty commit; the final four-file commit is the sole check-bearing promotion candidate. No placeholder or owner marker is accepted.

The exact-candidate Opus review and its dispositions above satisfy the escalated adversarial intake. Obtain one repo-owned current-head review after promotion so the reviewer sees the active gate/admission and exact product diff together. Consolidate any remaining architecture/security/QA finding into the closed map before merge, and retain route/model/timestamp/exit/blocker receipts. A review of unrelated runtime source does not cover these T-117C bytes; quota, absent output or a blocked route is never approval.

Generate `approvalMarker(slice, promotionHeadSha, promotionTreeSha)` only from valid finalized facts. The final exact owner action is one matching COMMENTED GitHub review by arbenl/62884977 with commit_id equal to the promotion head and body equal to the generated LEAN_AUTHORITY_APPROVAL_V1 marker. Apply existing user authorization through the approved workflow; no renewed broad chat confirmation is needed. Confirm four-path scope, owner marker, exact base/sole-parent/merge-tree equality and live validator resolution before governed product execution. Commands: `node scripts/lean-current-authority.mjs status --repo=<bound-root>` and `conformance`; exit zero alone is not runtime admission.

## Rollback and exclusions

Before merge, discard only owned candidate state. After merge, revert the exact atomic T-117C product merge, rebuild with the same authorized nonce mode, and restore inactive program/tracker. Preserve CUTOVER/DATA/PORTAL and unrelated histories/environments. Trigger deterministic failure closeout on auth/tenant/nonce/query/route/a11y/capacity/exact-head/main-health failure.

Proxy, canonical URLs, auth providers/helpers, tenant helpers, domains, database/RLS, Paddle billing, catalogs, package/lockfile, CI/browser configuration, README, AGENTS and architecture documents are outside the product map. No provider deployment is authorized by this draft. Both rendering modes, all slot files and infrastructure prerequisites together remain at most one prospective product trial; no further trials are invented.
