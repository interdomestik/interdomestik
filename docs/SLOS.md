# SLOs

This doc defines a small, practical set of Service Level Objectives. Targets can be tightened after real traffic baselines.

## SLO 1: Paddle webhook processing

- **Service**: `POST /api/webhooks/paddle`
- **SLI**: % of webhook requests that return HTTP 2xx **and** end with `webhook_events.processing_result = 'ok'`.
- **Target**: 99.5% over 30 days
- **Alert ideas**:
  - Burn-rate alert on error budget consumption (fast + slow windows)
  - Spike alert on `webhook.failed` audit events

## SLO 2: Document download availability

- **Service**: `GET /api/documents/:id/download`
- **SLI**: % of requests returning HTTP 2xx.
- **Target**: 99.9% over 30 days
- **Alert ideas**:
  - Elevated 5xx rate on download route
  - Elevated `document.forbidden` rate (could indicate RBAC regression or abuse)

## SLO 3: Core API latency

- **Services**: key member/staff APIs (example: `/api/claims`, `/api/auth/*`)
- **SLI**: p95 latency
- **Target**: p95 < 500ms over 7 days (adjust after baseline)

## Notes

- The project already uses Sentry; the recommended next step is to wire these SLOs into Sentry monitors/alerts (or your hosting provider’s metrics) once production telemetry is confirmed.
