# Module contract for domain communications

The package handles messages, notifications, and email and Web Push delivery.

## WP-11 preparation

The internal `src/claim-mail/catalogues` directory defines the copy keys and requires text in all five locales for each key. It provides the copy for localized claim emails rendered from supplied facts. Restricted member messages use generic copy. Staff messages use a claim number, a catalogue category and a link.

`./email` exposes `sendEmailOutcome` and `./push` exposes `sendPushOutcome` for the delivery record. Each call uses one named provider and returns a typed outcome within the caller's timeout with a sanitized error code on failure. `./email` also exports `configuredEmailTransports`.

`src/email-transport.ts` owns transport configuration and the single-transport email outcome path.

`src/email-delivery.ts` owns provider selection and fallback for `sendEmail`. The email unit lane keeps provider delivery and campaign logging in separate specs.

`sendEmail` accepts an optional synchronous `canDispatch` check. Each SMTP or Resend handoff, including fallback, checks it immediately before invoking the provider. A refused handoff returns `email_dispatch_blocked`.

`./notification-deliveries` owns transactional enqueue, failed delivery listing, and re-drive for `notification_deliveries` (declared in `packages/database/src/schema/notification-deliveries.ts`). `./notification-deliveries/worker` exposes lease operations and rendering to `@interdomestik/domain-claims/claims/notification-delivery-runner`, which runs scheduled and targeted dispatch. The consumer claims one row at a time under a lease and records its transport before calling a provider.

Claim producers write deterministic inbox rows and queue eligible email and push deliveries in the same transaction as the claim event or message. Restricted inbox rows record the preview restriction. Domain claims selects staff recipients at enqueue and re-applies the same selection before delivery.

`./messages/store` handles idempotent message insertion for `@interdomestik/domain-claims/claims/send-message`. That command locks the claim, records the message and its qualifying public response effects in one transaction, and returns the new delivery IDs for post-commit dispatch.

`./messages/select` shares the message and sender projection for reads and command results. It scopes the query to the supplied tenant and applies the caller's operation-specific predicate within the existing transaction.

`./recipient-locale` resolves the stored locale and applies the tenant default. Its preference writer binds the authenticated user to the session authority principal and writes within the authority when it covers the same profile tenant. A session outside that tenant receives a distinct scope-unavailable outcome. `./tenant-locale` exports the tenant default rule.
