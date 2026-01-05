# Runbook

This is the minimal operational runbook for Interdomestik.

## Webhooks (Paddle)

### Symptoms

- Membership status not updating
- Commissions not created
- Dunning emails not sent

### What to check

- Env vars:
  - `PADDLE_API_KEY`
  - `PADDLE_WEBHOOK_SECRET_KEY`
  - `NEXT_PUBLIC_PADDLE_ENV`
  - Dev-only: `PADDLE_WEBHOOK_BYPASS_SIGNATURE_IN_DEV` must be unset/false in production
- Endpoint:
  - `POST /api/webhooks/paddle`
- Database:
  - `webhook_events` should record incoming events, dedupe keys, and processing results
  - `audit_log` should include `webhook.received`, `webhook.processed`, `webhook.failed`, `webhook.duplicate`

### First response

- Confirm provider is sending webhooks to the right URL.
- If you see `webhook.invalid_signature` events:
  - Verify the webhook secret configured in Paddle matches `PADDLE_WEBHOOK_SECRET_KEY`.
  - Confirm the request headers include `paddle-signature`.

### Recovery actions

- For failed events (`webhook_events.processing_result = 'error'`):
  - Inspect `webhook_events.error` and correlate with server logs.
  - If safe, re-send the webhook from the Paddle dashboard (idempotency should prevent double-apply).

## Documents

### Endpoints

- Signed URL issuance (legacy, still supported): `GET /api/documents/:id`
- Proxy download (preferred for access logs): `GET /api/documents/:id/download`
  - Optional: `?disposition=inline` for in-browser viewing

### What to check

- Authorization/RBAC failures:
  - Staff/Admin should be allowed.
  - Members should be allowed if they own the claim.
  - Uploaders are allowed for backwards compatibility.
- Audit logs:
  - `audit_log.action` should include `document.download`, `document.view`, `document.signed_url_issued`, and `document.forbidden`.

### Storage issues

- Verify bucket name (`claim_documents.bucket`) exists in Supabase Storage.
- Verify the path (`claim_documents.file_path`) exists.

## Cron jobs

### Protection

- Cron endpoints require `Authorization: Bearer $CRON_SECRET`.
- Dev note: cron endpoints require `CRON_SECRET` even locally (no bypass flag).

### Endpoints

- `GET /api/cron/dunning`
- `GET /api/cron/engagement`
- `GET /api/cron/nps`

### Engagement email cadence

The engagement cron sends lifecycle emails to active subscribers at:

- Day 7 (onboarding card reminder)
- Day 14 (check-in)
- Day 30 / 60 / 90 (retention touchpoints)

Idempotency is enforced via the `engagement_email_sends` table (unique `dedupe_key`).

### NPS survey automation

- Cron: `GET /api/cron/nps` sends a one-time NPS survey email around Day 45.
- Idempotency: tracked via `engagement_email_sends` using `template_key = nps_v1`.
- Survey UX: users land on `/:locale/nps/:token` (token is single-use + expiring).
- API submit: `POST /api/public/nps`.

## Triage checklist

- Is the database reachable?
- Are required env vars present?
- Are we failing auth/rate-limit?
- Do `audit_log` / `webhook_events` show activity for the incident window?

## Auth (password reset)

### What it is

- Request reset email: `POST /api/auth/request-password-reset`
- Callback redirect: `GET /api/auth/reset-password/:token?callbackURL=...`
- App reset page consumes `?token=...`: `GET /:locale/reset-password?token=...`

### What to check

- Email delivery:
  - `RESEND_API_KEY`
  - `RESEND_FROM_EMAIL` (or `RESEND_FROM`)
- Behavior should be non-enumerating:
  - The API responds with a generic success message even if the email doesn’t exist.
- Audit trail:
  - `audit_log.action = 'auth.password_reset_requested'` records request intent (no email stored).

## SLOs & alerts (Sentry)

This repo includes SLO targets in [docs/SLOS.md](docs/SLOS.md). In Sentry, use these alert types:

- **Burn-rate alerts (SLO-based)**: best for sustained availability/reliability degradation.
  - **SLO 1 (Paddle webhooks)**: burn-rate alert on webhook processing success rate.
  - **SLO 2 (Document downloads)**: burn-rate alert on download success rate.
- **Simple threshold alerts**: best for fast detection of spikes and regressions.
  - **Webhook errors**: metric/issue alert on elevated 5xx for `POST /api/webhooks/paddle` and spikes in `webhook.failed` / `webhook.invalid_signature` events.
  - **Document route errors**: metric/issue alert on elevated 5xx for `GET /api/documents/:id/download`.
- **Performance alerts**: best for latency SLOs.
  - **SLO 3 (Core API latency)**: performance alert on p95 transaction duration for key API routes (start with `/api/claims`).
