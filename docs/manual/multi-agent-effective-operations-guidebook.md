# Multi-Agent Operations Guidebook (Effective Use)

Date: 2026-02-24

## Purpose

Use this guide to run the multi-agent system with predictable quality, controlled cost, and clear evidence.

Companion references:

- `docs/manual/multi-agent-team-sop-one-pager.md` (quick operational SOP)
- `docs/plans/2026-02-24-multi-agent-enterprise-lanes.md` (implementation background)

Primary goals:

1. Choose the right execution mode (`single` vs `multi`) per task.
2. Keep verification strict (`security`, `rls`, `pr:verify:hosts`, `e2e:gate`).
3. Measure quality-per-dollar by role.
4. Benchmark weekly with a repeatable internal suite.
5. Exchange tasks/results with external agent ecosystems through an A2A-style contract.

---

## System Map

Core commands:

- `pnpm multiagent:run` -> orchestrated run entrypoint
- `pnpm multiagent:policy` -> mode selection policy engine
- `pnpm multiagent:benchmark` -> internal benchmark lane
- `pnpm multiagent:benchmark:weekly` -> weekly benchmark wrapper
- `pnpm multiagent:metrics` -> role scorecard from orchestrator events
- `pnpm multiagent:a2a` -> A2A-style request/result adapter
- `pnpm multiagent:verify-fix` -> deterministic verification-agent log triage/remediation

Core artifacts:

- Orchestrator logs: `tmp/multi-agent/run-<timestamp>/`
- Orchestrator events: `events.ndjson`
- Role scorecard: `role-scorecard.json`
- Benchmark run: `tmp/multi-agent/benchmarks/<run-id>/`
- Benchmark outputs: `results.json`, `scorecard.json`, `scorecard.md`

---

## Effective Operating Pattern

### 1) Start with policy, not intuition

Check mode selection before expensive runs:

```bash
pnpm multiagent:policy -- --mode auto --complexity high --task-count 3 --estimated-cost-usd 3 --budget-usd 6 --requires-boundary-review true
```

Rule of thumb:

- Use `multi` for high-complexity, boundary-sensitive, parallel tasks.
- Use `single` for low-complexity, budget-pressured, focused tasks.

### 2) Run orchestrator with explicit signals

```bash
pnpm multiagent:run -- --execution-mode auto --task-complexity medium --task-count 2 --estimated-cost-usd 2 --budget-usd 5 --requires-boundary-review false --auto-retry-max 3
```

This gives mode decision + step evidence + role scorecard in one flow.

### 2b) Bind CDD context to every run

When context artifacts exist, the orchestrator now bundles them automatically from:

- `product.md`
- `tech-stack.md`
- `workflow.md`

And common variants under `context/` or `docs/context/`.

If you want strict enforcement:

```bash
pnpm multiagent:run -- --require-cdd-context
```

If you store context elsewhere, pass explicit files:

```bash
pnpm multiagent:run -- --context-file /abs/path/product.md --context-file /abs/path/tech-stack.md --context-file /abs/path/workflow.md
```

The resolved bundle is exported to roles through:

- `MULTI_AGENT_CONTEXT_BUNDLE`
- `MULTI_AGENT_CONTEXT_FILES`

### 3) Review role scorecard after every run

Read:

- `tmp/multi-agent/run-<id>/role-scorecard.json`

Track:

- `successRate`
- `avgLatencyMs` / `p95LatencyMs`
- `totalCostUsd`
- `qualityPerDollar`

### 4) Benchmark weekly, not ad hoc

```bash
pnpm multiagent:benchmark:weekly
```

Use weekly scorecards to detect regressions early.

---

## Scenario Playbooks

### Scenario 1: Low-risk bugfix under tight budget

Goal: minimize spend and coordination overhead.

Recommended:

1. Run single mode:

```bash
pnpm multiagent:run -- --execution-mode auto --task-complexity low --task-count 1 --estimated-cost-usd 3 --budget-usd 1 --skip-preflight --skip-gates
```

2. Confirm policy selected `single`.
3. If quality drops, increase budget or switch to explicit `multi`.

Why it works: avoids unnecessary parallel-agent overhead when complexity is low.

### Scenario 2: Boundary-heavy release prep

Goal: maximize reliability for high-risk changes.

