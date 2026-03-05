# Memory Candidate Capture Sources

- version: `1.0.0`
- effective_date: `2026-03-04`
- source_map: `scripts/plan-conformance/candidate-capture-sources.json`

## Purpose

Define deterministic sources that create `candidate` memory entries when high-risk run events occur.

## Current Sources

1. `release_gate_no_go`

- trigger: `release_gate.no_go`
- default store: `episodic`
- default promotion rule: `hitl_required`

2. `tenant_isolation_hard_stop`

- trigger: `tenant.isolation.hard_stop`
- default store: `procedural`
- default promotion rule: `hitl_required`

3. `reviewer_block_boundary`

- trigger: `review.blocked.boundary`
- default store: `semantic`
- default promotion rule: `owner_approval`

4. `plan_evidence_custody_gap`

- trigger: `plan.evidence.custody_gap`
- default store: `procedural`
- default promotion rule: `owner_approval`

## Capture Command

```bash
node scripts/plan-conformance/memory-candidate-capture.mjs \
  --event tmp/plan-conformance/sample-event.json \
  --out tmp/plan-conformance/candidate-memory.json
```

The output is a typed candidate memory payload with deterministic `id` and merged scope.
