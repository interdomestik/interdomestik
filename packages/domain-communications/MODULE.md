# Module contract for domain communications

The package handles messages, notifications, and email and Web Push delivery.

## WP-11 preparation

The internal `src/claim-mail` catalogue renders localized claim emails from supplied facts. Restricted member messages use generic copy. Staff messages use a claim number, a catalogue category and a link.

`./email` exposes `sendEmailOutcome` and `./push` exposes `sendPushOutcome` for the delivery record. Each call uses one named provider and returns a typed outcome within the caller's timeout with a sanitized error code on failure. `./email` also exports `configuredEmailTransports`.

`./notification-deliveries` owns writes to `notification_deliveries` (declared in `packages/database/src/schema/notification-deliveries.ts`). It exposes transactional enqueue, scheduled and targeted dispatch, failed delivery listing, and re-drive. The consumer claims one row at a time under a lease and records its transport before calling a provider.

`./recipient-locale` resolves the stored locale, applies the tenant default, and writes the caller's preference under session authority. `./tenant-locale` exports the tenant default rule.
