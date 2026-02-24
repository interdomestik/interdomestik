# Multi-Agent Enterprise Lanes (Preflight + CI Monitor + Finalizer)

Date: 2026-02-24

## Purpose

Add three operational agents that harden every multi-agent run:

1. Preflight Agent
2. CI Monitor Agent
3. Finalizer Agent

These agents sit alongside implementation lanes (for example: reg, dashboard, qa, integration).

## Agent Roles

### 1) Preflight Agent

Script: `scripts/multi-agent/preflight-agent.sh`

Responsibilities:

- Ensure dependencies are synced (`pnpm install --frozen-lockfile`)
- Bootstrap deterministic local env defaults
- Generate Playwright auth storage state for both tenants (`ks`, `mk`)

This prevents false failures such as missing `.playwright/state/ks.json`.

### 2) CI Monitor Agent

Script: `scripts/multi-agent/ci-monitor-agent.sh`

Responsibilities:

- Poll required PR checks
- Print pass/fail/pending snapshot
- Surface the first failing error block with details URL

Use watch mode during active PR review to avoid manual polling.

### 3) Finalizer Agent

Script: `scripts/multi-agent/finalizer-agent.sh`

Responsibilities:

- Verify clean git tree
- Push current branch
- Run `pnpm pr:finalize`
- Snapshot required CI check state

This enforces merge readiness discipline in a repeatable way.

## One-Command Orchestrator

Script: `scripts/multi-agent/orchestrator.sh`

Default flow:

1. Run preflight agent
2. Run gate lane (`security:guard`, required RLS test, `pr:verify:hosts`, `e2e:gate`)
3. Optional finalizer lane

## Commands

Via package scripts:

- `pnpm multiagent:preflight`
- `pnpm multiagent:ci-monitor -- --pr <PR_NUMBER> --watch --fail-fast`
- `pnpm multiagent:finalizer -- --pr <PR_NUMBER>`
- `pnpm multiagent:run`
- `pnpm multiagent:run -- --finalize --pr <PR_NUMBER> --watch-ci`

## Exact Thread Starter Texts

### Preflight Agent Thread

```text
Role: Preflight Agent.
Goal: Prepare this worktree for deterministic multi-agent execution.
Run the preflight pipeline only.
Command: pnpm multiagent:preflight
Report:
- whether apps/web/.playwright/state/ks.json and mk.json exist
- first failing error block if any
- PASS/FAIL summary
Do not edit source files.
```

### CI Monitor Agent Thread

```text
Role: CI Monitor Agent.
Goal: Monitor required PR checks and report first failing block immediately.
Command: pnpm multiagent:ci-monitor -- --pr <PR_NUMBER> --watch --fail-fast
Report continuously:
- check snapshot (pass/fail/pending counts)
- first failing error block with details link
No code edits.
```

### Finalizer Agent Thread

```text
Role: Finalizer Agent.
Goal: Execute branch push + PR finalization discipline.
Command: pnpm multiagent:finalizer -- --pr <PR_NUMBER>
Steps:
- verify clean working tree
- push branch
- run pnpm pr:finalize
- report CI snapshot status
No feature edits.
```
