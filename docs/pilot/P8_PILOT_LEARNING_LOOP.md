# P8 Pilot Learning Loop

Use this document to connect the `P8` pilot redesign to the repo's existing memory, proof, and incident systems.

`P8` does not introduce a second learning system. It uses the checked-in memory registry, retrieval tooling, incident playbook, and proof surfaces that already exist in this repo.

## Purpose

Prevent repeated pilot mistakes by turning known Day 2 failure classes into:

- checked-in candidate memory records
- reset-gate checklist items
- reusable advisory retrieval queries
- explicit daily-sheet evidence references

## Learning Artifacts

The pilot learning loop uses:

- memory registry: [2026-03-03-memory-registry.jsonl](/Users/arbenlila/development/interdomestik-crystal-home/docs/plans/2026-03-03-memory-registry.jsonl)
- memory sources: [candidate-capture-sources.json](/Users/arbenlila/development/interdomestik-crystal-home/scripts/plan-conformance/candidate-capture-sources.json)
- incident playbook: [INCIDENT_PLAYBOOK.md](/Users/arbenlila/development/interdomestik-crystal-home/docs/INCIDENT_PLAYBOOK.md)
- reset gate: [P8_RESET_GATE_CHECKLIST.md](/Users/arbenlila/development/interdomestik-crystal-home/docs/pilot/P8_RESET_GATE_CHECKLIST.md)

## Current Pilot Failure Classes

The initial `P8` learning set is seeded from the historical Day 2 failure signatures:

1. `pilot.reset_gate.check_failure`
2. `pilot.operator.log_command_drift`
3. `pilot.decision.observability_gap`
4. `pilot.evidence.working_state_gap`

## Required Loop

Before a new `P8P` run:

1. validate the memory registry
2. rebuild the memory index
3. retrieve the relevant pilot lessons for the reset gate
4. record the retrieval artifact path in the daily sheet or reset-gate notes
5. only then start the new pilot id

Important:

- `memory:retrieve` is weighted retrieval, not strict exact-match filtering
- a reset-gate query may return broader high-risk lessons alongside the target pilot lesson
- for `P8`, operators should confirm that the top hit matches the intended pilot trigger signature and has the strongest score before treating the retrieval as satisfied

## Commands

```bash
pnpm memory:validate
pnpm memory:index
pnpm memory:retrieve --query docs/pilot/memory/p8-rg01-memory-query.json --out tmp/pilot-memory/p8-rg01-retrieval.json
pnpm memory:retrieve --query docs/pilot/memory/p8-rg02-memory-query.json --out tmp/pilot-memory/p8-rg02-retrieval.json
pnpm memory:retrieve --query docs/pilot/memory/p8-rg03-memory-query.json --out tmp/pilot-memory/p8-rg03-retrieval.json
pnpm memory:retrieve --query docs/pilot/memory/p8-rg04-memory-query.json --out tmp/pilot-memory/p8-rg04-retrieval.json
```

Optional advisory rollup:

```bash
pnpm memory:advisory:report --retrieval tmp/pilot-memory/p8-rg03-retrieval.json --out tmp/pilot-memory/p8-rg03-advisory.json
```

## Post-Day Capture Rule

After each `P8P` day:

1. decide whether the day exposed a new repeatable pilot failure class
2. if yes, write a candidate event JSON under `tmp/pilot-memory/`
3. run `pnpm memory:candidate:capture --event <event.json> --out <capture.json>`
4. review that capture for promotion into the checked-in memory registry before the next pilot day starts

Preferred event shape:

```json
{
  "event_type": "pilot.<new-failure-class>",
  "timestamp": "2026-03-16T18:00:00.000Z",
  "lesson_hint": "Short procedural lesson",
  "scope": {
    "file_path": "docs/pilot/PILOT_RUNBOOK.md"
  }
}
```

This turns new pilot mistakes into candidate lessons before they can silently repeat on the next day.

## Query Templates

- [p8-rg01-memory-query.json](/Users/arbenlila/development/interdomestik-crystal-home/docs/pilot/memory/p8-rg01-memory-query.json)
- [p8-rg02-memory-query.json](/Users/arbenlila/development/interdomestik-crystal-home/docs/pilot/memory/p8-rg02-memory-query.json)
- [p8-rg03-memory-query.json](/Users/arbenlila/development/interdomestik-crystal-home/docs/pilot/memory/p8-rg03-memory-query.json)
- [p8-rg04-memory-query.json](/Users/arbenlila/development/interdomestik-crystal-home/docs/pilot/memory/p8-rg04-memory-query.json)

## Promotion Rule

When a pilot lesson is proven stable and still relevant after repeated use, promote it through the existing memory lifecycle instead of leaving it as a candidate forever.

The pilot redesign should reuse that lifecycle, not bypass it.
