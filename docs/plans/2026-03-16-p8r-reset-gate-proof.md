# P8R Reset Gate Proof

- Date: `2026-03-16`
- Commit SHA: `1c8ed93196bd463de5c525bdf048b341b188fc1c`
- Pilot ID: `pilot-ks-7d-rehearsal-2026-03-16`
- Verdict: `green`

## Scope

This proof closes `RG01` through `RG05` for the new `P8` rehearsal model.

It does not reopen the historical `P7` Day 1 / Day 2 record.

## Memory Top-Hit Confirmation

| Reset Item | Query                                         | Confirmed Top Hit      | Trigger                            | Score |
| ---------- | --------------------------------------------- | ---------------------- | ---------------------------------- | ----- |
| `RG01`     | `docs/pilot/memory/p8-rg01-memory-query.json` | `mem_824e576a3e5d46a0` | `pilot.reset_gate.check_failure`   | `10`  |
| `RG02`     | `docs/pilot/memory/p8-rg02-memory-query.json` | `mem_001dc9ff5e8a5867` | `pilot.operator.log_command_drift` | `10`  |
| `RG03`     | `docs/pilot/memory/p8-rg03-memory-query.json` | `mem_fe914e87a2013487` | `pilot.decision.observability_gap` | `10`  |
| `RG04`     | `docs/pilot/memory/p8-rg04-memory-query.json` | `mem_d2c888236930032b` | `pilot.evidence.working_state_gap` | `10`  |

These confirmations are intentionally recorded as repo-backed query-plus-memory-id evidence rather than ephemeral local retrieval files.

## RG01

Objective: prove `pnpm pilot:check` passes in the intended rehearsal environment.

Command:

```bash
NODE20_BIN="$(dirname "$(npx -y node@20 -p 'process.execPath')")"; PATH="$NODE20_BIN:$PATH" pnpm pilot:check
```

Result:

- exited `0`
- reported `[PASS] All pilot readiness checks succeeded.`
- reported `[NEXT] Continue with the ranked operator path via: pnpm pilot:flow`

## RG02

Objective: align the operator log-sweep contract with the installed Vercel CLI.

Command:

```bash
vercel logs --help | sed -n '1,40p'
```

Result:

- CLI version: `48.10.2`
- supported syntax: `vercel logs url|deploymentId [options]`
- visible option set includes `--json`
- pilot docs now align to the installed CLI and no longer rely on removed flags

## RG03

Objective: prove observability-to-decision sequencing is deterministic when the documented order is respected.

Observed first attempt:

- I launched observability and decision recording in parallel.
- `pnpm pilot:decision:record` failed with:
  - `observability evidence must exist for reference day-1 before decision proof can be recorded`

Interpretation:

- this was operator-order misuse, not a repo defect
- the canonical contract requires observability first, then decision

Successful sequential rerun:

```bash
pnpm pilot:observability:record -- --pilotId pilot-ks-7d-rehearsal-2026-03-16 --reference day-1 --date 2026-03-16 --owner platform --logSweepResult expected-noise --functionalErrorCount 0 --expectedAuthDenyCount 0 --kpiCondition within-threshold --incidentCount 0 --highestSeverity none --notes n/a
pnpm pilot:decision:record -- --pilotId pilot-ks-7d-rehearsal-2026-03-16 --reviewType daily --reference day-1 --date 2026-03-16 --owner platform --decision continue --observabilityRef day-1
```

Result:

- both commands completed successfully when run in sequence
- the copied evidence index now contains matching `day-1` observability and decision rows

## RG04

Objective: make the boundary between working notes and canonical evidence explicit and inspectable.

Proof refs:

- `docs/pilot/PILOT_DAILY_SHEET_TEMPLATE.md`
- `docs/pilot/PILOT_EVIDENCE_INDEX_TEMPLATE.md`
- `docs/pilot/PILOT_DAILY_SHEET_pilot-ks-7d-rehearsal-2026-03-16_day-1.md`
- `docs/pilot/PILOT_EVIDENCE_INDEX_pilot-ks-7d-rehearsal-2026-03-16.md`

Result:

- the daily sheet is the human-readable working-note layer
- the copied evidence index is the canonical pilot record
- memory advisory refs and orchestration detail stay on the daily sheet, while status, observability, and decision custody stay in the copied evidence index

## RG05

Objective: prove a fresh pilot id can complete a full preflight and produce the required pilot-entry artifact set.

Command:

```bash
NODE20_BIN="$(dirname "$(npx -y node@20 -p 'process.execPath')")"; PATH="$NODE20_BIN:$PATH" pnpm release:gate:prod -- --pilotId pilot-ks-7d-rehearsal-2026-03-16
```

Result:

- report: `docs/release-gates/2026-03-16_production_dpl_5R7nc92c58ufkUnQeBmXFUAgbhu1.md`
- copied evidence index: `docs/pilot/PILOT_EVIDENCE_INDEX_pilot-ks-7d-rehearsal-2026-03-16.md`
- pointer row: `docs/pilot-evidence/index.csv`
- gate verdict: `GO`

Observed pass set:

- `P0.1=PASS`
- `P0.2=PASS`
- `P0.3=PASS`
- `P0.4=PASS`
- `P0.6=PASS`
- `P1.1=PASS`
- `P1.2=PASS`
- `P1.3=PASS`
- `P1.5.1=PASS`
- `G07=PASS`
- `G08=PASS`
- `G09=PASS`
- `G10=PASS`
- `AUTH-PREFLIGHT=INFO`

## Reset Gate Decision

- `P8R`: complete
- new pilot id required: satisfied
- historical 14-day pilot continuation from Day 3: not allowed
- next slice: `SP01` / `PD01`
