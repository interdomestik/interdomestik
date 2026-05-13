# P38-DG04 Lead Dedupe And Routing Slice Selection

## Status

- Date: 2026-05-13
- Classification: design gate and implementation promotion
- Current branch: `codex/p38-dg04-dedupe-routing-design`
- Promoted implementation slice: `P38-CRM04 Lead Dedupe Domain Foundation`
- Authority: this gate opens `P38-CRM04` only; routing remains a separately promoted follow-up.

## Inputs

- `P38-DG01` ranked dedupe and routing as P0 CRM foundations after accounts/contacts and configurable pipelines/deals.
- `P38-CRM02` added first-class account, contact, account-contact, and lead-conversion domain contracts through PR `#745`, merge commit `1160d8dd1c6ca5d35329b099bd4dd22ebd432430`.
- `P38-CRM03` added configurable pipeline and deal domain contracts through PR `#747`, merge commit `a717a5afaec0064a71309a09d7bc4b94f5549dfd`, and closeout PR `#748`, merge commit `c17bb6dd494b58d6de88c0cc5f6387788e81c066`, recorded the final tracker/program state.
- The original CRM state-of-the-art review ranked lead deduplication before routing because duplicate leads quickly degrade list quality, dashboard trust, and assignment correctness.
- Existing lead stage history, ownership history, account/contact conversion contracts, and outbox contracts give dedupe enough context to be a domain-only slice before SQL adapters or web merge tools.

## Decision

Promote exactly one bounded implementation slice: `P38-CRM04 Lead Dedupe Domain Foundation`.

Routing is not promoted in this gate. It remains the next P0 candidate after dedupe, because routing assignment decisions are side-effectful and should consume cleaner lead identity signals instead of assigning duplicate or merge-pending leads.

### Rationale

Dedupe is the smaller and safer foundation after CRM03: it is pure domain logic, can be proven with in-memory adapters, improves dashboard and routing data quality, and avoids introducing assignment side effects. Routing remains important, but doing it first would turn duplicate or near-duplicate lead rows into prescriptive ownership decisions. This gate therefore locks the dedupe contract first and leaves routing to a later `P38-DG05` design gate.

## P38-CRM04 Scope

### In scope

- Add `packages/domain-crm/src/lead-dedupe`.
- Define pure normalization helpers for email, phone, full name, and company name.
- Define a pure match-candidate scorer that compares normalized email, normalized phone, and name-plus-company signals and returns a typed candidate with score and reason codes.
- Define `mergeCrmLead` as a domain mutation with typed actor context, explicit winner/loser IDs, field-retention decisions, optional idempotency key, and append-only merge-history output.
- Define `CrmLeadMergeHistoryRecord` and repository-port contracts that let adapters append merge history and apply a merge atomically later.
- Extend `CrmDomainEvent` with `crm.lead.merged` using the existing outbox contract style.
- Export the module from `packages/domain-crm/src/index.ts` and `packages/domain-crm/package.json`.
- Add in-memory unit proof for matching, scoring, authorization, merge validation, history append semantics, and event emission.
- Preserve deterministic clock and ID injection.

### Out of scope unless separately authorized

- Database schema or migrations for `crm_lead_merge_history` or lead merge columns.
- SQL adapters under `apps/web/src/lib/domain-crm`.
- Web merge UI, lead-list banners, agent/admin dashboard changes, or automatic merge execution.
- Account/contact dedupe, account merge, contact merge, deal merge, backfill, or duplicate cleanup jobs.
- Routing rules, assignment strategy, workload snapshots, routing audit tables, or ownership-transfer side effects.
- AI/ML fuzzy matching, enrichment, external data providers, or cross-tenant matching.
- Proxy, canonical routes, auth/tenancy architecture, Stripe, README, AGENTS, or broad architecture-doc edits.

## Implementation Constraints

- Domain code stays under `packages/domain-crm`; no SQL or `drizzle-orm` import may appear in the new module.
- Matching/scoring functions are pure and synchronous.
- Merge mutation functions consume `CrmActorContext` and return typed success/error results; they do not throw for expected validation failures.
- Authorization follows the existing lead mutation model: tenant scope is mandatory, branch scope is enforced where the actor has a branch, agents may merge only their own eligible leads, and staff-like actors may merge within their tenant/branch scope.
- Merge is not automatic. A caller must explicitly pick winner, loser, and field-retention choices.
- Merge history is append-only and records actor, tenant, branch, winner ID, loser ID, field decisions, reason, occurred-at timestamp, and optional idempotency key.
- The loser lead must not be mutated by ad hoc domain code; the repository port owns the future adapter-level atomic update.
- Existing lead conversion contracts are preserved. Converted leads are not eligible as merge losers unless a later persistence/backfill gate explicitly authorizes that behavior.