Recommended:

1. Run multi mode with boundary review signal:

```bash
pnpm multiagent:run -- --execution-mode auto --task-complexity high --task-count 4 --estimated-cost-usd 4 --budget-usd 8 --requires-boundary-review true
```

2. Include finalizer for PR closeout:

```bash
pnpm multiagent:run -- --execution-mode multi --finalize --pr <PR_NUMBER> --watch-ci
```

Why it works: keeps preflight/gate/finalizer responsibilities separated and auditable.

### Scenario 3: Weekly leadership scorecard

Goal: trend quality/cost by role over time.

Recommended:

1. Run:

```bash
pnpm multiagent:benchmark:weekly
```

2. Share:

- `tmp/multi-agent/benchmarks/weekly/<run-id>/scorecard.md`

3. Compare week-over-week:

- success rate delta
- p95 latency delta
- quality-per-dollar delta by role

Why it works: regression detection becomes objective and repeatable.

### Scenario 4: External ecosystem integration (A2A-style)

Goal: exchange tasks/results with external agent systems safely.

Recommended:

1. Export internal request to A2A envelope:

```bash
pnpm multiagent:a2a -- --mode export-request --input request.json --output a2a-task.json
```

2. Send `a2a-task.json` to external system.
3. Import returned A2A result:

```bash
pnpm multiagent:a2a -- --mode import-result --input a2a-result.json --output internal-result.json
```

4. Validate against schema:

- `scripts/multi-agent/contracts/a2a-task-envelope.schema.json`

Why it works: keeps your internal model stable while enabling partner interoperability.

### Scenario 5: Cost spike investigation by role

Goal: reduce cost without reducing pass rate.

Recommended:

1. Run orchestrator normally.
2. Inspect `role-scorecard.json` for low `qualityPerDollar`.
3. Tune:

- adjust `--budget-usd` or `--execution-mode`
- refine role token assumptions in `scripts/multi-agent/role-cost-profile.json`
- reduce unnecessary gate runs for low-risk paths

4. Re-run benchmark to confirm improvement.

Why it works: moves optimization from guesswork to measured role-level adjustments.

### Scenario 6: Map-Reduce fan-out/fan-in for parallel tasks

Goal: split independent workstreams and consolidate with one reviewer agent.

Recommended:

1. Fan-out in `multi` mode with explicit task count:

```bash
pnpm multiagent:run -- --execution-mode auto --task-complexity high --task-count 5 --estimated-cost-usd 4 --budget-usd 8
```

2. Let worker roles execute independently (map phase).
3. Route outputs to a single reviewer/finalizer role for merge and gate checks (reduce phase).
4. Use role scorecard to confirm fan-out improved throughput without lowering `qualityPerDollar`.

Why it works: parallel generation plus centralized merge control keeps speed high and regressions contained.

---

## Failure Handling

If benchmark lane fails:

1. Open benchmark case log in run directory.
2. Fix command/environment issue in suite case.
3. Re-run with controlled fail threshold:

```bash
pnpm multiagent:benchmark -- --suite scripts/multi-agent/benchmark-suite.internal.json --max-failures 1
```

If orchestrator role scorecard is missing:

1. Check `events.ndjson` exists.
2. Recompute manually:

```bash
  pnpm multiagent:metrics -- --events tmp/multi-agent/run-<id>/events.ndjson --out tmp/multi-agent/run-<id>/role-scorecard.json
```

If an orchestrator step fails:

1. Verification-agent automatically reads the failed log and attempts deterministic remediation (up to `--auto-retry-max`, default `3`).
2. If remediation is unavailable or retries are exhausted, orchestrator escalates to human owner with the failed log path.
3. Manual fallback:

```bash
pnpm multiagent:verify-fix -- --label "<failed-step>" --log-file tmp/multi-agent/run-<id>/<step-log>.log --attempt 1 --max-attempts 3
```

---

## Practical Defaults

Use these defaults unless you have clear evidence to change them:

1. `--execution-mode auto`
2. `--budget-usd 5`
3. `--task-complexity medium` for normal feature work
4. Weekly benchmark every Monday
5. A2A adapter only at integration boundaries, not for internal-only runs

This keeps operations consistent while preserving flexibility for high-risk or high-cost cases.
