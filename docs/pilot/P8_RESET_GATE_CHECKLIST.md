# P8 Reset Gate Checklist

Use this checklist before starting the new `P8P` seven-day pilot rehearsal.

This checklist exists because Day 2 of the superseded 14-day pilot exposed concrete reset-gate defects that should be closed before a new pilot id is created.

## Acceptance Rules

All reset-gate items must be complete before `P8P` starts.

Required acceptance:

- all checklist items are marked complete
- fresh `pnpm pilot:check` passes
- fresh `pnpm release:gate:prod -- --pilotId <new-pilot-id>` passes
- relevant pilot memory retrievals have been reviewed and recorded
- each required reset-gate retrieval has the intended pilot trigger signature as the top hit
- no historical pilot id is reused
- no Day 3 continuation from the old 14-day pilot is allowed

Default new pilot id:

- `pilot-ks-7d-rehearsal-<YYYY-MM-DD>`

## Checklist

| ID     | Issue                                         | Current failure signature                                                                                                 | Required fix proof                                                                                       | Owner           | Verification command                                                        | Pass or fail evidence path |
| ------ | --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- | --------------- | --------------------------------------------------------------------------- | -------------------------- |
| `RG01` | `pilot:check` rehearsal-environment stability | Day 2 first pass failed in `db:rls:test` with `Tenant or user not found`.                                                 | Rehearsal environment documents the intended prerequisites and fresh `pnpm pilot:check` passes.          | `platform + qa` | `pnpm pilot:check`                                                          |                            |
| `RG02` | Operator log-sweep doc drift                  | Day 2 notes recorded that direct `vercel logs` guidance no longer matched installed Vercel CLI `48.10.2`.                 | Operator-facing docs match the installed CLI behavior and are exercised by the reset-gate owner.         | `platform + qa` | `vercel logs --help` and documented operator command path                   |                            |
| `RG03` | Observability-to-decision proof determinism   | Day 2 first pass of `pnpm pilot:decision:record` failed with `observability evidence must exist for reference day-2 ...`. | Decision proof succeeds immediately after a fresh observability row without manual repair looping.       | `platform + qa` | `pnpm pilot:observability:record ...` then `pnpm pilot:decision:record ...` |                            |
| `RG04` | Daily-sheet vs canonical evidence clarity     | Day 2 required manual interpretation to distinguish working notes, copied evidence index state, and final canonical rows. | Docs make the separation explicit and operators can describe the required record flow without guesswork. | `platform + qa` | manual doc walkthrough against pilot docs                                   |                            |
| `RG05` | Clean preflight proving reset-gate closure    | Superseded pilot entered Day 2 before the new reset-gate model existed.                                                   | A fresh new pilot id produces a clean release report and clean artifact set before any `PD02+` run.      | `platform + qa` | `pnpm release:gate:prod -- --pilotId <new-pilot-id>`                        |                            |

## Required Advisory Retrievals

Before closing the reset gate, retrieve the checked-in lessons for:

- `RG01`: [p8-rg01-memory-query.json](/Users/arbenlila/development/interdomestik-crystal-home/docs/pilot/memory/p8-rg01-memory-query.json)
- `RG02`: [p8-rg02-memory-query.json](/Users/arbenlila/development/interdomestik-crystal-home/docs/pilot/memory/p8-rg02-memory-query.json)
- `RG03`: [p8-rg03-memory-query.json](/Users/arbenlila/development/interdomestik-crystal-home/docs/pilot/memory/p8-rg03-memory-query.json)
- `RG04`: [p8-rg04-memory-query.json](/Users/arbenlila/development/interdomestik-crystal-home/docs/pilot/memory/p8-rg04-memory-query.json)

Record the retrieval output paths in the reset-gate notes or daily-sheet evidence references.

Do not treat a retrieval as satisfied only because it returned high-risk lessons. For each reset-gate query, confirm that:

- the intended pilot trigger signature is the top hit
- the top hit has the strongest score in the retrieval
- the reviewed lesson is reflected in the fix proof for that reset item

## Closure Notes

- `RG01` and `RG03` are closed only when the command behavior is deterministic, not just once recoverable.
- `RG02` is closed only when repo docs match the operator reality for the installed CLI.
- `RG04` is closed only when the daily sheet is clearly human working state and the copied evidence index is clearly canonical state.
- `RG05` is the final preflight gate and must be the last item closed before the new pilot starts.