## Validation Rules

Acceptance tests must pin the following:

- Email normalization lowercases and trims email input and treats blank or malformed email as absent, not as a match signal.
- Phone normalization keeps a stable digit-only comparison key, tolerates punctuation and whitespace, and rejects too-short values as absent.
- Name-plus-company matching requires both normalized name and normalized company to be present before contributing score.
- Exact normalized email match is high confidence; exact normalized phone match is high confidence; name-plus-company match is lower confidence unless reinforced by another signal.
- Candidate scoring returns deterministic reason codes such as `email_exact`, `phone_exact`, `name_company_exact`, and `insufficient_identity`.
- Candidate scoring never matches across tenants.
- `mergeCrmLead` rejects self-merge, cross-tenant merge, cross-branch merge where branch scope applies, non-owning agent merge, archived leads, already-merged leads, and converted loser leads.
- `mergeCrmLead` rejects empty merge reason and empty field-decision sets.
- Successful merge appends exactly one merge-history record and emits exactly one `crm.lead.merged` event.
- Failed authorization or validation appends no history and emits no event.
- Optional `idempotencyKey` is carried through the history record and outbox event; deduplication remains adapter-owned and out of scope.

## Outbox Extension

Add one event variant to `CrmDomainEvent`:

- `crm.lead.merged` with data `{ winnerLeadId, loserLeadId, branchId, mergedFieldKeys, reason }`

`CRM_DOMAIN_EVENT_TYPES` must include `crm.lead.merged`; the aggregate type remains `lead`.

## Acceptance Criteria

- `packages/domain-crm` exports lead dedupe types, repository ports, pure matching helpers, merge mutation contracts, and in-memory test utilities.
- The pure scorer ranks exact email and phone matches above name-plus-company matches and returns deterministic reason codes.
- Merge mutation proof covers valid merge, self-merge rejection, cross-tenant rejection, branch-scope rejection, non-owning agent rejection, archived/already-merged/converted loser rejection, empty reason rejection, empty field-decision rejection, append-only history, and event emission.
- `CrmDomainEvent` remains backward-compatible with prior P38 variants while adding `crm.lead.merged`.
- No SQL or `drizzle-orm` import appears under `packages/domain-crm/src/lead-dedupe` or the touched outbox files.
- `pnpm --filter @interdomestik/domain-crm test:unit` and `pnpm --filter @interdomestik/domain-crm type-check` pass before PR.
- Full `pnpm verify-slice -- --required-gates` passes before the implementation PR is merged.

## Verification Plan

### Focused proof for P38-CRM04

- `pnpm --filter @interdomestik/domain-crm test:unit --run src/lead-dedupe/index.test.ts`
- `pnpm --filter @interdomestik/domain-crm test:unit`
- `pnpm --filter @interdomestik/domain-crm type-check`
- `pnpm exec prettier --check packages/domain-crm/package.json packages/domain-crm/src/index.ts 'packages/domain-crm/src/{lead-dedupe,outbox}/**/*.ts'`
- Boundary-contract check if the implementation touches package exports or boundary files.

### Required proof before P38-CRM04 PR

- `pnpm pr:verify`
- `pnpm security:guard`
- `pnpm e2e:gate`

## Risks And Deferred Decisions

- **Merge persistence shape.** The implementation defines history and repository-port contracts only. Schema, indexes, and adapter atomicity are deferred to a later persistence slice.
- **False positives.** Exact email and phone matches can still be wrong in shared inbox or household scenarios. The first slice therefore produces candidates and explicit merge decisions; it does not auto-merge.
- **Account/contact dedupe.** This slice only addresses lead duplicates. Account/contact merge rules require their own gate because they affect converted aggregates and deals.
- **Routing dependency.** Routing should consume dedupe state or candidate signals, but this gate does not define routing rules, pools, assignment strategy, or workload snapshots.
- **Historical duplicates.** Backfill and cleanup jobs are deferred; the domain contract makes future cleanup safer without running it now.

## Dependency / Sequencing

This slice unblocks:

- `P38-DG05 Lead Routing Design`, because routing can avoid assigning known duplicate or merge-pending leads.
- Future lead-list quality indicators and dashboard data-quality read models.
- Future persistence for append-only lead merge history.

This slice does not unblock or authorize tasks, templates, sequences, activity channel specializations, scoring, reporting, consent, enrichment, search, retention, workflow automation, or UI redesign.

## Promotion Boundary

Merging this design gate authorizes `P38-CRM04 Lead Dedupe Domain Foundation` only. Routing, persistence adapters, web UI, dashboard changes, automatic merge jobs, and account/contact dedupe require later design gates.
