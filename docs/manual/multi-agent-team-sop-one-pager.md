# Multi-Agent Team SOP (One Pager)

Date: 2026-02-24

Audience:

- Engineers (build + verify changes)
- Release Managers (gate + ship safely)

Scope:

- Use this for day-to-day multi-agent operations in Phase C.
- Full reference: `docs/manual/multi-agent-effective-operations-guidebook.md`.

---

## Engineer SOP (Feature / Fix Work)

## 1) Pick mode with policy

```bash
pnpm multiagent:policy -- --mode auto --complexity medium --task-count 2 --estimated-cost-usd 2 --budget-usd 5
```

Decision:

- `single` for low complexity / tight budget.
- `multi` for high complexity, boundary-sensitive, or parallel work.

## 2) Run orchestrator

```bash
pnpm multiagent:run -- --execution-mode auto --task-complexity medium --task-count 2 --estimated-cost-usd 2 --budget-usd 5 --auto-retry-max 3
```

Optional:

- Add `--finalize --pr <PR_NUMBER> --watch-ci` when ready for closeout.
- Add `--require-cdd-context` to enforce context artifacts.
- Add repeated `--context-file <path>` when CDD files live outside default locations.

## 3) Review run evidence

Check:

- `tmp/multi-agent/run-<id>/events.ndjson`
- `tmp/multi-agent/run-<id>/role-scorecard.json`

Minimum expected:

- No failed gate steps
- Acceptable `qualityPerDollar` for active roles

## 4) If failures occur

- Default behavior: verification-agent auto-attempts deterministic remediation up to `3` retries.
- If still failing, open step logs in `tmp/multi-agent/run-<id>/` and escalate with root-cause notes.
- Re-run only required lane(s), then full gate path.

---

## Release Manager SOP (PR / Release Readiness)

## 1) Ensure required verification path is green

Required sequence:

1. `pnpm security:guard`
2. `REQUIRE_RLS_INTEGRATION=1 pnpm db:rls:test`
3. `pnpm pr:verify:hosts`
4. `pnpm e2e:gate`

## 2) Run finalization discipline

```bash
pnpm multiagent:finalizer -- --pr <PR_NUMBER> --watch-ci
```

Confirms:

- Clean tree
- Branch pushed
- `pnpm pr:finalize`
- Required CI snapshot

## 3) Weekly quality/cost benchmark

```bash
pnpm multiagent:benchmark:weekly
```

Review:

- `tmp/multi-agent/benchmarks/weekly/<run-id>/scorecard.md`
- trend for `successRate`, `p95LatencyMs`, `qualityPerDollar` by role

## 4) External ecosystem handoff (if needed)

Export request:

```bash
pnpm multiagent:a2a -- --mode export-request --input request.json --output a2a-task.json
```

Import result:

```bash
pnpm multiagent:a2a -- --mode import-result --input a2a-result.json --output internal-result.json
```

Contract schema:

- `scripts/multi-agent/contracts/a2a-task-envelope.schema.json`

## 5) Map-Reduce execution pattern (parallel feature tracks)

Use for independent subtasks that can merge through one reviewer:

```bash
pnpm multiagent:run -- --execution-mode auto --task-complexity high --task-count 5 --estimated-cost-usd 4 --budget-usd 8
```

Interpretation:

- map: multiple workers run in parallel tracks
- reduce: one reviewer/finalizer role merges outputs and runs required gates

---

## Escalation Triggers

Escalate immediately if any of the following occurs:

1. Repeated gate failures with no clear root cause after 2 attempts
2. `qualityPerDollar` drops sharply week-over-week for key roles
3. Benchmark success rate drops below normal baseline
4. A2A payloads fail schema expectations or lose required task metadata

---

## Fast Command Sheet

```bash
# mode decision
pnpm multiagent:policy -- --mode auto --complexity high --task-count 3 --estimated-cost-usd 3 --budget-usd 6 --requires-boundary-review true

# run orchestration
pnpm multiagent:run -- --execution-mode auto

# finalization
pnpm multiagent:finalizer -- --pr <PR_NUMBER> --watch-ci

# weekly benchmark
pnpm multiagent:benchmark:weekly
```
