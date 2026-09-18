---
plan_role: input
status: active
source_of_truth: false
owner: platform
last_reviewed: 2026-09-18
---

# Requirement disposition map

> Status: Maintained requirement inventory; the current program and tracker alone govern execution.

This is the requirement index maintained by the canonical [program](current-program.md) and
[tracker](current-tracker.md), not a second execution queue. It preserves the full enterprise
backlog after pilot readiness. Ordering and active scope remain in those two canonical files.

## Baseline and evidence rules

- Source: SRS v0.9 Approved Decisions Integration Review, 2026-08-17;
  SHA-256 `8bc2b69c9babf8f228941378a01a32340f23d3ff061f92c574a9a908472981a2`.
- Retrievable owner-held source, relative to the owner's macOS home:
  `Documents/Codex/2026-07-28/referenced-chatgpt-conversation-this-is-untrusted/outputs/srs-v09/Interdomestik_IDA_Enterprise_SRS_v0.9_Approved_Decisions_Integration_Review.docx`.
  The owner supplied this document; its hash was rechecked on 2026-09-15. It is not bundled
  into the repository. On another host, obtain the matching document from the product owner
  before reconciling an affected normative clause; never infer it from the title alone.
- Requirement IDs and titles reuse the historical
  `Interdomestik_IDA_SRS_v0.9_As_Built_Audit.csv` (2026-08-17). Its 510 unique IDs
  were compared with all 510 IDs in the source DOCX: exact match.
  Titles are navigation labels, not substitutes for normative acceptance clauses.
  The CSV is in the same owner's `outputs/srs-v09-as-built-audit/` directory; the DOCX,
  not that historical audit, supplies normative wording.
- Source maturity is retained: Canonical means an SRS constraint, NOT implemented;
  Target means a target requirement, NOT post-pilot authorization.
- Scope classification and delivery evidence are independent. A pilot-required requirement
  may already be partly implemented. Do not rebuild it merely because full acceptance is unresolved.
- `pilot-required`: directly implicated by the adopted roadmap/invariants, requiring evidence
  for the exercised pilot scope. This does not automatically import every broader SRS target.
- `already-delivered`: exact requirement acceptance tied to a current valid delivery receipt;
  static source matches and a DONE parent milestone are insufficient.
- `owner-approved-post-pilot`: requires a cited owner decision, reason and revisit trigger.
  No such per-requirement deferrals have been established here; NONE are inferred.
- `unresolved`: retained enterprise requirement needing scope and/or receipt reconciliation;
  neither missing implementation nor approved exclusion. The possible destination is triage guidance,
  not a dependency, approved successor or claim that the entire requirement belongs to that slice.
- No whole SRS requirement is marked delivered from the August static audit. Its evidence can
  help locate code, but it is not current runtime or user acceptance. Delivered product increments
  are explicitly credited below without promoting them into unsupported requirement completion.

## Pilot and post-pilot views

### Three independent readiness dimensions

Each requirement row records three separate fields in the order `status; evidence; accountable owner`:

- **Software:** functionality, UI/UX, integrations and technical controls. Evidence identifies the
  applicable source, tested behavior and delivery receipt; merged code alone does not prove usability.
- **Operational:** people, staffing, procedures, training, support and escalation. Evidence identifies
  the accepted procedure and exercised operational scenario, with an actual accountable person or team.
- **Business:** approved service scope, terms, consent, partner arrangements and financial
  responsibilities. Evidence identifies the applicable decision/approval and its scope and conditions.

Use `unresolved`, `in-progress`, `satisfied` or `not-applicable` independently in each dimension.
`unresolved; not recorded; unassigned` is the initial state: applicability, evidence and ownership
have not been reconciled; it does not mean the capability is absent or an owner does not exist.
Replace each component only from actual evidence; do not assign the chief as the business approver
or presume that all three dimensions apply equally to every technical requirement.
`not-applicable` requires a recorded rationale and accountable disposition, not an empty field.
`satisfied` requires scoped evidence and recorded accountability. Keep sensitive evidence in its
approved location and link a safe reference rather than copying personal data into this map.

A whole requirement may be marked `already-delivered` only when every applicable dimension is
`satisfied`, every non-applicable dimension is justified, and its acceptance evidence is valid.
Changing a requirement's pilot/post-pilot disposition does not satisfy its readiness dimensions.
Prepare operational and business requirements alongside dependent software slices; S14 verifies
the combined readiness, not the first preparation of staffing, terms or procedures. No new approval
ceremony or blanket prerequisite is introduced: reuse accepted evidence and resolve only actual gaps.

Initial disposition: 42 pilot-required; 468 unresolved;
0 whole-requirement delivered claims; 0 owner-approved post-pilot deferrals.
This is a complete inventory with conservative initial disposition, NOT a completed
510-requirement acceptance audit or a declaration that the entire unresolved set blocks S1–S3.

The pilot view is every `pilot-required` row plus only unresolved requirements affecting the
selected pilot services/roles. The post-pilot view contains only approved deferrals; until approved,
potential future features remain in the unresolved view. Before pilot admission, resolve all
unresolved applicability for the chosen pilot boundary. Do not silently drop the remainder.

For every selected slice, reconcile only affected rows, preserving full requirement coverage:
record exact source/test/PR/merge evidence, outstanding UI/operational acceptance, and any scoped
decision. Reuse unchanged evidence; reopen only changed or ambiguous contracts. At completion update
this map and the tracker in normal delivery, without another status system or closeout PR.

## Credited delivery, without whole-requirement overclaim

