## Pilot Purpose

Validate one closed-loop workflow in real branch operations in Kosovo:

`Member submits claim → Agent assists/follows up → Staff triages/updates → Admin monitors SLA drift and intervenes.`

## Scope

- In scope:
  - Member claims-first dashboard: empty + has-claims states.
  - Agent self member-dashboard overlay (session-derived `memberId`, fail-closed).
  - Agent My Members MVP with readiness marker `agent-members-ready`.
  - Staff claims queue MVP with `branch_manager` read-only policy.
  - Admin overview MVP (KPIs + breakdowns).
  - Deterministic seeds, gatekeeper, hardened E2E, Node 20 runtime guard.
- Out of scope:
  - New product features.
  - Routing/auth architecture changes (`apps/web/src/proxy.ts` remains authority).
  - RBAC/shell redesign.
  - Stripe/payment flows.

## Roles and Responsibilities

- Member: Submit claim and provide required supporting details promptly.
- Agent: First response, member guidance, follow-up, and clean handoff context.
- Staff: Triage queue, update claim status, maintain data correctness, meet SLAs.
- Admin: Monitor KPI/SLA drift, supervise escalations, decide continue/pause/rollback.

## Pilot Cohort

- 1 branch.
- 1 staff operator.
- 2 agents.
- 20–50 members.
- Pilot duration: 7 days for the `P8P` rehearsal model.

## SLA Targets

- Timezone and operating hours: `Europe/Pristina`, Monday–Sunday, `08:00–17:00`.
- Triage SLA: First staff triage within `4 operating hours` of claim submission.
- Update SLA: Member-visible update within `24 operating hours` after triage.
- Escalation SLA: Critical privacy/data/security issues escalated to Admin within `1 hour`.

## Operating Rhythm

- Daily ops huddle (15–20 min): Agent + Staff queue review, SLA risk, blockers.
- Daily end-of-day review (10 min): Admin checks KPI drift, incidents, action owners.
- Day 7 executive review (45 min): cumulative evidence review, threshold check, final recommendation.
- Operations are active for the full 7-day rehearsal window.

## Ranked Pilot-Entry Flow

The repo now has one canonical ranked operator flow for pilot entry and daily pilot operation.

- Start with `pnpm pilot:flow` or `docs/pilot/COMMANDS_5.md`.
- Follow the ranked path in this exact order:
  - `pnpm pilot:check`
  - `pnpm release:gate:prod -- --pilotId <pilot-id>`
  - `pnpm pilot:evidence:record -- --pilotId <pilot-id> ...`
  - `pnpm pilot:observability:record -- --pilotId <pilot-id> ...`
  - `pnpm pilot:decision:record -- --pilotId <pilot-id> ...`
- Use `pnpm pilot:tag:ready -- --pilotId <pilot-id> --date <YYYY-MM-DD>` only when a rollback target must be created or verified.
- Use `pnpm pilot:cadence:check -- --pilotId <pilot-id>` for entry or resume cadence proof, not as a replacement for the ranked flow above.

## Readiness Command Authority

Use exactly these command roles:

1. `pnpm pilot:check`
   - Canonical local pre-launch verification command.
   - Runs the fail-fast preflight pack from `scripts/pilot-verify.sh`.
   - Also acts as ranked flow step `1/5`.
   - Verifies operator prerequisites such as env presence, Node 20.x, `pr:verify`, `security:guard`, and `e2e:gate`.
   - Does not create a production release report.
   - Does not create pilot-entry artifacts.
2. `pnpm release:gate:prod`
   - Canonical production full-suite release proof command.
   - Writes the production release report in `docs/release-gates/`.
   - Without `--pilotId`, this is release proof only.
3. `pnpm release:gate:prod -- --pilotId <pilot-id>`
   - Canonical pilot-entry command.
   - Also acts as ranked flow step `2/5`.
   - Uses the same production full-suite release proof run and also creates the full pilot-entry artifact set defined below.
4. `./scripts/pilot-verify.sh`
   - Shell-native implementation of `pnpm pilot:check`.
   - Use only when a direct shell entrypoint is required.
   - Not a separate pilot-entry or production-proof authority.
5. `pnpm pilot:evidence:record -- --pilotId <pilot-id> ...`
   - Canonical daily pilot-operations evidence command.
   - Also acts as ranked flow step `3/5`.
   - Base form: `pnpm pilot:evidence:record -- --pilotId <pilot-id>`.
   - Updates the copied `docs/pilot/PILOT_EVIDENCE_INDEX_<pilot-id>.md` file in place.
   - Reuses `docs/pilot-evidence/index.csv` only to resolve the canonical copied evidence index and latest pilot-entry release report.
   - Does not create a new pilot-entry artifact set and does not replace `pnpm release:gate:prod -- --pilotId <pilot-id>`.
