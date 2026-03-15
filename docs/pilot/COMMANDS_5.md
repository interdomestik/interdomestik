## Ranked Pilot-Entry Flow

Use `pnpm pilot:flow` to print this ranked operator path from the repo.

```bash
export DATABASE_URL="postgresql://postgres:postgres@127.0.0.1:54322/postgres"
export BETTER_AUTH_SECRET="local-e2e-secret-32chars-min"
```

## 1. Pre-Launch Readiness

```bash
pnpm pilot:check
```

## 2. Production Gate Proof And Pilot-Entry Artifacts

```bash
pnpm release:gate:prod -- --pilotId <pilot-id>
```

## 3. Launch-Day And Daily Operating Row

```bash
pnpm pilot:evidence:record -- --pilotId <pilot-id> --day <n> --date <YYYY-MM-DD> --owner "<owner>" --status <green|amber|red> --incidentCount <n> --highestSeverity <none|sev3|sev2|sev1> --decision <continue|pause|hotfix|stop> --bundlePath <path|n/a>
```

## 4. Launch-Day And Daily Observability Row

```bash
pnpm pilot:observability:record -- --pilotId <pilot-id> --reference <day-<n>|week-<n>> --date <YYYY-MM-DD> --owner "<owner>" --logSweepResult <clear|expected-noise|action-required> --functionalErrorCount <n> --expectedAuthDenyCount <n> --kpiCondition <within-threshold|watch|breach> --incidentCount <n> --highestSeverity <none|sev3|sev2|sev1> --notes <text|n/a>
```

## 5. Launch-Day And Daily Decision Row

```bash
pnpm pilot:decision:record -- --pilotId <pilot-id> --reviewType <daily|weekly> --reference <day-<n>|week-<n>> --date <YYYY-MM-DD> --owner "<owner>" --decision <continue|pause|hotfix|stop> [--rollbackTag <pilot-ready-YYYYMMDD|n/a>] [--observabilityRef <day-<n>|week-<n>>]
```

## Conditional Commands

Use these only when the ranked flow requires them:

```bash
pnpm pilot:tag:ready -- --pilotId <pilot-id> --date <YYYY-MM-DD>
pnpm pilot:cadence:check -- --pilotId <pilot-id>
```

## Notes

- `pnpm pilot:check` remains the fail-fast local pre-launch pack and is step 1 of this ranked path.
- `pnpm release:gate:prod -- --pilotId <pilot-id>` is the only gate-proof command that also creates canonical pilot-entry artifacts.
- Daily logging is complete only after the operating row, observability row, and decision row are all written into the same copied evidence index.
