# P23-DG01 Post-PERF01 Responsiveness Slice Selection

## Metadata

- Date: 2026-04-28
- Slice: `P23-DG01`
- Status: Complete
- Owner: `platform + web + qa`
- Purpose: select the next bounded `P23` implementation slice after `P23-PERF01` added route-transition feedback and member/admin loading skeletons.

## Scope Boundary

This is a design-gate and tracker-promotion slice only. It does not authorize product-code changes in this PR. It does not authorize changes to `apps/web/src/proxy.ts`, canonical route renames, auth layering changes, tenancy architecture changes, database schema changes, Stripe reintroduction, CRM redesign, agent-workspace redesign, product analytics expansion, README, AGENTS, or architecture docs.

## Evidence Reviewed

| Evidence                                                                                                            | Finding                                                                                                                                                                                                                                                                                                                  |
| ------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `docs/plans/current-program.md` and `docs/plans/current-tracker.md`                                                 | `P23` is active as the bounded post-go-live responsiveness tranche. `P23-PERF01` is complete through PR `#572`; remaining P23 work requires a later bounded slice promotion rather than broad UI/UX redesign.                                                                                                            |
| `apps/web/src/components/shell/authenticated-shell.tsx` and `apps/web/src/components/shell/navigation-feedback.tsx` | Shared authenticated-shell navigation feedback is available and defaults on for shells using `AuthenticatedShell`, with explicit contracts for normal, fast, cancelled, external, ignored, and same-page navigations.                                                                                                    |
| `apps/web/src/app/[locale]/(app)/member/_core.entry.tsx` and `apps/web/src/app/[locale]/(app)/member/loading.tsx`   | The member portal has route-transition feedback and an explicit member portal loading skeleton after `P23-PERF01`.                                                                                                                                                                                                       |
| `apps/web/src/app/[locale]/admin/_core.entry.tsx` and `apps/web/src/app/[locale]/admin/loading.tsx`                 | The admin portal has route-transition feedback and an explicit admin portal loading skeleton after `P23-PERF01`.                                                                                                                                                                                                         |
| `apps/web/src/app/[locale]/(agent)/agent/layout.tsx` and `apps/web/src/app/[locale]/(agent)/agent/loading.tsx`      | The agent portal already uses `AuthenticatedShell`, so shared navigation feedback applies, and it already has a portal-level loading skeleton.                                                                                                                                                                           |
| `apps/web/src/app/[locale]/(staff)/staff/_core.entry.tsx`                                                           | The staff portal uses `AuthenticatedShell`, so shared navigation feedback applies, but the staff route group has no portal-level `loading.tsx`. Staff operations are launch-critical, so slow server transitions can still look blank or stalled before page content resolves.                                           |
| `apps/web/src/app/[locale]/(staff)/staff/claims/_core.entry.tsx`                                                    | The staff claims queue is a server-rendered operations surface with a plain search form, filter links using `prefetch={false}`, and claim-detail links using `prefetch={false}`. Anchor clicks receive shell feedback, but form submissions and route loading do not have a staff-specific pending or skeleton contract. |
| `docs/plans/2026-04-27-p21-qa01-v1-live-surface-revalidation.md`                                                    | Staff dashboard and claim-detail surfaces are launch-critical verification surfaces. Responsiveness work should preserve role/session/tenant boundaries and readiness markers while improving perceived navigation behavior.                                                                                             |
| `apps/web/e2e/navigation-feedback.spec.ts`                                                                          | Existing navigation-feedback E2E coverage proves member/admin feedback. It provides the pattern for a future staff-focused responsiveness smoke if the implementation slice touches staff navigation/loading behavior.                                                                                                   |

## Candidate Ranking

| Rank | Candidate                                                                                  | Decision                                                                                                                                                                                              |
| ---- | ------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1    | Staff claims queue responsiveness                                                          | Promote. Staff claims are launch-critical, the route lacks staff-level loading feedback, and the claims queue search/filter interactions can still appear inert during slow server transitions.       |
| 2    | Staff portal route loading feedback                                                        | Include inside the promoted staff claims responsiveness slice. The loading skeleton is necessary but too small to be the entire implementation decision if queue search/filter feedback remains weak. |
| 3    | Admin claims filter responsiveness                                                         | Do not promote now. Admin is a valid later candidate, but admin already received P23-PERF01 shell and route-group coverage.                                                                           |
| 4    | Agent claims/CRM filter responsiveness                                                     | Do not promote now. Agent already has shared shell feedback and route-level loading skeletons for the main agent route and CRM.                                                                       |
| 5    | Member claims filter responsiveness                                                        | Do not promote now. Member/admin were the first observed P23-PERF01 focus, so staff operations take precedence.                                                                                       |
| 6    | Broad UI/UX redesign, CRM redesign, agent-workspace redesign, or analytics instrumentation | Not promoted. The tracker explicitly forbids broad redesign or analytics expansion without a separate repo-canonical design gate and stronger evidence.                                               |

## Decision

Promote `P23-PERF02 Staff Claims Queue Responsiveness` as the next bounded implementation slice.

## P23-PERF02 Acceptance Criteria

- Add route-level loading feedback for the canonical staff portal and/or staff claims route group using existing skeleton/loading patterns.
- Add deterministic pending feedback for staff claims search submit and filter transitions where current feedback is absent or weak.
- Preserve current staff layout, sidebar, header, readiness markers, role access, session behavior, query semantics, claim ownership, and tenant boundaries.
- Authorized staff happy paths remain behavior-compatible.
- Add focused route/component or E2E proof for staff claims queue responsiveness.
- Do not touch `apps/web/src/proxy.ts`.
- Do not rename canonical routes.
- Do not refactor auth, routing, tenancy architecture, portal structure, schema, Stripe posture, CRM, agent-workspace, product analytics, README, AGENTS, or architecture docs.

## Suggested Branch

`codex/p23-perf02-staff-claims-queue-responsiveness`

## Verification Standard

- Focused route/component tests first if code changes add a testable contract.
- Deterministic local gates appropriate to the changed files.
- `pnpm verify-slice -- --static`.
- Pre-PR reviewer pool.
- Fix all must-fix findings.
- `pnpm verify-slice -- --required-gates`.