6. `pnpm pilot:observability:record -- --pilotId <pilot-id> ...`
   - Canonical pilot observability evidence command.
   - Also acts as ranked flow step `4/5`.
   - Base form: `pnpm pilot:observability:record -- --pilotId <pilot-id>`.
   - Updates the observability evidence log inside the same copied `docs/pilot/PILOT_EVIDENCE_INDEX_<pilot-id>.md` file.
   - Records structured log-sweep result, KPI condition, incident count, and highest severity for the referenced review window.
   - Does not create a new pilot-entry artifact set and does not replace `pnpm release:gate:prod -- --pilotId <pilot-id>`.
7. `pnpm pilot:decision:record -- --pilotId <pilot-id> ...`
   - Canonical pilot decision-proof command.
   - Also acts as ranked flow step `5/5`.
   - Base form: `pnpm pilot:decision:record -- --pilotId <pilot-id>`.
   - Updates the decision-proof log inside the same copied `docs/pilot/PILOT_EVIDENCE_INDEX_<pilot-id>.md` file.
   - Records explicit daily and weekly `continue`, `pause`, `hotfix`, and `stop` decisions with rollback target, linked observability reference, and resume re-validation proof.
   - Does not create a new pilot-entry artifact set and does not replace `pnpm release:gate:prod -- --pilotId <pilot-id>`.
8. `pnpm pilot:tag:ready -- --pilotId <pilot-id> --date <YYYY-MM-DD>`
   - Canonical pilot-ready tag-discipline command.
   - Reuses the latest canonical pilot-entry row for that pilot id from `docs/pilot-evidence/index.csv`.
   - Creates `pilot-ready-YYYYMMDD` when missing, or verifies the existing tag against the same release report and copied evidence index when it already exists.
   - Requires the referenced `docs/release-gates/...` report and `docs/pilot/PILOT_EVIDENCE_INDEX_<pilot-id>.md` file to exist in `HEAD`.
   - Does not replace `pnpm pilot:check` or `pnpm release:gate:prod -- --pilotId <pilot-id>`; it binds rollback tags to that evidence.
9. `pnpm pilot:cadence:check -- --pilotId <pilot-id>`
   - Canonical readiness-cadence command.
   - Reads the latest canonical pilot-entry row for that pilot id from `docs/pilot-evidence/index.csv`.
   - Evaluates the copied `docs/pilot/PILOT_EVIDENCE_INDEX_<pilot-id>.md` file for consecutive qualifying green operating days.
   - Defaults to a required streak of `3` qualifying green days unless `--requiredStreak` overrides it.

## Canonical Pilot-Entry Artifact Contract

This is the only canonical definition of the pilot-entry artifact contract. A pilot-entry run is a production full-suite release-gate run invoked with a pilot id:

```bash
pnpm release:gate:prod -- --pilotId <pilot-id>
```

Non-production runs, partial-suite runs, and non-canonical artifact destinations do not satisfy pilot-entry custody and must not be treated as pilot-entry evidence.

Each pilot-entry run must create exactly these repo-backed artifacts:

1. A release report in `docs/release-gates/YYYY-MM-DD_production_<deployment>.md`.
2. A copied per-pilot evidence index in `docs/pilot/PILOT_EVIDENCE_INDEX_<pilot-id>.md`, created from `docs/pilot/PILOT_EVIDENCE_INDEX_TEMPLATE.md` on first use and then reused for the same pilot id.
3. A canonical pointer row in `docs/pilot-evidence/index.csv` with stable repo references to the release report and copied evidence index.

`docs/pilot-evidence/index.csv` uses this canonical schema:

```csv
run_id,pilot_id,env_name,gate_suite,generated_at,release_verdict,report_path,evidence_index_path,legacy_log_path
```

Field rules:

- `report_path` and `evidence_index_path` must be stable repo-relative `docs/...` references.
- `legacy_log_path` is only for pre-R01 historical continuity and stays blank for canonical pilot-entry rows.
- The copied evidence index file path is stable per pilot id; daily operations update that file instead of creating a new one each day.

## Daily Evidence Capture

Daily pilot operations must use the copied `docs/pilot/PILOT_EVIDENCE_INDEX_<pilot-id>.md` file as the single source of truth for day-by-day evidence.

- Do not create a second day log, spreadsheet, or free-form note stream for operational status.
- If operators need a structured working sheet before recording the canonical rows, copy `docs/pilot/PILOT_DAILY_SHEET_TEMPLATE.md` for that day and use it as a note-taking companion only.
- The daily sheet is a draft aid for scoring, notes, and role-specific observations. It must feed the copied pilot evidence index and must not replace it.
- Keep `docs/pilot-evidence/index.csv` as the machine-readable pointer layer for pilot-entry artifacts only.
- Record one row per operating day with:
  - day/date
  - owner
  - status
  - release report path
  - evidence bundle path or `n/a`
  - incident count
  - highest severity
  - decision
