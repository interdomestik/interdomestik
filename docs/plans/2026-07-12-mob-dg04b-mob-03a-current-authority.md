---
plan_role: input
status: active
source_of_truth: false
owner: platform
last_reviewed: 2026-07-12
related:
  - docs/plans/current-program.md
  - docs/plans/current-tracker.md
  - docs/plans/2026-07-09-mob-dg04-next-slice-current-authority.md
  - docs/plans/2026-07-09-mob-03a-promotion-blocker-packet.md
  - docs/product/2026-07-12-mob-03a-reviewer-receipt-acceptance.md
  - docs/product/2026-07-11-mob-03a-owner-jurisdiction-attestation.md
  - docs/product/2026-07-11-mob-03a-targeted-threat-recheck.md
---

# MOB-DG04b Current Authority: MOB-03a Display Foundation

> Status: current-authority/design gate. This record promotes exactly one
> implementation slice: `MOB-03a`.

## Classification And Decision

The gate is Tier 0 promotion/design work. The promoted implementation is Tier 3
because it renders privacy and consent state from tenant-scoped claim data.

`MOB-DG04b` accepts the completed Part A and Part B reviewer evidence and
promotes exactly one implementation slice:

`MOB-03a` — an Interdomestik MK-only, non-medical vehicle/property Vault +
Consent display foundation on the existing member claim-detail surface.

Full `MOB-03` remains unpromoted.

## Entry Evidence Closure

| Prior blocker           | Accepted evidence                                                                      | Gate result                                                                                                                                              |
| ----------------------- | -------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Privacy/legal owner     | Sanja Jovanovska confirmation and the owner/jurisdiction attestation                   | Closed for this non-medical MK boundary.                                                                                                                 |
| Independent disposition | Gazmend Abazi personally checked the two valid version-3 receipts                      | Closed, but carries non-repudiation risk because the evidence account is shared. `REC-02` must replace shared credentials before future evidence intake. |
| Medical/injury boundary | `M03A-MEDICAL-BOUNDARY=approve`, `medicalBoundary=excluded`                            | Closed by exclusion; no DPIA/Art. 9 claim.                                                                                                               |
| Consent display fields  | Status, recorded time, and version approved as display metadata                        | Closed without schema or writer authority.                                                                                                               |
| Access roles            | Member own-case and authorized internal case scope approved; external parties excluded | Closed for the member entry point.                                                                                                                       |
| Document boundary       | State, category, and last metadata update only                                         | Closed; content and identifiers remain forbidden.                                                                                                        |
| Threat recheck          | Targeted recheck returned `clear` for the exact boundary                               | Closed for this design only.                                                                                                                             |
| Erasure/revocation      | Hide subject metadata; preserve non-sensitive skeleton context                         | Closed as a render contract, not a DSR rehearsal.                                                                                                        |
| Exact scope/stops       | MK-only vehicle/property display foundation with explicit exclusions                   | Closed.                                                                                                                                                  |

The durable repo-safe evidence record is
`docs/product/2026-07-12-mob-03a-reviewer-receipt-acceptance.md`. Raw receipts
remain private.

## Goal, User, Entry, And Exit

The primary user is an authenticated Interdomestik MK member viewing a claim
they own. The entry point remains the canonical member claim-detail route. This
slice adds no route.

The member sees a compact Vault + Consent summary only when the stored claim
category is `vehicle` or `property`. The exit state is a read-only list of safe
document and consent metadata, or a clear empty/unavailable state. Categories
outside the allowlist render no MOB-03a surface.

## Read Model Contract

The implementation may read only existing rows:

- `claim`: claim ID, tenant ID, owner user ID, category, and erased-subject
  state already used by the member claim detail;
- `claim_documents`: internal document ID for server-side joining, category,
  and creation time;
- `claim_document_ai_extraction_consents`: latest matching status,
  `recordedAt`, and `privacyVersion` for the same tenant, subject, claim, and
  document.

The server derives this discriminated response and sends no raw IDs or file
metadata to the new UI:

```text
VaultConsentDisplay
  hidden
  | subject_erased
  | ready(items: VaultConsentDisplayItem[])
```

`subject_erased` carries no item array or document count. The member client
must render from this server-owned state and must not infer erasure from item
fields.

```text
VaultConsentDisplayItem
  category: evidence
  updatedAt: latest(document createdAt, consent recordedAt)
  consentStatus: accepted | withdrawn | missing
  consentRecordedAt: date | null
  consentVersion: string | null
```

Only document category `evidence` is allowed. The existing `legal` category is
excluded because the current schema cannot distinguish public legal metadata
from private legal material. The implementation must not infer values when the
source row is absent.

The read must preserve the existing member own-case and tenant predicates. It
must select the latest matching consent by `recordedAt DESC, id DESC`; the
consent primary key is an internal server-side tie-breaker and never enters the
DTO. The read must not call storage, download, upload, share-pack, mutation, or
event/outbox code.

## Rendering Contract

The member UI displays labels for:

- document state;
- document category;
- last metadata update;
- consent status;
- consent recorded time;
- consent version.

It never displays document name, file type, file size, raw document ID, consent
ID, user ID, file content, link, signed URL, storage path, medical data, payment
data, private legal data, or staff-private notes.

If consent is withdrawn, the UI hides consent version and all subject-linked
metadata except the neutral withdrawn state and date. `subject_erased` renders
only a neutral skeleton with no document metadata or item count. `hidden`
renders no MOB-03a surface. Missing consent renders a neutral unavailable state
and never implies approval.

The surface must support Albanian, Macedonian, and English copy, keyboard and
screen-reader use, 320-pixel mobile layouts, loading-safe server rendering,
empty state, and unavailable state. It must preserve existing clarity markers.

