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

Remote `check` and `apply` are deliberately disabled. Both fail before reading credentials or issuing requests. The catalog is a preparation artifact, not account verification, a writable API payload, or proof of notification delivery. It requires the exact project, a verified staging event, and verified notification routing; it never chooses recipients.

Sentry removed legacy alert APIs on August 17, 2026; they return HTTP 410 without a compatibility exemption. Current monitoring uses project detectors and separate organization workflows. See the [official migration notice](https://www.sentry.help/en/articles/15015315-migrating-to-new-detectors-and-alerts-apis), [Monitors & Alerts API](https://docs.sentry.io/api/monitors/), [Create Monitor](https://docs.sentry.io/api/monitors/create-a-monitor-for-a-project/), and [Create Alert](https://docs.sentry.io/api/monitors/create-an-alert-for-an-organization/). Supported creation paths are `/api/0/organizations/{org}/projects/{project}/detectors/` and `/api/0/organizations/{org}/workflows/`. Implementing safe routing/linkage reconciliation is outside this bounded catalog tool.

Complete setup in the signed-in current UI:

1. Select only `human-p5/interdmestik-nextjs` (project ID 4510664667693136). Confirm a received event from the exact staging release with environment `staging`. If staging is absent from the environment picker, stop; production is not a fallback.
2. In **Monitors & Alerts**, create three new metric monitors using **Number of Errors** and the exact catalog names and queries. Use Errors/default events (`events`, event types `default`/`error`, query type 0), `count()`, environment **staging**, and a five-minute window. Fixed captureMessage outcomes are event records, so a Spans dataset would measure a different signal. Modern API windows use seconds; five minutes is 300 seconds.
3. Keep the catalog thresholds: warning 1 and critical 5, above-threshold direction, and the existing owner-approved priority/recovery convention. Review the rendered threshold predicates before saving; do not silently change them to a different volume rule. These are initial diagnostic thresholds, not an SLO.
4. Create a **new staging alert** connected only to the three new staging monitors. Keep its environment **staging**. Reuse the verified **Notify team #human** target in each warning/critical condition block, with the owner-approved frequency and de-escalation behavior. If that target or either condition block cannot be verified, leave setup incomplete. Do not edit, connect new monitors to, or test the existing production D07 alert.
5. Inspect saved monitor environment, project, source/query/window/thresholds and connected alert IDs. Inspect the new alert's connected monitors, staging scope and both notification actions. Use the UI test/preview and an approved staging fixture to verify the selected #human route; record results and receipts only after they are observed.

Owner inspection on 2026-10-05 found production D07 monitor 893756 linked to alert 421108. That alert has All environments and two IF-any blocks (priority at least high or de-escalates; priority at least medium or de-escalates), both notifying team #human on every trigger. This is a routing reference only: it has no staging monitor and must remain unchanged. Its migrated Spans chart error is outside this staging change. Notification configuration for this increment remains pending until the new staging event and account setup are verified.

## Acceptance

Confirm the exact staging release, then exercise normal Login and a deliberate Submit using approved fixtures. Check captured fixed action/outcome tags, sampled spans, and a consented Replay with no private form values, media, query/fragment secrets or network bodies. Confirm no Replay before consent or after revocation. Exercise failure/stall without automatic retry and compare exact draft/claim state. Browser checks must assert editable Login and canonical submission success; an HTTP200 or capture call alone proves neither. Capture receipt IDs, environment and actual alert routing without publishing member data. No live alert or event-delivery claim is valid until account verification passes.

Signed-in Sentry browser inspection is now explicitly authorized. The inspected project is `human-p5/interdmestik-nextjs` (ID 4510664667693136); initial inspection found no `staging` environment and only local development Allowed Domains. Subsequent owner inspection on 2026-10-05 confirmed Allowed Domains also includes `https://staging.interdomestik.com/`. Reconcile the exact staging origin without wildcard broadening, then confirm an event from the exact staging release before applying staging alerts. Vercel connector access returned 403 for `ecohub`; the owner subsequently set both staging labels in Preview through the signed-in browser. The repository staging pipeline pulls Preview variables before building; confirm the exact new release and arriving event rather than redeploying an old Production artifact. Automatic approval review rejected sourcing a Sentry token from private reproduction environment files; that source must not be retried indirectly. No alert configuration has been saved or tested yet. Production rollout and spending are outside this staging increment.
