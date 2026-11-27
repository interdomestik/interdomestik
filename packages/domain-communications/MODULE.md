# Module contract for domain communications

The package handles messages, notifications, and email and Web Push delivery.

## WP-11 preparation

The internal `src/claim-mail/catalogues` directory defines the copy keys and requires text in all five locales for each key. It provides the copy for localized claim emails rendered from supplied facts. Restricted member messages use generic copy. Staff messages use a claim number, a catalogue category and a link.

`./email` exposes `sendEmailOutcome` and `./push` exposes `sendPushOutcome` for the delivery record. Each call uses one named provider and returns a typed outcome within the caller's timeout with a sanitized error code on failure. `./email` also exports `configuredEmailTransports`.

`src/email-transport.ts` owns transport configuration and the single-transport email outcome path.

`src/email.ts` owns provider selection and fallback for `sendEmail`. `src/email-delivery.ts` checks Resend availability, initializes its client, and returns the result when no provider is configured.

`src/engagement-email.ts` binds engagement templates to the shared sender. Callers continue to use the senders exported by `./email`. The email unit lane covers provider delivery, with campaign logging in separate specs.

`sendEmail` accepts an optional synchronous `canDispatch` check. Each SMTP or Resend handoff, including fallback, checks it immediately before invoking the provider. A refused handoff returns `email_dispatch_blocked`.

`./notification-deliveries` owns transactional enqueue, failed delivery listing, and re-drive for `notification_deliveries` (declared in `packages/database/src/schema/notification-deliveries.ts`). `./notification-deliveries/worker` exposes lease operations and rendering to `@interdomestik/domain-claims/claims/notification-delivery-runner`, which runs scheduled and targeted dispatch. The consumer claims one row at a time under a lease and records its transport before calling a provider.

Claim producers write deterministic inbox rows and queue eligible email and push deliveries in the same transaction as the claim event or message. Restricted inbox rows record the preview restriction. Domain claims selects staff recipients at enqueue and re-applies the same selection before delivery.

`./messages/store` handles idempotent message insertion for `@interdomestik/domain-claims/claims/send-message`. That command locks the claim, records the message and its qualifying public response effects in one transaction, and returns the new delivery IDs for post-commit dispatch.

`./messages/select` shares the message and sender projection for reads and command results. It scopes the query to the supplied tenant and applies the caller's operation-specific predicate within the existing transaction.

`./recipient-locale` resolves the stored locale and applies the tenant default. Its preference writer binds the authenticated user to the session authority principal and writes within the authority when it covers the same profile tenant. A session outside that tenant receives a distinct scope-unavailable outcome. `./tenant-locale` exports the tenant default rule.

The expiry notice worker uses `captureVerifiedRecipientInTx` at claim and `authorizeVerifiedRecipientInTx` at dispatch. Both take the caller's read-committed tenant transaction and a live, principal-less scheduled-work authority that matches both tenant settings. After the tenant gate and billing's aggregate lock, they share-lock the current member account, then the exact locale preference. The verified mailbox and supported stored locale are required. The process-local handle binds the tenant, member, lease and both row versions. The worker uses it after claim commit and keeps recipient data out of delivery records. Recipient refusals expose only fixed codes.

The single-provider email outcome path logs only the classified failure code at its SMTP, Resend and outer error boundaries.

`src/recipient-allow-list.ts` adds the staging recipient allow-list to `selectEmailRecipients`, the one recipient filter every application send path uses. A non-empty `EMAIL_RECIPIENT_ALLOWLIST` always turns the gate on. Otherwise it is off only without any deployment marker beyond `INTERDOMESTIK_DEPLOY_ENV` local, development or production, or on a Vercel deployment with exactly `VERCEL_ENV=production` (and `VERCEL_TARGET_ENV` absent or `production`); any staging, preview, partial or unrecognised marker turns it on. There a mailbox is sent to only if `EMAIL_RECIPIENT_ALLOWLIST` names it (ASCII dot-atom, case-insensitive) or its exact domain; an empty or invalid list refuses every recipient, and `.invalid` stays refused even through the automated catcher. A refused send ends as `email_suppressed` and logs only its reason (`allowlist_empty` or `recipient_not_allowlisted`), never the address. Claim deliveries pre-check it and record `skipped`; the expiry worker has no pre-check and records such a refusal as a terminal, non-retryable failure with `email_suppressed`.