## Likely Change Surface

Implementation may touch only the narrow member read/display path and focused
tests, likely:

- `packages/domain-claims/src/claims/` for a pure display-model mapper;
- `apps/web/src/features/claims/tracking/server/` for the tenant- and
  member-scoped read;
- `apps/web/src/features/claims/tracking/types.ts` for the DTO;
- `apps/web/src/features/member/claims/components/` for one focused card;
- `apps/web/src/app/[locale]/(app)/member/claims/[id]/page.tsx` only if needed
  to serialize the approved DTO;
- `messages/sq.json`, `messages/mk.json`, and `messages/en.json` for reviewed
  copy;
- focused unit, integration, accessibility, and member-route E2E tests.

Every new or substantially refactored production file must remain at or below
150 lines. Existing oversized files must not grow when a focused component or
helper can carry the change.

## Acceptance Evidence

The implementation must prove:

1. `vehicle` and `property` claims render the safe DTO; `injury`, medical,
   travel, unknown, and erased subjects fail closed.
2. The read filters by tenant, member, claim, document, consent purpose, and
   subject; latest consent selection uses `recordedAt DESC, id DESC`.
3. Withdrawn and missing consent never render granted copy or version data.
4. The client receives none of the forbidden fields.
5. The implementation imports or calls no writer, upload, storage, share-pack,
   signed-URL, mutation, event, or outbox path.
6. Albanian, Macedonian, and English copy passes i18n integrity.
7. The card works by keyboard and screen reader at desktop and 320-pixel mobile
   width.
8. Existing `/member`, `/agent`, `/staff`, and `/admin` clarity-marker gates
   remain green.

The persisted acceptance sources are the existing tenant-scoped rows listed in
the read-model contract. Unit fixtures may prove mapper behavior, but they
cannot substitute for DB-access, tenant-isolation, or browser evidence.

## Reviewer Finding Disposition

Gemini's first review found the missing deterministic consent tie-break, erased
response state, shared-account risk wording, and line-count proof. The gate
adopts those corrections. Its rerun also found the duplicated item `state` and
`consentStatus`; the gate removes `state` and keeps `consentStatus` as the sole
item-level consent state.

The rerun proposed blocking runtime consent display because the reviewer portal
account is shared. The gate rejects that linkage. The reviewer account produced
the governance receipts; it does not produce or authenticate runtime consent
rows. Runtime display reads the existing tenant-, subject-, claim-, document-,
and purpose-scoped consent table. Sanja's boundary confirmation and Gazmend's
personal review provide the explicit human attestation for this gate, while the
shared account remains a non-repudiation limitation on the governance artifact.
This limitation requires `REC-02` before future evidence intake but does not
change the truth or authorization rules for persisted runtime consent rows.

Design-review routes on 2026-07-12:

- Sonnet 4.6: `blocked` after `1775 ms`; Claude session limit.
- Gemini 3.1 Pro Preview: `ran` after the trusted-workspace retry. The first
  pass (`57325 ms`) found deterministic tie-break, erased-state, shared-account
  wording, and line-count gaps; the gate adopted the concrete fixes.
- Gemini remediation rerun: `ran` in `54751 ms`. It confirmed those fixes,
  found the duplicated consent-state fields, and repeated the shared-account
  objection. The gate removed the duplicate field and rejected the runtime
  linkage for the reasons above.
- Opus 4.8 escalation: `blocked` after `2308 ms`; Claude session limit.

The unresolved review item is therefore a documented governance-evidence
attribution risk, not a runtime consent-source ambiguity. Tier 3 implementation
and merge still require the human approval stated below.

## Security, Privacy, And Operations

This slice adds no data store, writer, audit row, analytics event, external
provider call, background job, or alert. Existing Sentry instrumentation may
record bounded operation failure, but it must not add document, consent, or
subject metadata to logs or tags.

Expected failures return a neutral unavailable or empty state. Unexpected read
failures preserve the existing page failure boundary and must not leak row
existence across tenants. Concurrent consent changes are resolved by
`recordedAt DESC, id DESC`. The server uses the primary key only as an internal
deterministic tie-breaker and does not expose it.

Rollback removes the new card, DTO, query, copy, and tests. No data rollback is
needed because this slice has no writer or migration.

## Review And Verification

Before implementation, run one bounded senior design review because the slice
is privacy- and tenant-sensitive. Implementation requires focused mapper/query
tests, DB-access guard proof, modularity guard, i18n checks, member browser proof,
canonical-role no-regression proof, diff-scoped security review, and the final
Phase C gates:

```text
pnpm pr:verify
pnpm security:guard
pnpm e2e:gate
```

Verification must also record `wc -l` for every touched TS/TSX file and run
`pnpm check:modularity-guard` before the final gates.

Tier 3 merge requires human approval or an explicit written waiver.

## Stop Conditions And Non-Goals

Stop and return to current authority if implementation needs:

- medical or injury data;
- document content, name, ID, link, URL, path, download, upload, or storage;
- legal-category display without a public/private classifier;
- any writer, status mutation, event, outbox, schema, RLS, or migration;
- auth, proxy, routing, session, tenancy, or canonical-route changes;
- sponsor, payer, partner, external-party, staff, agent, admin, KS, or AL UI;
- billing, payment, Paddle, Agreement Ceremony, POA/e-sign, live AI, or broad
  `MOB-03` behavior.

Named reviewer accounts and role-scoped assignment inboxes are a future
`REC-02` candidate. This gate does not promote `REC-02` or change reviewer
authentication.

## Resolver Effect

After this gate lands in the canonical program and tracker, the expected
resolver state is:

```text
status: ready
activeSlice: MOB-03a
```

No other implementation slice is active.
