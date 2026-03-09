# Incident Playbook

This is the canonical incident response playbook for Interdomestik `v0.1.0`.

Use this document for production outages, data-integrity incidents, privacy or tenant-isolation risk, and sustained workflow degradation that affects active users or pilot operations.

Related operator docs:

- [RUNBOOK.md](./RUNBOOK.md)
- [SLOS.md](./SLOS.md)
- [pilot/PILOT_RUNBOOK.md](./pilot/PILOT_RUNBOOK.md)

## Scope And Assumptions

- This playbook is role-based and works even if the current on-call model is a single engineering owner.
- The current escalation path is manual, not PagerDuty-driven.
- `apps/web/src/proxy.ts` remains the authority for routing, access control, and tenant isolation. Incident fixes must not bypass it.
- Prefer rollback or feature containment before broad refactors.
- For pilot-specific stop criteria and weekend handling, defer to [pilot/PILOT_RUNBOOK.md](./pilot/PILOT_RUNBOOK.md).

## Severity Levels

| Severity | Use When                                                                             | Response Target                         | Default Action                                                          |
| -------- | ------------------------------------------------------------------------------------ | --------------------------------------- | ----------------------------------------------------------------------- |
| `Sev1`   | Tenant isolation, privacy, security, data corruption, or sustained production outage | Immediate acknowledgment and escalation | Freeze deploys, contain, rollback or hotfix under incident command      |
| `Sev2`   | Major workflow degradation with active user impact and no safe workaround            | Same operating hour                     | Contain quickly, restore critical path, assign owner and update cadence |
| `Sev3`   | Limited degradation with workaround or narrow blast radius                           | Same operating day                      | Triage, mitigate, schedule durable fix                                  |
| `Sev4`   | Low-impact issue, cosmetic defect, or documentation-only gap                         | Next business day                       | Track normally, no live incident flow required                          |

## Roles And Escalation Path

| Role                      | Responsibility                                                         |
| ------------------------- | ---------------------------------------------------------------------- |
| Incident commander        | Own timeline, severity, decisions, and update cadence                  |
| Platform on-call          | Run triage, collect evidence, drive containment and rollback steps     |
| Admin owner               | Validate operational impact, member-facing risk, and business priority |
| Engineering lead          | Approve risky mitigation, rollback, or hotfix path                     |
| Legal or compliance owner | Join immediately for privacy, regulatory, or cross-tenant exposure     |

Escalation order:

1. Platform on-call
2. Admin owner
3. Engineering lead
4. Legal or compliance owner in parallel for `Sev1` privacy or data incidents

## First 15 Minutes

1. Declare the incident.
2. Assign one incident commander.
3. Record:
   - start time
   - severity
   - impacted tenants, roles, and routes
   - latest suspect deploy, migration, or configuration change
4. Freeze non-emergency deploys until containment is complete.
5. Open a running incident log in the active coordination channel or ticket.
6. Collect baseline evidence.

If you are reproducing or validating from a clean local checkout, start with:

```bash
date -Is
git rev-parse --abbrev-ref HEAD
git rev-parse HEAD
pnpm security:guard
curl -fsS http://127.0.0.1:3000/api/health
```

If the incident is already live in production, also capture:

- current Vercel deployment URL and deployment status
- relevant Sentry issue or trace links
- Supabase status or service health
- last known-good commit or deployment

## Initial Triage Checklist

- What is the user-visible symptom?
- Is the blast radius global, tenant-specific, route-specific, or operator-only?
- Did the issue start after a deploy, migration, seed change, or secret rotation?
- Is tenant isolation, privacy, or data integrity at risk?
- Is the database reachable?
- Does `GET /api/health` fail?
- Are critical env vars or external dependencies missing or degraded?
- Do `audit_log`, webhook logs, or Sentry events show a clear failing signature?

Raise severity immediately to `Sev1` if any answer indicates:

- cross-tenant access
- privacy exposure
- corrupted or lost data
- blocked login or claims flow across production

## Containment Decision Table

| Situation                                      | Immediate Move                                                                                                        |
| ---------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| Recent deploy caused regression                | Roll back to the latest healthy Vercel deployment or redeploy the last known-good commit                              |
| Feature-specific failure with safe kill switch | Disable the feature, contain traffic, and keep the rest of production serving                                         |
| Data-integrity or privacy risk                 | Freeze writes if possible, preserve evidence, escalate to `Sev1`, and do not run destructive cleanup without approval |
| External dependency outage                     | Confirm provider status, degrade gracefully if possible, and communicate dependency impact clearly                    |
| Configuration or secret drift                  | Restore the last known-good configuration, then verify health and smoke routes                                        |

## Recovery Flow

### Application Rollback

1. Roll back to the latest healthy deployment in Vercel.
2. If UI rollback is unavailable, redeploy the last known-good commit.
3. Re-run the minimum verification set:
   - `pnpm security:guard`
   - `pnpm e2e:gate`
   - `pnpm --filter @interdomestik/web run e2e:smoke`
4. Confirm:
   - `GET /api/health`
   - critical member, agent, staff, and admin flows
   - no new `Sev1` or `Sev2` Sentry spikes

### Database Recovery

1. Prefer a forward fix unless rollback is the only safe option.
2. Before rollback:
   - snapshot or back up the database
   - record the migration IDs in scope
   - assign one rollback owner
3. Validate the rollback in staging first when time and risk allow.
4. After rollback, verify:
   - tenant isolation
   - claims and document read or write paths
   - audit-log writes for the restored surface

### Pilot Recovery

If the incident affects pilot operations, apply the stop or rollback rules in [pilot/PILOT_RUNBOOK.md](./pilot/PILOT_RUNBOOK.md) before resuming normal flow.

## Communication Templates

### Incident Opened

```text
Incident: [SEV?] [short summary]
Start: [timestamp]
Commander: [name or role]
Impact: [tenants, roles, routes, or workflow]
Current action: [triage / rollback / hotfix / containment]
Next update: [time]
```

### Incident Resolved

```text
Resolved: [SEV?] [short summary]
Resolved at: [timestamp]
Root cause: [one sentence, if known]
User impact: [brief summary]
Follow-up: RCA due by [date], owner [name or role]
```

## Incident Closure Checklist

- production health restored
- containment removed or converted into intentional config
- rollback or hotfix verified
- customer or operator impact summarized
- follow-up owner assigned
- RCA scheduled for `Sev1` and `Sev2`

## RCA Template

Use this template for `Sev1` and `Sev2` incidents, and for any `Sev3` incident that repeats.

```markdown
# Incident RCA: [title]

- Severity:
- Start time:
- End time:
- Incident commander:
- Impacted tenants / roles / routes:

## Summary

## Timeline

## Root Cause

## Containment

## Permanent Fix

## What Worked

## What Failed

## Follow-Up Actions
```

## Related Verification Surface

Use the canonical repository gates when validating a recovery or hotfix branch:

- `pnpm security:guard`
- `pnpm pr:verify`
- `pnpm e2e:gate`

If the incident concerns alerting or error-budget burn, use [SLOS.md](./SLOS.md) as the source of truth for the current monitoring targets.
