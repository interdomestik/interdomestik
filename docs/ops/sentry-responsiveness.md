# Sentry responsiveness monitoring

The owner approved sampled tracing, consented masked Replay, and diagnostic Login/Submit outcomes on 2026-10-05. This records observations; it does not make navigation faster or establish a latency SLO.

Browser/server/edge traces default to 10%; explicit zero disables that sampling. Consented Replay defaults to 1% of sessions and 10% of error sessions. Unknown or necessary-only cookie consent never starts or buffers Replay. Replay is limited to inspected public landing and plain Login URLs with no query or fragment; the entire public intake section is blocked. Private member, agent, staff and admin pages never record Replay. A route transition stops recording. All text/inputs are masked, media blocked, known DOM attributes masked, and network/console recording events discarded. The transport privacy hooks remove request bodies, credentials, query/fragments, private identifiers and raw database statements. Keep source maps/release identity through the existing deployment pipeline.

Critical `login_submit` and `saved_draft_submit` operations use fixed action/outcome tags and numeric duration only. Three seconds is a diagnostic slow threshold, ten seconds a stalled watchdog; neither cancels or retries an action or claims p95 compliance. Authentication arrival is verified separately with actual browser outcomes; starting navigation is not proof the destination loaded.

## Staging alert setup

Set both deployment variables `SENTRY_ENVIRONMENT=staging` and `NEXT_PUBLIC_SENTRY_ENVIRONMENT=staging` before the staging build; the client value is embedded at build time. Confirm event labels in Sentry before applying alerts. Without explicit environment configuration, the existing runtime fallback is `NODE_ENV`, which labels a production build as production even on a staging host.

Inspect the prepared catalog without credentials:

```sh
node scripts/sentry-responsiveness-alerts.mjs catalog
```

With an explicitly approved Sentry credential source supplying `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, `SENTRY_PROJECT`, and `SENTRY_ENVIRONMENT=staging`, check then apply:

```sh
node scripts/sentry-responsiveness-alerts.mjs check
node scripts/sentry-responsiveness-alerts.mjs apply
node scripts/sentry-responsiveness-alerts.mjs check
```

The token needs `alerts:read`/`alerts:write`. Rules reuse the existing D07 warning/critical notification routing. Missing routing fails closed; the script does not invent recipients, overwrite production rules, or default to production. The three count alerts concern Login failure/stall, Submit failure/stall, and slow critical actions, using one/five signals per five-minute window as initial diagnostic thresholds. Review actual volume after staging verification.

## Acceptance

Confirm the exact staging release, then exercise normal Login and a deliberate Submit using approved fixtures. Check captured fixed action/outcome tags, sampled spans, and a consented Replay with no private form values, media, query/fragment secrets or network bodies. Confirm no Replay before consent or after revocation. Exercise failure/stall without automatic retry and compare exact draft/claim state. Browser checks must assert editable Login and canonical submission success; an HTTP200 or capture call alone proves neither. Capture receipt IDs, environment and actual alert routing without publishing member data. No live alert or event-delivery claim is valid until account verification passes.

Signed-in Sentry browser inspection is now explicitly authorized. The inspected project is `human-p5/interdmestik-nextjs` (ID4510664667693136); its environment picker has no `staging` yet and Allowed Domains lists local development hosts only. Reconcile the exact staging origin without wildcard broadening, then confirm an event from the exact staging release before applying staging alerts. Vercel connector access still returns403 for `ecohub`, so setting the deployment labels awaits that access. Automatic approval review rejected sourcing a Sentry token from private reproduction environment files; that source must not be retried indirectly. No alert configuration has been saved or tested yet. Production rollout and spending are outside this staging increment.
