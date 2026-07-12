# MOB-03a Vault + AI Extraction Consent Display Implementation Plan

> **For agentic workers:** Use `subagent-driven-development` only when authorized;
> otherwise use `executing-plans`. Every behavior follows RED → GREEN → REFACTOR.

**Goal:** Add a read-only, MK-only Vault summary for vehicle/property member
claims that displays evidence-category metadata and the latest AI-document-
extraction consent state without exposing raw document or subject data.

**Architecture:** A pure `domain-claims` mapper owns the fail-closed display
contract and deterministic consent selection. A server-only query verifies the
exact MK tenant before reading evidence documents and exact
`ai_document_extraction` consent rows. A focused card renders the serialized
result on the existing member claim-detail surface.

**Authority:**
`docs/plans/2026-07-12-mob-dg04b-mob-03a-current-authority.md`, Rev 104
addendum, merged through PRs `#1330` and `#1331`.

## Execution chapters

1. [Pure contract](2026-07-12-mob-03a-vault-consent-display/01-domain-contract.md)
2. [Tenant-safe read](2026-07-12-mob-03a-vault-consent-display/02-server-read.md)
3. [DTO integration](2026-07-12-mob-03a-vault-consent-display/03-dto-integration.md)
4. [Accessible UI](2026-07-12-mob-03a-vault-consent-display/04-accessible-ui.md)
5. [Browser and static proof](2026-07-12-mob-03a-vault-consent-display/05-browser-static-proof.md)
6. [Review and delivery](2026-07-12-mob-03a-vault-consent-display/06-review-delivery.md)

## Non-goals that stop execution

Stop and return to current authority if any task needs medical/injury data,
legal-category rendering, document content/name/ID/link/path, general consent
claims, upload/download/storage, a writer/event/outbox, schema/RLS/migration,
auth/proxy/routing/session/tenancy, sponsor/payer/partner exposure,
staff/agent/admin UI, KS/AL exposure, billing, Agreement Ceremony, or broad
`MOB-03` behavior.
