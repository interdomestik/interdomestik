# Security Hardening: Communications & Cron

## Overview

Phase 6 focused on hardening the Messaging, Notifications, and Cron modules. The primary goals were to enforce strict validation, rate limiting, and authenticating system-critical cron jobs.

## Implemented Measures

### 1. Domain Hardening (`domain-communications`)

- **Messages**:
  - **Strict Tenant Scope**: All queries enforced with `withTenant(tenantId)`.
  - **RBAC**: Staff-only access to "Internal" messages. Member access restricted to own claims.
  - **Audit Logging**: `sendMessage` logs events with tenant context.

- **Notifications**:
  - **Ownership checks**: Strict check that `notification.userId === session.user.id`.
  - **Tenant Scope**: Enforced on all queries.

### 2. Actions Hardening (`apps/web/src/actions`)

- **Rate Limiting**:
  - `sendMessage`: **10 req/min** (Prevent spam).
  - `markMessagesAsRead`: **60 req/min** (Prevent abuse).
  - `markNotificationAsRead`: **60 req/min**.
  - `getNotifications`: Validated limit parameter.

- **Validation**:
  - **Zod Schemas**: Applied to all write actions.
  - **Headers**: Updated core functions to accept `requestHeaders` for accurate rate limiting (IP-based).

### 3. Cron Job Security

- **Authentication**:
  - All Cron endpoints (`dunning`, `engagement`, `nps`) enforce `Authorization: Bearer $CRON_SECRET`.
  - No bypass allowed in production or development.

- **Audit & Isolation**:
  - **Audit Logging**: Dunning, Engagement, and NPS cron jobs log detailed audit events for every mutation (email sent/failed).
  - **Tenant Isolation**: Jobs process globally but respect and log strict `tenantId` for each record.

## Verification

### Automated Tests

The following test suites verify the hardening:

```bash
# Domain Logic
pnpm --filter @interdomestik/domain-communications test:unit

# Actions & Rate Limiting
pnpm --filter @interdomestik/web test:unit src/actions/messages.send.test.ts src/actions/messages.mark-read.test.ts src/actions/notifications/mark-read.test.ts

# Cron Security
pnpm --filter @interdomestik/web test:unit src/app/api/cron/dunning/route.test.ts
```

### Manual Verification

- Verified `mark-read` actions reject requests without headers in code analysis.
- Verified Cron endpoints return 401 without correct Secret.

## Future Recommendations

- Consider moving Cron jobs to a separate worker service if scale increases significantly.
- Add "Unsubscribe" header support for engagement emails (currently handled by template logic).
