---
plan_role: input
status: active
source_of_truth: false
owner: platform
last_reviewed: 2026-03-08
parent_program: docs/plans/current-program.md
parent_tracker: docs/plans/current-tracker.md
---

# AI05 Claim And Legal Workflows

> Status: Active supporting input. This document scopes the current AI05 implementation slice, but live execution status still comes from `docs/plans/current-program.md` and `docs/plans/current-tracker.md`.

## Scope

Promote the first non-policy AI document workflows onto the existing `AI02` through `AI04` rails without reopening routing, auth, or tenancy work.

This slice is intentionally narrow:

- queue claim-intake extraction for claim evidence uploads
- queue legal-document extraction for claim uploads explicitly marked `legal`
- keep legacy `claim_documents` reads intact while dual-writing canonical `documents`
- reuse the existing AI run status and review APIs instead of creating new public routes

## Non-Goals

- autonomous claim decisions or status changes
- replacing `claim_documents` reads across the app
- broad claim UI redesign
- cross-claim corpus reasoning or bulk backfills

## Exit Criteria

1. claim submission writes legacy `claim_documents` and canonical `documents`
2. submitted claim documents queue durable `ai_runs`
3. authenticated post-submit claim uploads also queue durable `ai_runs`
4. Inngest background handlers process `claim_intake_extract` and `legal_doc_extract`
5. the generic AI review path accepts corrected claim and legal extraction payloads
6. focused tests and mandatory gates pass