- Preferred command:

```bash
pnpm pilot:evidence:record -- --pilotId <pilot-id> --day <n> --date <YYYY-MM-DD> --owner "<owner>" --status <green|amber|red> --incidentCount <n> --highestSeverity <none|sev3|sev2|sev1> --decision <continue|pause|hotfix|stop> --bundlePath <path|n/a>
```

- `--reportPath` is optional. When omitted, the command records the latest canonical pilot-entry `docs/release-gates/...` path already linked to that pilot id in `docs/pilot-evidence/index.csv`.
- Use `n/a` for bundle path when no full gate bundle was generated that day.
- Use the same copied evidence index file for the full 7-day rehearsal window.

## Orchestration Traceability

Every pilot day must record:

- lead orchestrator
- worker lanes used
- each lane scope
- what remained centralized
- who merged evidence
- who made the final daily judgment

If no worker lanes are used, record `single-orchestrator run` and explain why in the daily sheet.

## Pilot Learning Loop

Before a new pilot run:

- `pnpm memory:validate`
- `pnpm memory:index`
- retrieve and review the reset-gate lessons defined in `docs/pilot/P8_PILOT_LEARNING_LOOP.md`

After each pilot day:

- if the day exposed a new repeatable pilot failure class, capture a candidate lesson before the next day starts
- use `pnpm memory:candidate:capture --event <event.json> --out <capture.json>` to draft that lesson
- link the capture artifact in the daily sheet evidence references

## Observability Evidence Capture

Daily end-of-day reviews and weekly reviews must record one structured observability row in that same copied evidence index file before a decision row is written.

- Do not leave log-sweep results, KPI condition, or incident severity in chat, memory, or meeting notes only.
- Record one row per review window with:
  - reference
  - date
  - owner
  - log-sweep result
  - functional error count
  - expected authorization-deny noise count
  - KPI condition
  - incident count
  - highest severity
  - notes or repo-backed artifact path
- Preferred command:

```bash
pnpm pilot:observability:record -- --pilotId <pilot-id> --reference <day-<n>|week-<n>> --date <YYYY-MM-DD> --owner "<owner>" --logSweepResult <clear|expected-noise|action-required> --functionalErrorCount <n> --expectedAuthDenyCount <n> --kpiCondition <within-threshold|watch|breach> --incidentCount <n> --highestSeverity <none|sev3|sev2|sev1> --notes <text|n/a>
```

- `expected-noise` is the normal result when the sweep contains only known authorization-deny entries from negative tests.
- `action-required` means the log sweep itself should influence the next `continue`/`pause`/`hotfix`/`stop` decision.
- `kpiCondition` must reflect the active threshold state from `docs/pilot/PILOT_KPIS.md`.

## Readiness Cadence

Readiness cadence is satisfied only after 3 consecutive qualifying green operating days for the pilot id.

A qualifying green day must be recorded in the copied `docs/pilot/PILOT_EVIDENCE_INDEX_<pilot-id>.md` file and must include:

- valid `YYYY-MM-DD` date
- non-empty owner
- `green` status
- valid `docs/release-gates/...` report path already present in the repo
- non-empty bundle path or `n/a`
- `0` incidents
- `none` highest severity
- `continue` decision

Check the cadence with:

```bash
pnpm pilot:cadence:check -- --pilotId <pilot-id>
```

Historical `A22` streak notes remain background only and must not be used as live pilot governance proof.

## Decision Proof Capture

Daily end-of-day reviews and weekly reviews must record an explicit repo-backed decision row in that same copied evidence index file.

- Do not leave continue/pause/hotfix/stop decisions in chat, memory, or meeting notes only.
- Record the matching observability evidence row first.
- Use `reviewType=daily` with `reference=day-<n>` for daily decisions.
- Use `reviewType=weekly` with `reference=week-<n>` for weekly decisions.
- Preferred command:

```bash
pnpm pilot:decision:record -- --pilotId <pilot-id> --reviewType <daily|weekly> --reference <day-<n>|week-<n>> --date <YYYY-MM-DD> --owner "<owner>" --decision <continue|pause|hotfix|stop> [--rollbackTag <pilot-ready-YYYYMMDD|n/a>] [--observabilityRef <day-<n>|week-<n>>]
```

- `--observabilityRef` defaults to the same review reference and must already exist in the observability log.
- `continue`: records no extra resume gate requirements.
- `pause`: records resume requirement `pnpm pilot:check`.
- `hotfix`: requires `--rollbackTag pilot-ready-YYYYMMDD` and records resume requirements for both `pnpm pilot:check` and `pnpm release:gate:prod -- --pilotId <pilot-id>`.
- `stop`: requires `--rollbackTag pilot-ready-YYYYMMDD` and records the same two resume requirements before any resume decision.
- Before using a rollback tag in a decision row, create or verify it with `pnpm pilot:tag:ready -- --pilotId <pilot-id> --date <YYYY-MM-DD>`.

