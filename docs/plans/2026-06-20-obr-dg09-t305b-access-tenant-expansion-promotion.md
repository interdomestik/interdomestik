# OBR-DG09 T-305b Access-Tenant Expansion Promotion Gate

Status: complete
Slice: `OBR-DG09`
Owner: platform + architecture + qa
Phase: Phase C
Date: 2026-06-20
Authority: explicit post-`T-209` current-authority and implementation-selection gate.

## Scope Boundary

This is a design-gate and promotion slice only. It closes the post-`T-209`
selection gap and promotes exactly one next implementation goal from the
canonical architecture tracker: `T-305b`.

This gate does not implement runtime code, schema, migration, RLS, route, proxy,
auth/session behavior, billing, AI, UI, README, AGENTS, or broad architecture
changes.

`apps/web/src/proxy.ts` remains read-only. The follow-on `T-305b`
implementation must preserve canonical `/member`, `/agent`, `/staff`, and
`/admin` routes, contractual clarity markers, Supabase Auth / better-auth /
`@interdomestik/shared-auth` layering, and Paddle-only V3 pilot billing.

Vercel/CD deployment contexts are external to this docs-only gate and are not a
blocker for promotion. Required non-waived evidence remains the local
docs/tracker proof and, once a PR is opened, the GitHub CI/security checks that
apply to the PR head.

## Source Inputs

| Evidence                                                     | Finding                                                                                                                                                                         |
| ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `docs/plans/current-program.md`                              | `T-209` is complete, no replacement slice was started by closeout, and fresh current-authority selection is required before follow-on implementation work.                      |
| `docs/plans/current-tracker.md`                              | `T-209` closeout preserved case-scoped grant semantics, protected routes/proxy, and explicitly did not start next-slice work.                                                   |
| `docs/plans/architecture-finalization-tracker-2026-05-29.md` | `T-305b` is TODO, depends on completed `T-305` and `T-302d`, and requires `access_tenant_id` on every tenant-scoped table that can diverge from legal entity.                   |
| T-209 closeout lessons                                       | Cross-tenant grants must remain case-scoped, trusted session/resolver boundaries must not accept caller-forged tenant/role claims, and RLS context must be explicit and tested. |

## Decision

Promote `T-305b` as the next bounded implementation goal.

`T-305b` is selected because the platform has already completed the four-context
tenant resolver, access-tenant context propagation, and access-tenant RLS policy
migration (`T-305`, `T-302c`, `T-302d`). `T-209` then proved a real
cross-tenant case-scoped handoff flow. The next safety-critical gap is to
enumerate and harden every tenant-scoped table whose access tenant can diverge
from legal or entity-of-record ownership.

This selection is tenant/privacy-safety and auditability work. It is not broad
M3, not a tenant switch, not M5 cutover, and not Operational Brain or AI runtime
integration.

## Promoted Slice Contract

`T-305b` must be limited to access-tenant divergent-table expansion:

- Enumerate divergent tables versus never-divergent tables before editing
  schema or policies.
- Include at minimum the canonical tracker candidates: `claim`,
  `claim_documents`, recovery/agreement tables, `domain_events`, and flight
  tables where they exist and are tenant-scoped.
- Add or backfill `access_tenant_id = tenant_id` only on approved divergent
  tables, using an idempotent and reversible migration posture.
- Apply the existing `T-302d` access-tenant RLS policy pattern without creating
  a parallel tenant-isolation model.
- Preserve `T-209` semantics: grants expose only the authorized case and
  approved documents, never full member profile or membership entity-of-record.
- Run same-tenant owner/uploader/scoped access before durable-grant fallback
  wherever document or case access is involved.
- Keep staff assigned-claim access and branch-manager branch-scoped access
  distinct.
- Use trusted session/resolver context; do not accept caller-forged tenant,
  role, or access-tenant claims.
- Add focused RLS/migration and access-boundary proof for every touched table.

## Non-Goals

- No `T-307`, `T-402`, `T-403`, `T-404`, `T-403b`, `T-405`, `T-501`,
  `T-502`, `T-503`, `T-504`, `T-506`, `T-507`, broad M3/M4/M5, AI posture,
  Operational Brain runtime, UI/UX overhaul, WS-F/G/H, OMG, DOM, CRM expansion,
  or product redesign.
- No route rename, proxy rewrite, auth/session architecture change, billing
  provider change, Paddle expansion, live-login flip, legacy `status` drop,
  product UI implementation, README, AGENTS, or broad architecture-document
  change in this gate.
- No claim that `ARCH-FINAL` is itself an implementation slice.

## Candidate Ranking

| Rank | Candidate                                         | Decision | Rationale                                                                                                       |
| ---- | ------------------------------------------------- | -------- | --------------------------------------------------------------------------------------------------------------- |
| 1    | `T-305b` access-tenant divergent-table expansion  | Promote  | Directly strengthens tenant/privacy isolation after `T-209`; dependencies `T-305` and `T-302d` are complete.    |
| 2    | `T-503` drop legacy `status`                      | Defer    | Requires release-cycle dual-read evidence and fresh M5 authority; not a post-`T-209` safety gap.                |
| 3    | `T-307` proxy-logic split                         | Defer    | Route/proxy-adjacent structural work with higher blast radius; not needed before access-tenant table hardening. |
| 4    | `T-402` product-model hierarchy typing            | Defer    | Valuable product-model work, but less urgent than tenant/privacy isolation after cross-tenant handoff.          |
| 5    | `T-403`/`T-404`/`T-403b`/`T-405` AI posture chain | Reject   | AI posture and Operational Brain runtime remain unpromoted by this gate.                                        |
| 6    | `T-501`/`T-502`/`T-504`/`T-506`/`T-507` M5 work   | Defer    | Broad cutover/entity-migration work needs separate M5 authority and prerequisite evidence.                      |

## Acceptance Criteria

- `OBR-DG09` records the post-`T-209` current-authority decision.
- Exactly one next implementation goal is promoted: `T-305b`.
- Broad M3/M4/M5, proxy/routing work, AI posture, Operational Brain runtime,
  product UI redesign, README, AGENTS, and broad architecture-doc rewrites
  remain unpromoted unless separately reauthorized.
- `current-program.md`, `current-tracker.md`, and the architecture tracker record
  the `OBR-DG09` decision without changing runtime files.
- Tier 0 docs/tracker verification passes: `git diff --check`,
  `pnpm docs:verify`, `pnpm plan:status`, `pnpm plan:audit`, and
  `pnpm track:audit`.

## Rollback

Revert this document and the canonical program/tracker references. Because this
gate makes no runtime or schema changes, rollback is documentation-only.
