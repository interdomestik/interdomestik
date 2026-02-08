# PHASE_5_6_SPECS.md — Weekend (Sat/Sun) Pilot Cadence Operationalization

## Goal

Operationalize the Mon–Sun pilot cadence with deterministic weekend execution evidence while keeping pilot duration fixed at 14 days.

## Non-Goal

- No product/runtime behavior change.
- No routing/proxy/auth/RBAC/tenancy change.
- No pilot duration change.

## Scope

### In Scope

- Pilot runbook/checklist/docs updates.
- Weekend (Saturday/Sunday) ceremony checklist aligned with light-touch mode.
- 14-day evidence index template with deterministic fields.
- Escalation decision table clarifying Sev1 vs Sev2/Sev3 weekend handling.

### Out of Scope

- Any app code or runtime behavior.
- Any changes to `apps/web/src/proxy.ts`.
- Any route/page/auth/RBAC/tenancy architecture edits.
- Any changes to readiness markers or test IDs.

## Weekend Operating Contract (Light-Touch)

- Operating window: `08:00–17:00 Europe/Pristina`.
- Saturday/Sunday default mode: monitor + log.
- Change policy: hotfixes allowed only for Sev1 conditions.
- Sev2/Sev3 on weekends: log, assign owner, defer to weekday ops huddle unless promoted to Sev1 or stop criteria is met.

## Deterministic Ceremony Commands

Run from repository root:

```bash
# Pre-check context
date -Is
git rev-parse --abbrev-ref HEAD
git rev-parse HEAD
git status --porcelain

# Weekend safety check (docs/runtime invariant guard)
pnpm security:guard
```

If Sev1 incident requires hotfix gating evidence:

```bash
# Canonical
./phase-5-1.sh

# Fallback
bash ./phase-5-1.sh
```

## Evidence Location Convention

- Phase 5.1 gate bundle path:
  - `tmp/pilot-evidence/phase-5.1/<YYYY-MM-DDTHH-MM-SS+ZZZZ>/`
- Pilot ops evidence index:
  - `docs/pilot/PILOT_EVIDENCE_INDEX_TEMPLATE.md`
- Weekend daily entry format:
  - `Day <N> | <YYYY-MM-DD> | <owner> | <status> | <bundle-path-or-n/a> | <incident-count> | <highest-sev> | <decision>`

## Acceptance Criteria

1. Weekend Sat/Sun procedure exists in the runbook with explicit commands.
2. Evidence index template exists for full 14-day pilot tracking with required fields:
   - day/date/owner/status/bundle path/incidents/sev/decision
3. Escalation decision table explicitly states:
   - Sev1 immediate escalation/hotfix allowed
   - Sev2/Sev3 deferred unless promoted
4. Wording is unambiguous for substitute operators.
5. Diff is docs-only.

## Validation (Before PR)

- `pnpm security:guard` passes.
- `./phase-5-1.sh` passes on clean `main`.
- Any existing docs check/lint command (if configured) passes.

## Exit Criteria

- One docs-only PR is ready with all above acceptance criteria met.