## Weekend Operating Mode (Light-Touch)

- Coverage objective: During weekend operating hours (`08:00–17:00 Europe/Pristina`), monitor and log actively while avoiding non-critical change churn.
- Weekend scope (Saturday/Sunday, within defined operating hours):
  - Monitor guardrails, incidents, and SLA drift.
  - Log findings and ownership in the pilot incident log.
  - Apply hotfixes only for Sev1 issues that materially impact operating-hours SLAs.
- Weekend escalation:
  - Sev1 (privacy/tenant isolation/data integrity): immediate escalation and hotfix allowed.
  - Sev2/Sev3: log and pause until next weekday ops huddle unless a stop criterion is met or risk escalates to Sev1.

## Weekend Ceremony Checklist (Saturday/Sunday)

Run from repository root:

```bash
date -Is
git rev-parse --abbrev-ref HEAD
git rev-parse HEAD
git status --porcelain
pnpm security:guard
```

- Record results in the copied per-pilot evidence index referenced by the canonical pilot-entry artifact set.
- For pilot entry, create or refresh the artifact set by running `pnpm release:gate:prod -- --pilotId <pilot-id>` before daily updates begin.
- For daily updates, record the operating result in that same copied evidence index file with `pnpm pilot:evidence:record -- --pilotId <pilot-id> ...`.
- If Sev1 requires hotfix workflow evidence, run:
  - after hotfix merge to clean, synced `main`: `./phase-5-1.sh`
  - fallback on clean, synced `main`: `bash ./phase-5-1.sh`
- Evidence bundle path convention for full gate runs:
  - `tmp/pilot-evidence/phase-5.1/<YYYY-MM-DDTHH-MM-SS+ZZZZ>/`
- If no full gate run is required, use `n/a` for bundle path in the evidence index row.

## Weekend Escalation Decision Table

| Condition                                                                 | Weekend Action                                 | Decision |
| ------------------------------------------------------------------------- | ---------------------------------------------- | -------- |
| Sev1 (privacy, tenant isolation, data integrity, or stop-criteria threat) | Immediate escalation + hotfix allowed          | `hotfix` |
| Sev2 (closed-loop break, major SLA breach) without Sev1 promotion         | Log, assign owner, pause until next ops review | `pause`  |
| Sev3 (non-critical with workaround)                                       | Log, assign owner, pause until next ops review | `pause`  |
| Any stop criterion reached                                                | Trigger rollback policy immediately            | `stop`   |

## Incident Escalation

- Severity model:
  - Sev1: Privacy/tenant isolation/data integrity risk.
  - Sev2: Closed-loop workflow broken or major SLA breach.
  - Sev3: Non-critical regression with workaround.
- Escalation path: Agent/Staff on-call → Admin owner → Engineering lead.
- Communication target:
  - Sev1: Immediate and under 1 hour.
  - Sev2: Same operating day.
  - Sev3: Next scheduled daily review.

## Stop Criteria

Stop pilot immediately if any applies:

- Tenant isolation/privacy breach.
- Data integrity corruption (lost, duplicated, or cross-tenant claim data).
- Persistent `security:guard` failure.
- Repeated authentication/login failures for pilot users that block daily operations.
- Closed-loop workflow unavailable for more than one operating day.
- Triage/update SLA misses for 3 consecutive operating days.
- Persistent E2E contract failures after rollback attempt.

## Rollback Policy

- Maintain and verify a known-good pilot tag: `pilot-ready-YYYYMMDD`.
- Create or verify that tag with `pnpm pilot:tag:ready -- --pilotId <pilot-id> --date <YYYY-MM-DD>` so the rollback target is bound to the canonical pilot-entry report and copied evidence index already recorded in `docs/pilot-evidence/index.csv`.
- On stop criteria:
  - Roll back deployment to latest pilot-ready tag.
  - Re-run readiness checks from `docs/pilot/COMMANDS_5.md` before resume decision.
  - Resume only after fresh `pnpm pilot:check` re-validation and a new `pnpm release:gate:prod -- --pilotId <pilot-id>` row for the resumed date, then create or verify the next `pilot-ready-YYYYMMDD` tag with `pnpm pilot:tag:ready -- --pilotId <pilot-id> --date <YYYY-MM-DD>`.
  - Record the stop decision itself with `pnpm pilot:decision:record -- --pilotId <pilot-id> --reviewType <daily|weekly> --reference <day-<n>|week-<n>> --decision stop --rollbackTag pilot-ready-YYYYMMDD ...`.