| Delivered increment         | Receipt                                                                                                                                                                              | Requirement links to reconcile        | Remaining acceptance                                                                 |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------- | ------------------------------------------------------------------------------------ |
| Unified shell/navigation    | Current program, PR #1770                                                                                                                                                            | IDA-CTX-003; IDA-CTR-039              | All role journeys, not just shell                                                    |
| Member overview entry       | PR #1775, 55875e31b024e6ac9f4648f106be3bfea96facbd                                                                                                                                   | IDA-NFR-008; IDA-CAS-007              | Whole member journey/user acceptance                                                 |
| Member workspace redesign   | PR #1776, 06d90f570d8757764a9fac8124ee924bd3b8aa1f                                                                                                                                   | IDA-NFR-006; IDA-NFR-007; IDA-NFR-008 | Criterion-level accessibility and user acceptance                                    |
| Member detail continuity    | PR #1777, b5a234b30b9cb6ed89ae6d81b81960a3a8135b25                                                                                                                                   | IDA-CAS-007; IDA-COM-005; IDA-NFR-008 | Cross-role acceptance; completed S1 correction credited below                        |
| Member upload localization  | PR #1778, 81a219608dacf4ee9cfd8ee9f201e8ab156e54d2                                                                                                                                   | IDA-NFR-007; IDA-DOC-012              | EN/SQ/MK/SR upload and consent copy credited; S3/S6/S7 cross-role acceptance remains |
| S1 agent message visibility | PR #1780, f3d36b2e7781654fe5448fab11da891368d95f19; 13 exact-main checks                                                                                                             | IAM/COM/CRM visibility clauses        | Bounded query/render exclusion only; broader role acceptance remains                 |
| S2 branch overview scope    | PR #1781, de15d4cac87d7ba6ce15d98c75069445bb84dcb4; 13 exact-main checks                                                                                                             | TEN/IAM/RPT/KPI scope clauses         | Bounded branch route/query protection only; full oversight remains                   |
| Help Now / Trip Mode        | [MOB-01 #1296/#1297 receipt](../product/2026-07-03-mob-dg01-help-now-trip-mode-gate-packet.md); [vehicle #1347 receipt](2026-07-14-ida-dg09-complete-public-help-now-journey-map.md) | DIA/SVC/AST clauses                   | Reconcile selected corridor/pack/guidance acceptance; no whole-domain completion     |
| Core M0–M5                  | Architecture tracker recorded milestones                                                                                                                                             | TEN/IAM/CAS/BHV/CTR clauses           | Consumer conformance and individual acceptance; do not rebuild core                  |

## Architecture frontier retained

| Item                          | Disposition                  | Destination / limitation                                                       |
| ----------------------------- | ---------------------------- | ------------------------------------------------------------------------------ |
| T410 parent                   | unresolved                   | Bounded notification/convention receipts credited; reconcile remaining clauses |
| T411                          | unresolved                   | Keep SVC-CORE/FLIGHT-03 dependencies; pilot necessity requires scope decision  |
| SVC-CORE / SVC-06             | pilot-required               | H1 priority lane; implement only first unmet clause                            |
| SVC-CORE-b                    | unresolved                   | Reconcile stale TODO against loader delivery; do not rebuild                   |
| T310                          | unresolved                   | Branding acceptance only where exercised; not a blanket journey gate           |
| T115 / OD17                   | unresolved                   | Credit front door; separate outstanding performance disposition                |
| Remaining SVC / FLIGHT / CQRS | unresolved                   | Existing architecture tracker retains exact edges; no automatic deferral       |
| T116 / T117 / T118 / T210     | already-delivered increments | Existing tracker receipts; no claim of complete role journeys                  |

## Acceptance links for existing outcomes

Owner-adopted 2026-09-16: the complete clause/acceptance reconciliation preserves all 510 IDs,
42 pilot-required/468 unresolved dispositions and every readiness value below. Links refine
selection evidence, not product scope. Full source/audit remains owner-held; no private bundle is
committed. The [program](current-program.md#acceptance-links-adopted-on-2026-09-16) controls
ordering, operating outputs and unresolved owner choices. No 43-slice queue is adopted.

| Source clauses                        | Existing destination and acceptance link                                                                                                    |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| DIA-001–008, DIA-019                  | S5/S6 preparation: corridor/context and reviewed signed pack metadata, integrity/expiry, retry/recovery; reconcile scoped locale authority. |
| DIA-009–012                           | H1 scene guidance; DIA-010 also S6 Trip Mode: identical reviewed police/EAS rules.                                                          |
| DIA-013–015, SVC-040                  | Later S5/S7 handoff: validated permitted facts, consent/authority recheck, recipient acknowledgement; never expand S3/S4.                   |
| DIA-016/018; DIA-017; DIA-020/SVC-039 | Conditional recovery review and S5/S6 truthful marketing; OD-18 conditional sponsor; minimized analytics at first consumer.                 |
| SVC-001–008                           | SVC-CORE: versioned definitions/schema/consent, source/reviewer/expiry and fail-dark; credit delivered loader.                              |
| SVC-009–011 / SVC-01                  | Legal-basis orientation, uncertain/conflicting evidence; no binding legal finding.                                                          |
| SVC-012–014 / SVC-02                  | Country/phase/version procedure and uncertainty; no unauthorized contact.                                                                   |
| SVC-015–017 / SVC-03                  | Injury: medical consent and qualified human review.                                                                                         |
| SVC-018–020 / SVC-04                  | Vehicle phases, evidence/valuation delta, human valuation and signed consent.                                                               |
| SVC-021–023 / SVC-05                  | Invalidity: member-only signed tables and appointed final reviewer.                                                                         |
| SVC-024–026 / SVC-06                  | H1: safety/no-login, police stops, on-call/fallback/hotfix.                                                                                 |
| SVC-027–029 / SVC-07                  | Expertise: credentials/conflicts/purpose/cost/payer/member approval and expiring case grant.                                                |
| SVC-030–032 / SVC-08                  | Discounts: versioned eligibility/entity/tax/agreement and net fee disclosure.                                                               |
| SVC-033–035 / SVC-09                  | Court: viability/limitation/refusal/member/cost/mandate gates and tracked proceedings; retain OD-13 e-filing exclusion.                     |
| SVC-036–038 / SVC-10                  | Legal handoff: partner agreement, scoped custody, acknowledgement/revocation and work product.                                              |
| MEM; CRM                              | S6/S9 access/lifecycle and S8/S9 consent/dedup/retention/handoff exceptions; no blanket S6↔S9 dependency, no S9 campaigns.                  |
| CAS/COM; FIN/DOC/REC                  | S7 insurer/task exceptions; finance/privacy/recovery outputs before dependent actions; S13 truthful closure, not new mechanics.             |
| TEN/IAM/BHV; SEC/NFR/OPS/VAL/TST      | S10–S12 exercised role/governance boundaries; cross-cutting and BR/SOD controls at each consumer, assembled at S14.                         |
| VON; RPT/KPI/INT/AI/MIG/CTR           | Preserve FLIGHT/T-411/CQRS edges; reconcile only selected analytics/interface/AI/import consumers and their operating evidence.             |

All individual services retain their exact [architecture tracker](architecture-finalization-tracker-2026-05-29.md)
dependencies. H1 does not absorb the other nine services; VONESA is not an eleventh renewed service.
Approved OD policy is reused, while output acceptance remains distinct. Only unsettled inclusion
or actual authority conflicts require owner disposition; unselected is not approved post-pilot.

## Full SRS index

In the evidence column, `open` means no complete requirement acceptance is asserted.
Before marking a row delivered, replace it with the exact receipt and any residual gap.
For a deferral, record the actual approval and rationale; a blank approval is not consent.

`U` expands to `unresolved; not recorded; unassigned` in each readiness field. Replace it with
explicit status, evidence and owner when reconciled. The table omits alignment padding to avoid
storing repeated whitespace across 510 rows; no requirement or readiness field is omitted.

<!-- prettier-ignore -->
| Requirement | Title | Source maturity | Disposition | Possible destination | Evidence / gap | Deferral approval | Software readiness / evidence / owner | Operational readiness / evidence / owner | Business readiness / evidence / owner |
| ----------- | ----------------------------------------- | --------------- | -------------- | ------------------------ | -------------- | ----------------- | ------------------------------------- | ---------------------------------------- | ------------------------------------- |
| IDA-GOV-001 | Canonical authority precedence | Canonical | unresolved | S14 | open | none | U | U | U |
| IDA-GOV-002 | No self-promotion | Canonical | unresolved | S14 | open | none | U | U | U |
| IDA-GOV-003 | Versioned baseline | Target | unresolved | S14 | open | none | U | U | U |
| IDA-GOV-004 | Change impact | Target | unresolved | S14 | open | none | U | U | U |
| IDA-GOV-005 | Normative language | Target | unresolved | S14 | open | none | U | U | U |
| IDA-GOV-006 | Requirement attributes | Target | unresolved | S14 | open | none | U | U | U |
| IDA-GOV-007 | Open decisions separation | Target | unresolved | S14 | open | none | U | U | U |
| IDA-GOV-008 | Evidence-based closure | Target | unresolved | S14 | open | none | U | U | U |
| IDA-GOV-009 | As-built versus target | Target | unresolved | S14 | open | none | U | U | U |
| IDA-GOV-010 | Sensitive source handling | Canonical | unresolved | S14 | open | none | U | U | U |
| IDA-CTX-001 | Product definition | Target | unresolved | S5/S14 | open | none | U | U | U |
| IDA-CTX-002 | Neutral public gateway | Canonical | pilot-required | S5/S14 | open | none | U | U | U |
| IDA-CTX-003 | Canonical portals | Canonical | pilot-required | S5/S14 | open | none | U | U | U |
| IDA-CTX-004 | Proxy authority | Canonical | pilot-required | S5/S14 | open | none | U | U | U |
| IDA-CTX-005 | External systems untrusted | Canonical | unresolved | S5/S14 | open | none | U | U | U |
| IDA-CTX-006 | System-of-record clarity | Target | unresolved | S5/S14 | open | none | U | U | U |
| IDA-CTX-007 | No ambient authority | Canonical | unresolved | S5/S14 | open | none | U | U | U |
| IDA-CTX-008 | Degraded-mode disclosure | Target | unresolved | S5/S14 | open | none | U | U | U |
| IDA-CTX-009 | Business scope boundaries | Target | unresolved | S5/S14 | open | none | U | U | U |
| IDA-CTX-010 | Country expansion control | Target | unresolved | S5/S14 | open | none | U | U | U |
| IDA-TEN-001 | Home tenant | Canonical | unresolved | S2/S10–S12 | open | none | U | U | U |
| IDA-TEN-002 | Access tenant distinction | Canonical | unresolved | S2/S10–S12 | open | none | U | U | U |
| IDA-TEN-003 | Legal tenant distinction | Canonical | unresolved | S2/S10–S12 | open | none | U | U | U |
| IDA-TEN-004 | Recovery entity distinction | Canonical | unresolved | S2/S10–S12 | open | none | U | U | U |
| IDA-TEN-005 | Explicit context naming | Canonical | unresolved | S2/S10–S12 | open | none | U | U | U |
| IDA-TEN-006 | Conflict fail-closed | Canonical | pilot-required | S2/S10–S12 | open | none | U | U | U |
| IDA-TEN-007 | Country host alias | Canonical | unresolved | S2/S10–S12 | open | none | U | U | U |
| IDA-TEN-008 | Branch scoping | Canonical | pilot-required | S2/S10–S12 | open | none | U | U | U |
| IDA-TEN-009 | Case-scoped grant | Canonical | unresolved | S2/S10–S12 | open | none | U | U | U |
| IDA-TEN-010 | No profile broadening | Canonical | unresolved | S2/S10–S12 | open | none | U | U | U |
| IDA-TEN-011 | Entity migration | Canonical | unresolved | S2/S10–S12 | open | none | U | U | U |
| IDA-TEN-012 | Tenant lifecycle audit | Target | unresolved | S2/S10–S12 | open | none | U | U | U |
| IDA-TEN-013 | Validated tenant selection | Canonical | unresolved | S2/S10–S12 | open | none | U | U | U |
| IDA-TEN-014 | Tenant cache isolation | Canonical | unresolved | S2/S10–S12 | open | none | U | U | U |
| IDA-IAM-001 | Authentication boundary | Canonical | pilot-required | S1/S8/S11–S12 | open | none | U | U | U |
| IDA-IAM-002 | Authentication is not authorization | Canonical | unresolved | S1/S8/S11–S12 | open | none | U | U | U |
| IDA-IAM-003 | Exercised role | Canonical | unresolved | S1/S8/S11–S12 | open | none | U | U | U |
| IDA-IAM-004 | Role catalogue | Canonical | unresolved | S1/S8/S11–S12 | open | none | U | U | U |
| IDA-IAM-005 | Technical admin boundary | Canonical | pilot-required | S1/S8/S11–S12 | open | none | U | U | U |
| IDA-IAM-006 | Governance separation of duties | Canonical | unresolved | S1/S8/S11–S12 | open | none | U | U | U |
| IDA-IAM-007 | Support read orientation | Canonical | unresolved | S1/S8/S11–S12 | open | none | U | U | U |
| IDA-IAM-008 | Auditor read orientation | Canonical | unresolved | S1/S8/S11–S12 | open | none | U | U | U |
| IDA-IAM-009 | Agent access | Canonical | pilot-required | S1/S8/S11–S12 | open | none | U | U | U |
| IDA-IAM-010 | Member ownership | Target | pilot-required | S1/S8/S11–S12 | open | none | U | U | U |
| IDA-IAM-011 | Privileged MFA | Target | unresolved | S1/S8/S11–S12 | open | none | U | U | U |
| IDA-IAM-012 | Session security | Target | unresolved | S1/S8/S11–S12 | open | none | U | U | U |
| IDA-IAM-013 | Account recovery | Target | unresolved | S1/S8/S11–S12 | open | none | U | U | U |
| IDA-IAM-014 | Break-glass | Canonical | unresolved | S1/S8/S11–S12 | open | none | U | U | U |
| IDA-IAM-015 | Unknown role fail-closed | Canonical | pilot-required | S1/S8/S11–S12 | open | none | U | U | U |
| IDA-IAM-016 | Role review | Target | unresolved | S1/S8/S11–S12 | open | none | U | U | U |
| IDA-FST-001 | Eligible local continuity | Canonical | unresolved | S5 | open | none | U | U | U |
| IDA-FST-002 | Injury exclusion | Canonical | unresolved | S5 | open | none | U | U | U |
| IDA-FST-003 | No anonymous server identity | Canonical | unresolved | S5 | open | none | U | U | U |
| IDA-FST-004 | Local disclosure | Target | unresolved | S5 | open | none | U | U | U |
| IDA-FST-005 | Schema validation | Canonical | unresolved | S5 | open | none | U | U | U |
| IDA-FST-006 | Stale-tab protection | Canonical | unresolved | S5 | open | none | U | U | U |
| IDA-FST-007 | Automatic eligible recovery | Canonical | unresolved | S5 | open | none | U | U | U |
| IDA-FST-008 | Verified secure save | Canonical | pilot-required | S5 | open | none | U | U | U |
| IDA-FST-009 | Delete after confirmed save | Canonical | unresolved | S5 | open | none | U | U | U |
| IDA-FST-010 | No automatic claim conversion | Canonical | unresolved | S5 | open | none | U | U | U |
| IDA-FST-011 | Review before handoff | Canonical | pilot-required | S5 | open | none | U | U | U |
| IDA-FST-012 | Owner isolation | Canonical | pilot-required | S5 | open | none | U | U | U |
| IDA-FST-013 | Draft deletion | Canonical | unresolved | S5 | open | none | U | U | U |
| IDA-FST-014 | No representation implication | Target | unresolved | S5 | open | none | U | U | U |
| IDA-MEM-001 | Offer and proof separation | Canonical | unresolved | S6/S9 | open | none | U | U | U |
| IDA-MEM-002 | Entity-of-record snapshot | Canonical | unresolved | S6/S9 | open | none | U | U | U |
| IDA-MEM-003 | No ambient entity recomputation | Canonical | unresolved | S6/S9 | open | none | U | U | U |
| IDA-MEM-004 | Plan versioning | Target | unresolved | S6/S9 | open | none | U | U | U |
| IDA-MEM-005 | Price disclosure | Target | unresolved | S6/S9 | open | none | U | U | U |
| IDA-MEM-006 | Provider confirmation | Target | unresolved | S6/S9 | open | none | U | U | U |
| IDA-MEM-007 | Idempotent activation | Canonical | unresolved | S6/S9 | open | none | U | U | U |
| IDA-MEM-008 | Lifecycle states | Canonical | unresolved | S6/S9 | open | none | U | U | U |
| IDA-MEM-009 | Grace and dunning | Target | unresolved | S6/S9 | open | none | U | U | U |
| IDA-MEM-010 | Cancellation | Target | unresolved | S6/S9 | open | none | U | U | U |
| IDA-MEM-011 | Refund | Target | unresolved | S6/S9 | open | none | U | U | U |
| IDA-MEM-012 | Member proof content | Canonical | unresolved | S6/S9 | open | none | U | U | U |
| IDA-MEM-013 | Matter allowance | Target | unresolved | S6/S9 | open | none | U | U | U |
| IDA-MEM-014 | Group privacy | Target | unresolved | S6/S9 | open | none | U | U | U |
| IDA-MEM-015 | Attribution read-only | Canonical | unresolved | S6/S9 | open | none | U | U | U |
| IDA-MEM-016 | Renewal evidence | Target | unresolved | S6/S9 | open | none | U | U | U |
| IDA-AST-001 | Rules-first assistance | Canonical | unresolved | H1 | open | none | U | U | U |
| IDA-AST-002 | Outcome taxonomy | Canonical | unresolved | H1 | open | none | U | U | U |
| IDA-AST-003 | Pack provenance | Canonical | unresolved | H1 | open | none | U | U | U |
| IDA-AST-004 | Help Now no-PII start | Canonical | unresolved | H1 | open | none | U | U | U |
| IDA-AST-005 | Safety-first guidance | Target | unresolved | H1 | open | none | U | U | U |
| IDA-AST-006 | No professional advice | Canonical | unresolved | H1 | open | none | U | U | U |
| IDA-AST-007 | Country rule metadata | Canonical | unresolved | H1 | open | none | U | U | U |
| IDA-AST-008 | Confidence floor | Canonical | unresolved | H1 | open | none | U | U | U |
| IDA-AST-009 | Human-review authority | Canonical | unresolved | H1 | open | none | U | U | U |
| IDA-AST-010 | Green Card separation | Canonical | unresolved | H1 | open | none | U | U | U |
| IDA-AST-011 | Invalidity review boundary | Canonical | unresolved | H1 | open | none | U | U | U |
| IDA-AST-012 | No automatic handoff | Canonical | unresolved | H1 | open | none | U | U | U |
| IDA-AST-013 | Explicit escalation consent | Target | unresolved | H1 | open | none | U | U | U |
| IDA-AST-014 | Alert coverage | Target | unresolved | H1 | open | none | U | U | U |
| IDA-AST-015 | Content hotfix | Target | unresolved | H1 | open | none | U | U | U |
| IDA-AST-016 | Country release hold | Target | unresolved | H1 | open | none | U | U | U |
| IDA-DIA-001 | Diaspora persona boundary | Canonical | unresolved | S5/S6; see acceptance links | open | none | U | U | U |
| IDA-DIA-002 | User-selected corridor | Canonical | unresolved | S5/S6; #1790 proves explicit guidance-country/no fallback; #1792 source `757aa623` captures origin/destination and zero-to-12 ordered transit values over `CountryCodeSchema`; selected S5.e discloses pack status from that explicit corridor only; persistence/handoff open | open | Tracker receipt; source `757aa623` full proof and exact-main `e8142453` health passed; S5.e capacity approved and product proof in progress. | U | U | U |
| IDA-DIA-003 | Locale independent from country pack | Canonical | unresolved | S5/S6; #1792 source `757aa623` preserves guidance/corridor query values across EN/SQ/MK/SR locale changes; selected S5.e requires equivalent locale-independent pack-status disclosure; pack/content and non-software readiness open | open | Tracker receipt; source full proof and exact-main `e8142453` health passed; S5.e capacity approved and product proof in progress. | U | U | U |
| IDA-DIA-004 | Signed pack requirement | Canonical | unresolved | S5/S6; selected S5.e may disclose only the existing Help Now exposure predicate and cannot claim current/versioned/integrity/expiry readiness; full contract remains a later direct dependency | open | Existing fail-closed registry predicate credited; MOB-01b/MK receipt does not satisfy the signed/current/versioned/integrity/expiry contract; S5.e product proof in progress. | U | U | U |
| IDA-DIA-005 | Unsigned pack fail-closed | Canonical | unresolved | S5/S6; selected S5.e keeps dark, unaccepted, unsigned and unregistered corridor entries unavailable without fallback; expired/withdrawn/integrity-failed contracts remain open | open | Capacity approved; S5.e fail-closed product proof in progress. | U | U | U |
| IDA-DIA-006 | Explicit offline preparation | Target | unresolved | S5/S6; see acceptance links | open | none | U | U | U |
| IDA-DIA-007 | Offline integrity verification | Canonical | unresolved | S5/S6; see acceptance links | open | none | U | U | U |
| IDA-DIA-008 | Offline failure recovery | Target | unresolved | S5/S6; see acceptance links | open | none | U | U | U |
| IDA-DIA-009 | Emergency and police source freshness | Canonical | unresolved | H1; see acceptance links | open | none | U | U | U |
| IDA-DIA-010 | Police versus EAS hard stop | Canonical | unresolved | H1/S6; see acceptance links | open | none | U | U | U |
| IDA-DIA-011 | Bilingual EAS companion | Target | unresolved | H1; see acceptance links | open | none | U | U | U |
| IDA-DIA-012 | No-PII initial guidance | Canonical | unresolved | H1; see acceptance links | open | none | U | U | U |
| IDA-DIA-013 | Incident-country capture | Canonical | unresolved | S5/S7; see acceptance links | open | none | U | U | U |
| IDA-DIA-014 | Diaspora provenance | Canonical | unresolved | S5/S7; see acceptance links | open | none | U | U | U |
| IDA-DIA-015 | Zero-repeat bounded handoff | Target | unresolved | S5/S7; see acceptance links | open | none | U | U | U |
| IDA-DIA-016 | Cross-border authority resolution | Canonical | unresolved | conditional recovery; see acceptance links | open | none | U | U | U |
| IDA-DIA-017 | Gift membership privacy | Target | unresolved | conditional S6/S9; see acceptance links | open | none | U | U | U |
| IDA-DIA-018 | Cross-border promise control | Canonical | unresolved | S5/S6; conditional recovery; see acceptance links | open | none | U | U | U |
| IDA-DIA-019 | Diaspora localization | Target | unresolved | S5/S6; see acceptance links | open | none | U | U | U |
| IDA-DIA-020 | Minimized diaspora analytics | Canonical | unresolved | selected analytics; see acceptance links | open | none | U | U | U |
| IDA-SVC-001 | Canonical ten-service catalogue | Canonical | unresolved | H1; core; see acceptance links | open | none | U | U | U |
| IDA-SVC-002 | Shared architecture spine | Canonical | unresolved | H1; core; see acceptance links | open | none | U | U | U |
| IDA-SVC-003 | Service zones | Canonical | unresolved | H1; core; see acceptance links | open | none | U | U | U |
| IDA-SVC-004 | Versioned service definition | Target | unresolved | H1; core; see acceptance links | open | none | U | U | U |
| IDA-SVC-005 | Versioned rule packs | Canonical | unresolved | H1; core; see acceptance links | open | none | U | U | U |
| IDA-SVC-006 | Typed assistance outcome | Canonical | unresolved | H1; core; see acceptance links | open | none | U | U | U |
| IDA-SVC-007 | Protective disclosure | Canonical | unresolved | H1; core; see acceptance links | open | none | U | U | U |
| IDA-SVC-008 | Service release gate | Canonical | unresolved | H1; core; see acceptance links | open | none | U | U | U |
| IDA-SVC-009 | Legal-basis orientation | Target | unresolved | SVC-01; see acceptance links | open | none | U | U | U |
| IDA-SVC-010 | Legal-basis uncertainty | Target | unresolved | SVC-01; see acceptance links | open | none | U | U | U |
| IDA-SVC-011 | No final legal opinion | Canonical | unresolved | SVC-01; see acceptance links | open | none | U | U | U |
| IDA-SVC-012 | Procedure phase awareness | Target | unresolved | SVC-02; see acceptance links | open | none | U | U | U |
| IDA-SVC-013 | Procedure provenance | Target | unresolved | SVC-02; see acceptance links | open | none | U | U | U |
| IDA-SVC-014 | Procedure no representation | Canonical | unresolved | SVC-02; see acceptance links | open | none | U | U | U |
| IDA-SVC-015 | Injury explicit consent | Canonical | unresolved | SVC-03; see acceptance links | open | none | U | U | U |
| IDA-SVC-016 | Injury hard stops | Canonical | unresolved | SVC-03; see acceptance links | open | none | U | U | U |
| IDA-SVC-017 | No automated diagnosis | Canonical | unresolved | SVC-03; see acceptance links | open | none | U | U | U |
| IDA-SVC-018 | Vehicle-damage stage model | Target | unresolved | SVC-04; see acceptance links | open | none | U | U | U |
| IDA-SVC-019 | Vehicle-damage evidence | Target | unresolved | SVC-04; see acceptance links | open | none | U | U | U |
| IDA-SVC-020 | Vehicle expert boundary | Canonical | unresolved | SVC-04; see acceptance links | open | none | U | U | U |
| IDA-SVC-021 | Invalidity member boundary | Canonical | unresolved | SVC-05; see acceptance links | open | none | U | U | U |
| IDA-SVC-022 | Invalidity human review | Canonical | unresolved | SVC-05; see acceptance links | open | none | U | U | U |
| IDA-SVC-023 | Invalidity no AI finality | Canonical | unresolved | SVC-05; see acceptance links | open | none | U | U | U |
| IDA-SVC-024 | Help Now free entry | Canonical | unresolved | SVC-06; see acceptance links | open | none | U | U | U |
| IDA-SVC-025 | Help Now safer-path control | Canonical | unresolved | SVC-06; see acceptance links | open | none | U | U | U |
| IDA-SVC-026 | Help Now operational coverage | Canonical | unresolved | SVC-06; see acceptance links | open | none | U | U | U |
| IDA-SVC-027 | Expert appointment | Canonical | unresolved | SVC-07; see acceptance links | open | none | U | U | U |
| IDA-SVC-028 | Expert cost approval | Canonical | unresolved | SVC-07; see acceptance links | open | none | U | U | U |
| IDA-SVC-029 | Expert custody and revocation | Canonical | unresolved | SVC-07; see acceptance links | open | none | U | U | U |
| IDA-SVC-030 | Discount matrix | Canonical | unresolved | SVC-08; see acceptance links | open | none | U | U | U |
| IDA-SVC-031 | Discount timing | Canonical | unresolved | SVC-08; see acceptance links | open | none | U | U | U |
| IDA-SVC-032 | Discount transparency | Target | unresolved | SVC-08; see acceptance links | open | none | U | U | U |
| IDA-SVC-033 | Court escalation prerequisites | Canonical | unresolved | SVC-09; see acceptance links | open | none | U | U | U |
| IDA-SVC-034 | Court no automatic escalation | Canonical | unresolved | SVC-09; see acceptance links | open | none | U | U | U |
| IDA-SVC-035 | Court decision trace | Target | unresolved | SVC-09; see acceptance links | open | none | U | U | U |
| IDA-SVC-036 | Legal partner agreement | Canonical | unresolved | SVC-10; see acceptance links | open | none | U | U | U |
| IDA-SVC-037 | Legal case-scoped access | Canonical | unresolved | SVC-10; see acceptance links | open | none | U | U | U |
| IDA-SVC-038 | Legal handoff lifecycle | Target | unresolved | SVC-10; see acceptance links | open | none | U | U | U |
| IDA-SVC-039 | Service catalogue analytics | Target | unresolved | selected analytics; see acceptance links | open | none | U | U | U |
| IDA-SVC-040 | Service-to-case continuity | Target | unresolved | later S5/S7 handoff; see acceptance links | open | none | U | U | U |
| IDA-VON-001 | First-class vertical | Canonical | unresolved | Flight scope/T411 | open | none | U | U | U |
| IDA-VON-002 | Feature-flag isolation | Canonical | unresolved | Flight scope/T411 | open | none | U | U | U |
| IDA-VON-003 | Shared lifecycle authorities | Canonical | unresolved | Flight scope/T411 | open | none | U | U | U |
| IDA-VON-004 | Rules-first EC261 assessment | Canonical | unresolved | Flight scope/T411 | open | none | U | U | U |
| IDA-VON-005 | Flight-data provider port | Canonical | unresolved | Flight scope/T411 | open | none | U | U | U |
| IDA-VON-006 | Manual data fallback | Target | unresolved | Flight scope/T411 | open | none | U | U | U |
| IDA-VON-007 | Eligibility outcomes | Target | unresolved | Flight scope/T411 | open | none | U | U | U |
| IDA-VON-008 | No compensation guarantee | Canonical | unresolved | Flight scope/T411 | open | none | U | U | U |
| IDA-VON-009 | Flight evidence checklist | Target | unresolved | Flight scope/T411 | open | none | U | U | U |
| IDA-VON-010 | Passenger identity and ownership | Canonical | unresolved | Flight scope/T411 | open | none | U | U | U |
| IDA-VON-011 | Assignment default and POA fallback | Canonical | unresolved | Flight scope/T411 | open | none | U | U | U |
| IDA-VON-012 | No authority no submission | Canonical | unresolved | Flight scope/T411 | open | none | U | U | U |
| IDA-VON-013 | Fee agreement gate | Canonical | unresolved | Flight scope/T411 | open | none | U | U | U |
| IDA-VON-014 | Recovery entity resolution | Canonical | unresolved | Flight scope/T411 | open | none | U | U | U |
| IDA-VON-015 | Submission package | Target | unresolved | Flight scope/T411 | open | none | U | U | U |
| IDA-VON-016 | Acknowledgment and correspondence | Target | unresolved | Flight scope/T411 | open | none | U | U | U |
| IDA-VON-017 | Escalation control | Canonical | unresolved | Flight scope/T411 | open | none | U | U | U |
| IDA-VON-018 | Flight event outbox | Canonical | unresolved | Flight scope/T411 | open | none | U | U | U |
| IDA-VON-019 | Unified member timeline | Target | unresolved | Flight scope/T411 | open | none | U | U | U |
| IDA-VON-020 | Compensation ledger authority | Canonical | unresolved | Flight scope/T411 | open | none | U | U | U |
| IDA-VON-021 | Versioned compensation rules | Canonical | unresolved | Flight scope/T411 | open | none | U | U | U |
| IDA-VON-022 | Direct-payment fallback | Canonical | unresolved | Flight scope/T411 | open | none | U | U | U |
| IDA-VON-023 | No clean close with open fee | Canonical | unresolved | Flight scope/T411 | open | none | U | U | U |
| IDA-VON-024 | Member settlement statement | Target | unresolved | Flight scope/T411 | open | none | U | U | U |
| IDA-VON-025 | AI extraction boundary | Canonical | unresolved | Flight scope/T411 | open | none | U | U | U |
| IDA-VON-026 | Sensitive payload minimization | Canonical | unresolved | Flight scope/T411 | open | none | U | U | U |
| IDA-VON-027 | VONESA reporting | Target | unresolved | Flight scope/T411 | open | none | U | U | U |
| IDA-VON-028 | VONESA audit trail | Canonical | unresolved | Flight scope/T411 | open | none | U | U | U |
| IDA-CLM-001 | Unique intake identifier | Target | unresolved | S3/S5/S7 | S3 candidate proves one real saved/submitted claim retains its exact opaque claim ID and generated claim number through staff and member reads; broader intake acceptance remains open | none | U | U | U |
| IDA-CLM-002 | Incident separation | Target | unresolved | S3/S5/S7 | open | none | U | U | U |
| IDA-CLM-003 | Claimant and participant roles | Target | unresolved | S3/S5/S7 | open | none | U | U | U |
| IDA-CLM-004 | Typed subject facts | Target | unresolved | S3/S5/S7 | open | none | U | U | U |
| IDA-CLM-005 | Minimum data by claim type | Target | unresolved | S3/S5/S7 | open | none | U | U | U |
| IDA-CLM-006 | Duplicate detection | Target | unresolved | S3/S5/S7 | open | none | U | U | U |
| IDA-CLM-007 | No destructive duplicate merge | Target | unresolved | S3/S5/S7 | open | none | U | U | U |
| IDA-CLM-008 | Jurisdiction classification | Canonical | unresolved | S3/S5/S7 | open | none | U | U | U |
| IDA-CLM-009 | Completeness outcome | Target | unresolved | S3/S5/S7 | open | none | U | U | U |
| IDA-CLM-010 | Missing-information request | Target | pilot-required | S3/S4/S5/S7 | S4 source 1acc8cc7 implements assigned-owner request creation in verification, explicit due date, safe member explanation/reference, request-local SLA posture and correlation retries. Opus 5 review has documented dispositions; full isolated proof passes. PR #1786 protected delivery pending. Request-bound upload and staff acknowledgement remain open | Current tracker S4 source-bound receipt | U | U | U |
| IDA-CLM-011 | Conflict-of-interest stop | Target | unresolved | S3/S5/S7 | open | none | U | U | U |
| IDA-CLM-012 | Time-limit posture | Target | unresolved | S3/S5/S7 | open | none | U | U | U |
| IDA-CLM-013 | Fraud/integrity signal | Target | unresolved | S3/S5/S7 | open | none | U | U | U |
| IDA-CLM-014 | Acceptance authority | Target | unresolved | S3/S5/S7 | S3 candidate proves authorized staff acceptance of the exact submitted claim into existing `verification` state on the mounted route; whole acceptance policy and role acceptance remain open | none | U | U | U |
| IDA-CLM-015 | Decline explanation | Target | unresolved | S3/S5/S7 | open | none | U | U | U |
| IDA-CLM-016 | Assignment | Target | unresolved | S3/S5/S7 | open | none | U | U | U |
| IDA-CLM-017 | Claim number authority | Canonical | unresolved | S3/S5/S7 | open | none | U | U | U |
| IDA-CLM-018 | Intake provenance | Target | unresolved | S3/S5/S7 | open | none | U | U | U |
| IDA-CAS-001 | Case/recovery split | Canonical | unresolved | S3/S6/S7/S13 | open | none | U | U | U |
| IDA-CAS-002 | Lifecycle read authority | Canonical | unresolved | S3/S6/S7/S13 | open | none | U | U | U |
| IDA-CAS-003 | Sole transition writer | Canonical | unresolved | S3/S6/S7/S13 | open | none | U | U | U |
| IDA-CAS-004 | Transition validation | Canonical | unresolved | S3/S6/S7/S13 | open | none | U | U | U |
| IDA-CAS-005 | Atomic history | Canonical | unresolved | S3/S6/S7/S13 | S3 candidate asserts the exact transition, first staff assignment and history rows after the real staff action; broader concurrency/retry acceptance remains open | none | U | U | U |
| IDA-CAS-006 | Public/private intent | Canonical | pilot-required | S3/S6/S7/S13 | S3 candidate persists the mounted public transition, adds a core private same-status note, and renders only the public note to a fresh front-door E2E member session. It uses a tenant-selection header, not host-derived proof; broader communication acceptance remains open | none | U | U | U |
| IDA-CAS-007 | Case timeline | Target | pilot-required | S3/S6/S7/S13 | S3 candidate renders the public staff verification note in the returning member's mounted timeline; whole-journey and user acceptance remain open | none | U | U | U |
| IDA-CAS-008 | Internal notes isolation | Target | pilot-required | S3/S6/S7/S13 | S3 candidate proves the core-created private same-status staff note is absent from the exact fresh-session member detail; other roles and surfaces remain open | none | U | U | U |
| IDA-CAS-009 | Submission package | Target | unresolved | S3/S6/S7/S13 | open | none | U | U | U |
| IDA-CAS-010 | Offer/refusal capture | Target | unresolved | S3/S6/S7/S13 | open | none | U | U | U |
| IDA-CAS-011 | Objection approval | Target | unresolved | S3/S6/S7/S13 | open | none | U | U | U |
| IDA-CAS-012 | Case SLA clocks | Target | unresolved | S3/S6/S7/S13 | open | none | U | U | U |
| IDA-CAS-013 | Reopen control | Target | unresolved | S3/S6/S7/S13 | open | none | U | U | U |
| IDA-CAS-014 | Closeout prerequisites | Target | unresolved | S3/S6/S7/S13 | open | none | U | U | U |
| IDA-CAS-015 | Domain event | Canonical | unresolved | S3/S6/S7/S13 | S3 candidate observes exact-claim `case.created` and `claim.status_changed`; relay proof checks PostgreSQL `timestamptz` UTC under `Europe/Berlin`, parses explicit offsets as `Date` and retains audit delivery. Broader event-family acceptance remains open | none | U | U | U |
| IDA-CAS-016 | Event payload minimization | Canonical | unresolved | S3/S6/S7/S13 | open | none | U | U | U |
| IDA-REC-001 | Recovery eligibility | Target | unresolved | S13; recovery scope | open | none | U | U | U |
| IDA-REC-002 | No recovery by recommendation alone | Canonical | unresolved | S13; recovery scope | open | none | U | U | U |
| IDA-REC-003 | Agreement prerequisite | Canonical | unresolved | S13; recovery scope | open | none | U | U | U |
| IDA-REC-004 | POA prerequisite | Target | unresolved | S13; recovery scope | open | none | U | U | U |
| IDA-REC-005 | Revocation | Target | unresolved | S13; recovery scope | open | none | U | U | U |
| IDA-REC-006 | Fee disclosure | Target | unresolved | S13; recovery scope | open | none | U | U | U |
| IDA-REC-007 | Hard-cost consent | Target | unresolved | S13; recovery scope | open | none | U | U | U |
| IDA-REC-008 | Recovery entity snapshot | Canonical | unresolved | S13; recovery scope | open | none | U | U | U |
| IDA-REC-009 | Membership entity independence | Canonical | unresolved | S13; recovery scope | open | none | U | U | U |
| IDA-REC-010 | Professional assignment | Target | unresolved | S13; recovery scope | open | none | U | U | U |
| IDA-REC-011 | Negotiation record | Target | unresolved | S13; recovery scope | open | none | U | U | U |
| IDA-REC-012 | Settlement approval | Target | unresolved | S13; recovery scope | open | none | U | U | U |
| IDA-REC-013 | No-recovery outcome | Target | unresolved | S13; recovery scope | open | none | U | U | U |
| IDA-REC-014 | Court gate | Target | unresolved | S13; recovery scope | open | none | U | U | U |
| IDA-REC-015 | Court lifecycle | Target | unresolved | S13; recovery scope | open | none | U | U | U |
| IDA-REC-016 | Appeal decision | Target | unresolved | S13; recovery scope | open | none | U | U | U |
| IDA-REC-017 | Cross-border handoff | Canonical | unresolved | S13; recovery scope | open | none | U | U | U |
| IDA-REC-018 | Recovery closeout | Target | unresolved | S13; recovery scope | open | none | U | U | U |
| IDA-DOC-001 | Private by default | Target | pilot-required | S3/S6/S7 | open | none | U | U | U |
| IDA-DOC-002 | File validation | Target | unresolved | S3/S6/S7 | open | none | U | U | U |
| IDA-DOC-003 | Parser isolation | Target | unresolved | S3/S6/S7 | open | none | U | U | U |
| IDA-DOC-004 | Classification | Target | unresolved | S3/S6/S7 | open | none | U | U | U |
| IDA-DOC-005 | Medical restriction | Target | unresolved | S3/S6/S7 | open | none | U | U | U |
| IDA-DOC-006 | Legal restriction | Target | unresolved | S3/S6/S7 | open | none | U | U | U |
| IDA-DOC-007 | Versioning | Target | unresolved | S3/S6/S7 | open | none | U | U | U |
| IDA-DOC-008 | Integrity evidence | Target | unresolved | S3/S6/S7 | open | none | U | U | U |
| IDA-DOC-009 | Signed URL | Target | pilot-required | S3/S6/S7 | open | none | U | U | U |
| IDA-DOC-010 | Access log | Target | unresolved | S3/S6/S7 | open | none | U | U | U |
| IDA-DOC-011 | Share pack | Target | unresolved | S3/S6/S7 | open | none | U | U | U |
| IDA-DOC-012 | Purpose-specific consent | Canonical | unresolved | S3/S6/S7 | open | none | U | U | U |
| IDA-DOC-013 | Consent revocation | Target | unresolved | S3/S6/S7 | open | none | U | U | U |
| IDA-DOC-014 | Retention | Target | unresolved | S3/S6/S7 | open | none | U | U | U |
| IDA-DOC-015 | Legal hold | Target | unresolved | S3/S6/S7 | open | none | U | U | U |
| IDA-DOC-016 | DSR | Target | unresolved | S3/S6/S7 | open | none | U | U | U |
| IDA-COM-001 | Communication provenance | Target | unresolved | S1/S3/S6/S7 | open | none | U | U | U |
| IDA-COM-002 | Recipient validation | Target | unresolved | S1/S3/S6/S7 | open | none | U | U | U |
| IDA-COM-003 | Template governance | Target | unresolved | S1/S3/S6/S7 | open | none | U | U | U |
| IDA-COM-004 | Inbound capture | Target | unresolved | S1/S3/S6/S7 | open | none | U | U | U |
| IDA-COM-005 | Thread visibility | Target | pilot-required | S1/S3/S6/S7 | open | none | U | U | U |
| IDA-COM-006 | Task creation | Target | unresolved | S1/S3/S6/S7 | open | none | U | U | U |
| IDA-COM-007 | Task history | Canonical | unresolved | S1/S3/S6/S7 | open | none | U | U | U |
| IDA-COM-008 | Overdue escalation | Target | unresolved | S1/S3/S6/S7 | open | none | U | U | U |
| IDA-COM-009 | SLA definition | Target | unresolved | S1/S3/S6/S7 | open | none | U | U | U |
| IDA-COM-010 | Delivery failure | Target | unresolved | S1/S3/S6/S7 | open | none | U | U | U |
| IDA-COM-011 | Notification preferences | Target | unresolved | S1/S3/S6/S7 | open | none | U | U | U |
| IDA-COM-012 | No sensitive logs | Canonical | unresolved | S1/S3/S6/S7 | open | none | U | U | U |
| IDA-CRM-001 | Consent-aware lead capture | Target | unresolved | S8/S9 | open | none | U | U | U |
| IDA-CRM-002 | Lead provenance | Target | unresolved | S8/S9 | open | none | U | U | U |
| IDA-CRM-003 | Duplicate control | Target | unresolved | S8/S9 | open | none | U | U | U |
| IDA-CRM-004 | Bounded lead profile | Target | unresolved | S8/S9 | open | none | U | U | U |
| IDA-CRM-005 | Pipeline stage contract | Target | unresolved | S8/S9 | open | none | U | U | U |
| IDA-CRM-006 | Owner and branch scope | Target | unresolved | S8/S9 | open | none | U | U | U |
| IDA-CRM-007 | Attribution is not authority | Canonical | unresolved | S8/S9 | open | none | U | U | U |
| IDA-CRM-008 | Approved offer boundary | Target | unresolved | S8/S9 | open | none | U | U | U |
| IDA-CRM-009 | Assisted identity boundary | Target | unresolved | S8/S9 | open | none | U | U | U |
| IDA-CRM-010 | Conversion linkage | Target | unresolved | S8/S9 | open | none | U | U | U |
| IDA-CRM-011 | Service handoff packet | Target | unresolved | S8/S9 | open | none | U | U | U |
| IDA-CRM-012 | Handoff acceptance | Target | unresolved | S8/S9 | open | none | U | U | U |
| IDA-CRM-013 | Suppression and preference | Target | unresolved | S8/S9 | open | none | U | U | U |
| IDA-CRM-014 | Commission evidence | Target | unresolved | S8/S9 | open | none | U | U | U |
| IDA-CRM-015 | CRM reporting minimization | Target | unresolved | S8/S9 | open | none | U | U | U |
| IDA-CRM-016 | Lead retention and disposal | Target | unresolved | S8/S9 | open | none | U | U | U |
| IDA-FIN-001 | Paddle-only pilot | Canonical | pilot-required | S9/S13; billing scope | open | none | U | U | U |
| IDA-FIN-002 | Signed but untrusted | Canonical | unresolved | S9/S13; billing scope | open | none | U | U | U |
| IDA-FIN-003 | Webhook idempotency | Canonical | unresolved | S9/S13; billing scope | open | none | U | U | U |
| IDA-FIN-004 | Append-only ledger | Canonical | unresolved | S9/S13; billing scope | open | none | U | U | U |
| IDA-FIN-005 | Invoice entity binding | Canonical | unresolved | S9/S13; billing scope | open | none | U | U | U |
| IDA-FIN-006 | Recovery fee entity binding | Canonical | unresolved | S9/S13; billing scope | open | none | U | U | U |
| IDA-FIN-007 | Recovered amount basis | Target | unresolved | S9/S13; billing scope | open | none | U | U | U |
| IDA-FIN-008 | No-recovery no-fee evidence | Canonical | unresolved | S9/S13; billing scope | open | none | U | U | U |
| IDA-FIN-009 | Cost allocation | Target | unresolved | S9/S13; billing scope | open | none | U | U | U |
| IDA-FIN-010 | Settlement statement | Target | unresolved | S9/S13; billing scope | open | none | U | U | U |
| IDA-FIN-011 | Payment collection order | Target | unresolved | S9/S13; billing scope | open | none | U | U | U |
| IDA-FIN-012 | Currency handling | Target | unresolved | S9/S13; billing scope | open | none | U | U | U |
| IDA-FIN-013 | Refund reconciliation | Target | unresolved | S9/S13; billing scope | open | none | U | U | U |
| IDA-FIN-014 | Daily exception queue | Target | unresolved | S9/S13; billing scope | open | none | U | U | U |
| IDA-FIN-015 | Monthly reconciliation | Target | unresolved | S9/S13; billing scope | open | none | U | U | U |
| IDA-FIN-016 | Commission independence | Canonical | unresolved | S9/S13; billing scope | open | none | U | U | U |
| IDA-AI-001 | Trusted call context | Canonical | unresolved | AI scope | open | none | U | U | U |
| IDA-AI-002 | Reject fabricated context | Canonical | unresolved | AI scope | open | none | U | U | U |
| IDA-AI-003 | Queue reminting | Canonical | unresolved | AI scope | open | none | U | U | U |
| IDA-AI-004 | Purpose-specific consent | Canonical | unresolved | AI scope | open | none | U | U | U |
| IDA-AI-005 | Data minimization | Target | unresolved | AI scope | open | none | U | U | U |
| IDA-AI-006 | Prompt injection boundary | Target | unresolved | AI scope | open | none | U | U | U |
| IDA-AI-007 | No autonomous mutation | Canonical | unresolved | AI scope | open | none | U | U | U |
| IDA-AI-008 | Provenance | Target | unresolved | AI scope | open | none | U | U | U |
| IDA-AI-009 | Human disposition | Target | unresolved | AI scope | open | none | U | U | U |
| IDA-AI-010 | Evaluation | Target | unresolved | AI scope | open | none | U | U | U |
| IDA-AI-011 | Provider contract | Target | unresolved | AI scope | open | none | U | U | U |
| IDA-AI-012 | AI observability | Canonical | unresolved | AI scope | open | none | U | U | U |
| IDA-INT-001 | Interface register | Target | unresolved | Affected slice/S14 | open | none | U | U | U |
| IDA-INT-002 | Schema validation | Target | unresolved | Affected slice/S14 | open | none | U | U | U |
| IDA-INT-003 | Timeouts | Target | unresolved | Affected slice/S14 | open | none | U | U | U |
| IDA-INT-004 | Retry safety | Target | unresolved | Affected slice/S14 | open | none | U | U | U |
| IDA-INT-005 | Ordering | Canonical | unresolved | Affected slice/S14 | open | none | U | U | U |
| IDA-INT-006 | Callback safety | Target | unresolved | Affected slice/S14 | open | none | U | U | U |
| IDA-INT-007 | External identity | Target | unresolved | Affected slice/S14 | open | none | U | U | U |
| IDA-INT-008 | Manual fallback | Target | unresolved | Affected slice/S14 | open | none | U | U | U |
| IDA-INT-009 | Contract tests | Target | unresolved | Affected slice/S14 | open | none | U | U | U |
| IDA-INT-010 | Secret isolation | Canonical | unresolved | Affected slice/S14 | open | none | U | U | U |
| IDA-SEC-001 | Zero-trust inputs | Canonical | unresolved | All slices/S14 | open | none | U | U | U |
| IDA-SEC-002 | Defense in depth | Canonical | unresolved | All slices/S14 | open | none | U | U | U |
| IDA-SEC-003 | Tenant-scoped query | Canonical | pilot-required | All slices/S14 | open | none | U | U | U |
| IDA-SEC-004 | Privileged connection | Canonical | unresolved | All slices/S14 | open | none | U | U | U |
| IDA-SEC-005 | Service-role containment | Canonical | unresolved | All slices/S14 | open | none | U | U | U |
| IDA-SEC-006 | SQL and command injection | Canonical | unresolved | All slices/S14 | open | none | U | U | U |
| IDA-SEC-007 | CSRF | Target | unresolved | All slices/S14 | open | none | U | U | U |
| IDA-SEC-008 | XSS and content safety | Target | unresolved | All slices/S14 | open | none | U | U | U |
| IDA-SEC-009 | CSP | Canonical | unresolved | All slices/S14 | open | none | U | U | U |
| IDA-SEC-010 | Rate and abuse controls | Target | unresolved | All slices/S14 | open | none | U | U | U |
| IDA-SEC-011 | Sensitive export | Target | unresolved | All slices/S14 | open | none | U | U | U |
| IDA-SEC-012 | Secret scanning | Canonical | pilot-required | All slices/S14 | open | none | U | U | U |
| IDA-SEC-013 | Dependency and code scanning | Canonical | pilot-required | All slices/S14 | open | none | U | U | U |
| IDA-SEC-014 | Protected branches | Canonical | pilot-required | All slices/S14 | open | none | U | U | U |
| IDA-SEC-015 | Supply-chain pinning | Target | unresolved | All slices/S14 | open | none | U | U | U |
| IDA-SEC-016 | Audit integrity | Target | unresolved | All slices/S14 | open | none | U | U | U |
| IDA-SEC-017 | PII redaction | Canonical | unresolved | All slices/S14 | open | none | U | U | U |
| IDA-SEC-018 | Environment isolation | Target | unresolved | All slices/S14 | open | none | U | U | U |
| IDA-SEC-019 | Production access | Target | unresolved | All slices/S14 | open | none | U | U | U |
| IDA-SEC-020 | Vulnerability response | Target | unresolved | All slices/S14 | open | none | U | U | U |
| IDA-NFR-001 | Availability objective | Target | unresolved | All journeys/S14 | open | none | U | U | U |
| IDA-NFR-002 | Interactive performance | Target | unresolved | All journeys/S14 | open | none | U | U | U |
| IDA-NFR-003 | User-perceived load | Target | unresolved | All journeys/S14 | open | none | U | U | U |
| IDA-NFR-004 | Scalability | Target | unresolved | All journeys/S14 | open | none | U | U | U |
| IDA-NFR-005 | Reliability | Target | unresolved | All journeys/S14 | open | none | U | U | U |
| IDA-NFR-006 | Accessibility | Target | pilot-required | All journeys/S14 | open | none | U | U | U |
| IDA-NFR-007 | Localization | Target | pilot-required | All journeys/S14 | open | none | U | U | U |
| IDA-NFR-008 | Usability | Target | pilot-required | All journeys/S14 | open | none | U | U | U |
| IDA-NFR-009 | Maintainability | Canonical | unresolved | All journeys/S14 | open | none | U | U | U |
| IDA-NFR-010 | Observability | Target | unresolved | All journeys/S14 | open | none | U | U | U |
| IDA-NFR-011 | Portability and recovery | Target | unresolved | All journeys/S14 | open | none | U | U | U |
| IDA-NFR-012 | Data quality | Target | unresolved | All journeys/S14 | open | none | U | U | U |
| IDA-NFR-013 | Compatibility | Target | unresolved | All journeys/S14 | open | none | U | U | U |
| IDA-NFR-014 | Time and timezone | Target | unresolved | All journeys/S14 | open | none | U | U | U |
| IDA-OPS-001 | Release candidate checklist | Target | unresolved | S14 | open | none | U | U | U |
| IDA-OPS-002 | Build provenance | Target | unresolved | S14 | open | none | U | U | U |
| IDA-OPS-003 | No implicit launch | Canonical | pilot-required | S14 | open | none | U | U | U |
| IDA-OPS-004 | Feature gating | Target | unresolved | S14 | open | none | U | U | U |
| IDA-OPS-005 | Rollback | Target | pilot-required | S14 | open | none | U | U | U |
| IDA-OPS-006 | Incident response | Target | pilot-required | S14 | open | none | U | U | U |
| IDA-OPS-007 | Help Now on-call | Target | unresolved | S14 | open | none | U | U | U |
| IDA-OPS-008 | Backup | Target | unresolved | S14 | open | none | U | U | U |
| IDA-OPS-009 | Restore test | Target | unresolved | S14 | open | none | U | U | U |
| IDA-OPS-010 | Runbook control | Target | unresolved | S14 | open | none | U | U | U |
| IDA-OPS-011 | Status communication | Target | unresolved | S14 | open | none | U | U | U |
| IDA-OPS-012 | Configuration drift | Target | unresolved | S14 | open | none | U | U | U |
| IDA-MIG-001 | Source inventory | Target | unresolved | Migration scope | open | none | U | U | U |
| IDA-MIG-002 | Data mapping | Target | unresolved | Migration scope | open | none | U | U | U |
| IDA-MIG-003 | Stable legacy identity | Target | unresolved | Migration scope | open | none | U | U | U |
| IDA-MIG-004 | Deduplication | Target | unresolved | Migration scope | open | none | U | U | U |
| IDA-MIG-005 | Status reconciliation | Target | unresolved | Migration scope | open | none | U | U | U |
| IDA-MIG-006 | Financial reconciliation | Target | unresolved | Migration scope | open | none | U | U | U |
| IDA-MIG-007 | Document custody | Target | unresolved | Migration scope | open | none | U | U | U |
| IDA-MIG-008 | Trial migration | Target | unresolved | Migration scope | open | none | U | U | U |
| IDA-MIG-009 | Cutover | Target | unresolved | Migration scope | open | none | U | U | U |
| IDA-MIG-010 | No spreadsheet destruction | Target | unresolved | Migration scope | open | none | U | U | U |
| IDA-RPT-001 | Tenant-safe analytics | Target | unresolved | S10–S12; reporting scope | open | none | U | U | U |
| IDA-RPT-002 | Metric definition | Target | unresolved | S10–S12; reporting scope | open | none | U | U | U |
| IDA-RPT-003 | Pipeline separation | Target | unresolved | S10–S12; reporting scope | open | none | U | U | U |
| IDA-RPT-004 | Lifecycle aging | Target | unresolved | S10–S12; reporting scope | open | none | U | U | U |
| IDA-RPT-005 | Workload | Target | unresolved | S10–S12; reporting scope | open | none | U | U | U |
| IDA-RPT-006 | Financial totals | Target | unresolved | S10–S12; reporting scope | open | none | U | U | U |
| IDA-RPT-007 | Sensitive report control | Target | unresolved | S10–S12; reporting scope | open | none | U | U | U |
| IDA-RPT-008 | Aggregate sponsor view | Target | unresolved | S10–S12; reporting scope | open | none | U | U | U |
| IDA-RPT-009 | Country content dashboard | Target | unresolved | S10–S12; reporting scope | open | none | U | U | U |
| IDA-RPT-010 | Auditability | Target | unresolved | S10–S12; reporting scope | open | none | U | U | U |
| IDA-KPI-001 | Metric contract | Target | unresolved | S10–S12; metric scope | open | none | U | U | U |
| IDA-KPI-002 | Source lineage | Target | unresolved | S10–S12; metric scope | open | none | U | U | U |
| IDA-KPI-003 | Canonical lifecycle basis | Target | unresolved | S10–S12; metric scope | open | none | U | U | U |
| IDA-KPI-004 | Quality status | Target | unresolved | S10–S12; metric scope | open | none | U | U | U |
| IDA-KPI-005 | No silent denominator change | Target | unresolved | S10–S12; metric scope | open | none | U | U | U |
| IDA-KPI-006 | Currency and entity controls | Target | unresolved | S10–S12; metric scope | open | none | U | U | U |
| IDA-KPI-007 | Privacy-safe dimensions | Target | unresolved | S10–S12; metric scope | open | none | U | U | U |
| IDA-KPI-008 | Role-specific publication | Target | unresolved | S10–S12; metric scope | open | none | U | U | U |
| IDA-KPI-009 | Threshold governance | Target | unresolved | S10–S12; metric scope | open | none | U | U | U |
| IDA-KPI-010 | Reconciliation before finance publication | Target | unresolved | S10–S12; metric scope | open | none | U | U | U |
| IDA-KPI-011 | Metric correction | Target | unresolved | S10–S12; metric scope | open | none | U | U | U |
| IDA-KPI-012 | Export provenance | Target | unresolved | S10–S12; metric scope | open | none | U | U | U |
| IDA-TST-001 | Verification method | Target | unresolved | Affected slice/S14 | open | none | U | U | U |
| IDA-TST-002 | Positive and negative tests | Target | unresolved | Affected slice/S14 | open | none | U | U | U |
| IDA-TST-003 | Tenant isolation suite | Target | pilot-required | Affected slice/S14 | open | none | U | U | U |
| IDA-TST-004 | Role distinction suite | Canonical | pilot-required | Affected slice/S14 | open | none | U | U | U |
| IDA-TST-005 | Workflow acceptance | Target | pilot-required | Affected slice/S14 | open | none | U | U | U |
| IDA-TST-006 | Provider replay suite | Target | unresolved | Affected slice/S14 | open | none | U | U | U |
| IDA-TST-007 | Document security suite | Target | unresolved | Affected slice/S14 | open | none | U | U | U |
| IDA-TST-008 | AI safety suite | Target | unresolved | Affected slice/S14 | open | none | U | U | U |
| IDA-TST-009 | Migration acceptance | Target | unresolved | Affected slice/S14 | open | none | U | U | U |
| IDA-TST-010 | Operational acceptance | Target | pilot-required | Affected slice/S14 | open | none | U | U | U |
| IDA-TST-011 | Human sign-off | Target | unresolved | Affected slice/S14 | open | none | U | U | U |
| IDA-TST-012 | Traceability | Target | unresolved | Affected slice/S14 | open | none | U | U | U |
| IDA-TST-013 | Acceptance level classification | Target | unresolved | Affected slice/S14 | open | none | U | U | U |
| IDA-TST-014 | Evidence identity | Target | pilot-required | Affected slice/S14 | open | none | U | U | U |
| IDA-TST-015 | Evidence freshness | Target | pilot-required | Affected slice/S14 | open | none | U | U | U |
| IDA-TST-016 | Test-data governance | Target | unresolved | Affected slice/S14 | open | none | U | U | U |
| IDA-TST-017 | Failure-path rehearsal | Target | unresolved | Affected slice/S14 | open | none | U | U | U |
| IDA-TST-018 | Cross-browser proof scope | Canonical | unresolved | Affected slice/S14 | open | none | U | U | U |
| IDA-TST-019 | Independent evidence review | Target | unresolved | Affected slice/S14 | open | none | U | U | U |
| IDA-TST-020 | Coverage debt | Target | unresolved | Affected slice/S14 | open | none | U | U | U |
| IDA-BHV-001 | Formal use-case catalogue | Target | unresolved | Affected role/S14 | open | none | U | U | U |
| IDA-BHV-002 | Use cases are behavior contracts | Canonical | unresolved | Affected role/S14 | open | none | U | U | U |
| IDA-BHV-003 | Actor and runtime role distinction | Canonical | unresolved | Affected role/S14 | open | none | U | U | U |
| IDA-BHV-004 | Canonical runtime role set | Canonical | unresolved | Affected role/S14 | open | none | U | U | U |
| IDA-BHV-005 | Capability-based authorization | Canonical | unresolved | Affected role/S14 | open | none | U | U | U |
| IDA-BHV-006 | Headless state authority | Canonical | unresolved | Affected role/S14 | open | none | U | U | U |
| IDA-BHV-007 | Projection is not authority | Canonical | unresolved | Affected role/S14 | open | none | U | U | U |
| IDA-BHV-008 | Case and recovery separation | Canonical | unresolved | Affected role/S14 | open | none | U | U | U |
| IDA-BHV-009 | Sole transition authority | Canonical | unresolved | Affected role/S14 | open | none | U | U | U |
| IDA-BHV-010 | Transition contract | Target | unresolved | Affected role/S14 | open | none | U | U | U |
| IDA-BHV-011 | Invalid transition denial | Canonical | unresolved | Affected role/S14 | open | none | U | U | U |
| IDA-BHV-012 | Role-capability matrix | Target | unresolved | Affected role/S14 | open | none | U | U | U |
| IDA-BHV-013 | Role-data-access matrix | Target | unresolved | Affected role/S14 | open | none | U | U | U |
| IDA-BHV-014 | Role-transition matrix | Target | unresolved | Affected role/S14 | open | none | U | U | U |
| IDA-BHV-015 | Actor-use-case matrix | Target | unresolved | Affected role/S14 | open | none | U | U | U |
| IDA-BHV-016 | Segregation-of-duties matrix | Target | unresolved | Affected role/S14 | open | none | U | U | U |
| IDA-BHV-017 | No self-approval | Canonical | unresolved | Affected role/S14 | open | none | U | U | U |
| IDA-BHV-018 | Technical administrator boundary | Canonical | unresolved | Affected role/S14 | open | none | U | U | U |
| IDA-BHV-019 | Support and auditor boundary | Canonical | unresolved | Affected role/S14 | open | none | U | U | U |
| IDA-BHV-020 | Attribution boundary | Canonical | unresolved | Affected role/S14 | open | none | U | U | U |
| IDA-BHV-021 | Contextual access closure | Target | unresolved | Affected role/S14 | open | none | U | U | U |
| IDA-BHV-022 | RACI is governance-controlled | Canonical | unresolved | Affected role/S14 | open | none | U | U | U |
| IDA-BHV-023 | State model versioning | Target | unresolved | Affected role/S14 | open | none | U | U | U |
| IDA-BHV-024 | State observability | Target | unresolved | Affected role/S14 | open | none | U | U | U |
| IDA-BHV-025 | Use-case acceptance trace | Target | unresolved | Affected role/S14 | open | none | U | U | U |
| IDA-BHV-026 | Legacy exclusion | Canonical | unresolved | Affected role/S14 | open | none | U | U | U |
| IDA-VAL-001 | Scenario-based validation | Target | unresolved | S14 | open | none | U | U | U |
| IDA-VAL-002 | Scenario preconditions | Target | unresolved | S14 | open | none | U | U | U |
| IDA-VAL-003 | Expected outcomes | Target | unresolved | S14 | open | none | U | U | U |
| IDA-VAL-004 | Role handoff contract | Target | pilot-required | S14 | open | none | U | U | U |
| IDA-VAL-005 | No implicit authority transfer | Canonical | unresolved | S14 | open | none | U | U | U |
| IDA-VAL-006 | Evidence pack integrity | Target | unresolved | S14 | open | none | U | U | U |
| IDA-VAL-007 | Repeatability | Target | unresolved | S14 | open | none | U | U | U |
| IDA-VAL-008 | Exception ownership | Target | unresolved | S14 | open | none | U | U | U |
| IDA-VAL-009 | Independent approval | Target | unresolved | S14 | open | none | U | U | U |
| IDA-VAL-010 | Business sign-off scope | Target | unresolved | S14 | open | none | U | U | U |
| IDA-VAL-011 | Conditional approval expiry | Target | unresolved | S14 | open | none | U | U | U |
| IDA-VAL-012 | Deferred scope classification | Target | pilot-required | S14 | open | none | U | U | U |
| IDA-VAL-013 | Out-of-scope protection | Target | unresolved | S14 | open | none | U | U | U |
| IDA-VAL-014 | Operational readiness rehearsal | Target | pilot-required | S14 | open | none | U | U | U |
| IDA-VAL-015 | Acceptance trace | Target | unresolved | S14 | open | none | U | U | U |
| IDA-VAL-016 | Coverage reporting | Target | unresolved | S14 | open | none | U | U | U |
| IDA-VAL-017 | Evidence retention | Target | unresolved | S14 | open | none | U | U | U |
| IDA-VAL-018 | SRS does not authorize runtime | Canonical | unresolved | S14 | open | none | U | U | U |
| IDA-VAL-019 | Authority-specific sign-off | Target | unresolved | S14 | open | none | U | U | U |
| IDA-VAL-020 | No inherited sign-off | Target | unresolved | S14 | open | none | U | U | U |
| IDA-VAL-021 | Decision workshop packet | Target | unresolved | S14 | open | none | U | U | U |
| IDA-VAL-022 | Condition enforcement | Target | unresolved | S14 | open | none | U | U | U |
| IDA-VAL-023 | Residual-risk register | Target | unresolved | S14 | open | none | U | U | U |
| IDA-VAL-024 | Launch claim control | Target | pilot-required | S14 | open | none | U | U | U |
| IDA-VAL-025 | Baseline delta review | Target | unresolved | S14 | open | none | U | U | U |
| IDA-VAL-026 | Acceptance revocation | Target | unresolved | S14 | open | none | U | U | U |
| IDA-CTR-001 | Business-case governance | Target | unresolved | Affected contract/S14 | open | none | U | U | U |
| IDA-CTR-002 | Business-case authority | Canonical | unresolved | Affected contract/S14 | open | none | U | U | U |
| IDA-CTR-003 | Business-to-contract trace | Target | unresolved | Affected contract/S14 | open | none | U | U | U |
| IDA-CTR-004 | Business-case value verification | Target | unresolved | Affected contract/S14 | open | none | U | U | U |
| IDA-CTR-005 | Business contract completeness | Target | unresolved | Affected contract/S14 | open | none | U | U | U |
| IDA-CTR-006 | Immutable accepted terms | Canonical | unresolved | Affected contract/S14 | open | none | U | U | U |
| IDA-CTR-007 | No inferred representation | Canonical | unresolved | Affected contract/S14 | open | none | U | U | U |
| IDA-CTR-008 | Bounded handoff contract | Target | unresolved | Affected contract/S14 | open | none | U | U | U |
| IDA-CTR-009 | Contract hierarchy | Target | unresolved | Affected contract/S14 | open | none | U | U | U |
| IDA-CTR-010 | Service contract neutrality | Target | unresolved | Affected contract/S14 | open | none | U | U | U |
| IDA-CTR-011 | Sole command authority | Canonical | unresolved | Affected contract/S14 | open | none | U | U | U |
| IDA-CTR-012 | Logical versus physical API | Canonical | unresolved | Affected contract/S14 | open | none | U | U | U |
| IDA-CTR-013 | OpenAPI baseline | Target | unresolved | Affected contract/S14 | open | none | U | U | U |
| IDA-CTR-014 | AsyncAPI baseline | Target | unresolved | Affected contract/S14 | open | none | U | U | U |
| IDA-CTR-015 | JSON Schema baseline | Target | unresolved | Affected contract/S14 | open | none | U | U | U |
| IDA-CTR-016 | Problem Details baseline | Target | unresolved | Affected contract/S14 | open | none | U | U | U |
| IDA-CTR-017 | Safe error disclosure | Canonical | unresolved | Affected contract/S14 | open | none | U | U | U |
| IDA-CTR-018 | Contextual API authorization | Canonical | unresolved | Affected contract/S14 | open | none | U | U | U |
| IDA-CTR-019 | Command idempotency | Target | unresolved | Affected contract/S14 | open | none | U | U | U |
| IDA-CTR-020 | Optimistic concurrency | Target | unresolved | Affected contract/S14 | open | none | U | U | U |
| IDA-CTR-021 | Atomic effects | Canonical | unresolved | Affected contract/S14 | open | none | U | U | U |
| IDA-CTR-022 | Provider traffic validation | Canonical | unresolved | Affected contract/S14 | open | none | U | U | U |
| IDA-CTR-023 | Replay and ordering | Target | unresolved | Affected contract/S14 | open | none | U | U | U |
| IDA-CTR-024 | API query bounds | Target | unresolved | Affected contract/S14 | open | none | U | U | U |
| IDA-CTR-025 | Data minimization | Canonical | unresolved | Affected contract/S14 | open | none | U | U | U |
| IDA-CTR-026 | Contracted manual fallback | Target | unresolved | Affected contract/S14 | open | none | U | U | U |
| IDA-CTR-027 | Event envelope | Target | unresolved | Affected contract/S14 | open | none | U | U | U |
| IDA-CTR-028 | Event consumer idempotency | Canonical | unresolved | Affected contract/S14 | open | none | U | U | U |
| IDA-CTR-029 | Financial event immutability | Canonical | unresolved | Affected contract/S14 | open | none | U | U | U |
| IDA-CTR-030 | API lifecycle and versioning | Target | unresolved | Affected contract/S14 | open | none | U | U | U |
| IDA-CTR-031 | Consumer-provider contract tests | Target | unresolved | Affected contract/S14 | open | none | U | U | U |
| IDA-CTR-032 | Schema example safety | Canonical | unresolved | Affected contract/S14 | open | none | U | U | U |
| IDA-CTR-033 | API observability | Target | unresolved | Affected contract/S14 | open | none | U | U | U |
| IDA-CTR-034 | Contract maturity | Canonical | unresolved | Affected contract/S14 | open | none | U | U | U |
| IDA-CTR-035 | Contract source of truth | Target | unresolved | Affected contract/S14 | open | none | U | U | U |
| IDA-CTR-036 | Contract change control | Target | unresolved | Affected contract/S14 | open | none | U | U | U |
| IDA-CTR-037 | API documentation generation | Target | unresolved | Affected contract/S14 | open | none | U | U | U |
| IDA-CTR-038 | Contract acceptance evidence | Target | unresolved | Affected contract/S14 | open | none | U | U | U |
| IDA-CTR-039 | No legacy layout authority | Canonical | pilot-required | Affected contract/S14 | open | none | U | U | U |
| IDA-CTR-040 | External interface register | Target | unresolved | Affected contract/S14 | open | none | U | U | U |
| IDA-CTR-041 | Rate and abuse control | Target | unresolved | Affected contract/S14 | open | none | U | U | U |
| IDA-CTR-042 | Contract deactivation | Target | unresolved | Affected contract/S14 | open | none | U | U | U |
