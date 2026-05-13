# P38 CRM State-Of-The-Art Roadmap And Slice Plan

## Status

- Date: 2026-05-13
- Classification: roadmap/design gate plus promoted implementation slices
- Current branch: `codex/p38-dg03-pipeline-deal-design`
- Current promoted implementation slice: `P38-CRM03 Pipeline And Deal Domain Foundation`

## Inputs

- `P36` completed the CRM data-model/read-side hardening prerequisite.
- `P37` closed enough AI readiness to open Dashboard Professionalism work.
- The package review identified `packages/domain-crm` as the correct boundary for CRM expansion because it already preserves pure domain modules, SQL adapters outside the package, typed actor context, append-only lead stage and ownership history, support-handoff lifecycle state, read/write separation, timeline projection, and lead follow-up next-action derivation.

## Decision

Open `P38 CRM State-Of-The-Art Foundations` as the next CRM/product-professionalism tranche.

The tranche is not a broad CRM rewrite. It must continue the existing ports/adapters split and slice policy:

- `apps/web/src/proxy.ts` remains read-only.
- Canonical `/member`, `/agent`, `/staff`, and `/admin` routes remain unchanged.
- Auth layering, tenancy architecture, and route authority remain unchanged.
- Stripe remains out of V3 pilot flows.
- SQL adapters stay outside `packages/domain-crm`, under `apps/web/src/lib/domain-crm/`, unless a later slice explicitly adds schema/adapters.
- New modules must preserve deterministic clock/ID injection, typed authorization where actor access is involved, and append-only history or outbox semantics for state transitions.

## Ranked Slice Queue

### P0 foundations

1. `P38-CRM01 CRM Domain Outbox Contract`
   - Add the typed `CrmDomainEvent` union, `CrmOutboxPort`, deterministic event-data builders, enqueue helpers, and in-memory unit proof.
   - Keep this first slice domain-only: no database schema, worker, notification fanout, route behavior, UI, or external sync.
2. `P38-DG02 Accounts, Contacts, And Lead Conversion Design`
   - Design first-class account/contact aggregates, account-contact associations, lead conversion state, and append-only conversion history before implementation.
3. `P38-CRM02 Accounts, Contacts, And Lead Conversion Foundation`
   - Implement the smallest domain-package slice from `DG02` before persistence/schema wiring.
4. `P38-DG03 Pipeline And Deal Aggregate Design`
   - Design configurable pipelines, ordered stages, stage history, forecast category, and loss reasons before replacing text-stage assumptions.
5. `P38-CRM03 Pipeline And Deal Domain Foundation`
   - Promote `crmDeals` into the domain with stage history and forecast-ready read contracts.
6. `P38-DG04 Dedupe And Routing Design`
   - Split dedupe and routing into parallelizable slices only after account/contact identity is available.
7. `P38-CRM04 Pipeline And Deal Persistence`
   - Add schema/adapter persistence only after the pipeline/deal domain contracts are stable.
8. `P38-CRM05 Reporting Read-Models And Forecast Snapshots`
   - Add funnel, velocity, source, win-rate, leaderboard, and forecast snapshot contracts after pipelines exist.
9. `P38-CRM06 Lead Dedupe Domain Foundation`
   - Add pure lead matching and explicit merge-history contracts before routing decisions depend on duplicate-prone lead identity.
10. `P38-DG05 Lead Routing Design`

- Promote routing only after dedupe contracts exist, so assignment strategy can account for duplicate or merge-pending leads.

11. `P38-CRM07 Lead Routing Domain Foundation`

- Add routing-rule and assignee-selection contracts without web or SQL wiring.

### P1 product depth

12. `P38-CRM08 Tasks Foundation`
13. `P38-CRM09 Templates Foundation`
14. `P38-CRM10 Sequences Foundation`
15. `P38-CRM11 Activity Channel Specializations`
16. `P38-CRM12 Lead Scoring Provenance`
17. `P38-CRM13 Consent And Preferences`

### P2 strategic backlog

External IDs, enrichment, webhook intake, quotes, full-text search, retention, goals/quotas, workflow automation, and PII access auditing remain backlog candidates. They are not authorized until a later design gate promotes a bounded slice.

## P38-CRM01 Acceptance

- `packages/domain-crm/src/outbox` exports typed event, repository, and mutation/helper contracts.
- CRM domain events include lead creation, lead stage change, ownership transfer, activity recorded, and deal-won event shapes.
- Outbox event data is created with injected clock and ID services.
- Event validation rejects unsafe tenant/aggregate/date/actor-tenant states before appending.
- Batch enqueue does not partially append when any event is invalid.
- Unit proof uses an in-memory outbox adapter and verifies idempotent duplicate reporting.

## Verification Plan

Focused proof for `P38-CRM01`:

- `pnpm --filter @interdomestik/domain-crm test:unit`
- `pnpm --filter @interdomestik/domain-crm type-check`
- `pnpm exec prettier --check packages/domain-crm/package.json packages/domain-crm/src/index.ts 'packages/domain-crm/src/outbox/**/*.ts'`

Required proof before PR:

- `pnpm pr:verify`
- `pnpm security:guard`
- `pnpm e2e:gate`

Current local note: an initial `pnpm pr:verify` run reached the final PR-fast E2E gate and failed late in `gate-mk-contract` on `v1-live-surface-revalidation.spec.ts` because `member-start-claim-cta` was not found after cross-role navigation. Focused triage traced the failure to stale agent-dashboard server-action responses racing the agent-to-member navigation. The fix keeps referral-link, leaderboard, and commission reads server-side on the agent surfaces instead of firing mount-time server-action POSTs from client components. After rebuilding the standalone artifact, the focused `gate-mk-contract` scenario passed.

## Non-Goals

- No proxy, route, auth, tenancy, Stripe, README, AGENTS, or broad architecture-doc changes.
- No CRM UI redesign.
- No dashboard analytics expansion before accounts/contacts and pipelines exist.
- No SQL outbox table or worker in `P38-CRM01`; those require a follow-up schema/adapter slice.
- No sequences, automation, scoring, external enrichment, or AI/ML scoring until their design gates are promoted.
