# Novu Notification Integration

This document outlines the Novu integration for Interdomestik.

## Configuration

Required environment variables in `.env`:

```bash
NOVU_API_KEY=your_anyu_api_key
NEXT_PUBLIC_NOVU_APP_ID=your_novu_app_id
```

## Workflows

You need to create the following workflows in the Novu Dashboard with the exact trigger identifiers:

### 1. Claim Submitted (`claim_submitted`)

Triggered when a member submits a new claim.
**Payload:**

- `claimId`: string
- `claimTitle`: string
- `category`: string

### 2. Claim Assigned (`claim_assigned`)

Triggered when a claim is assigned to an agent.
**Payload:**

- `claimId`: string
- `claimTitle`: string
- `agentName`: string

### 3. Claim Status Changed (`claim_status_changed`)

Triggered when a claim status is updated.
**Payload:**

- `claimId`: string
- `claimTitle`: string
- `oldStatus`: string
- `newStatus`: string

### 4. New Message (`new_message`)

Triggered when a message is sent on a claim.
**Payload:**

- `claimId`: string
- `claimTitle`: string
- `senderName`: string
- `messagePreview`: string (first 100 chars)

## In-App Notification Center

The notification center is integrated into the dashboard header. It uses the default Novu styles tailored to the application theme.

## Testing

Unit tests are available in `apps/web/src/lib/notifications.test.ts`.
Run `pnpm test:unit` to verify the integration logic.
