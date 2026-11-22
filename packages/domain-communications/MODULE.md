# Module contract for domain communications

The package handles messages, notifications, and email and Web Push delivery.

## WP-11 preparation

The internal `src/claim-mail/catalogues` directory defines the copy keys and requires text in all five locales for each key. It provides the copy for localized claim emails rendered from supplied facts. Restricted member messages use generic copy. Staff messages use a claim number, a catalogue category and a link.

`./email` exposes `sendEmailOutcome` and `./push` exposes `sendPushOutcome` for the delivery record. Each call uses one named provider and returns a typed outcome within the caller's timeout with a sanitized error code on failure. `./email` also exports `configuredEmailTransports`.

`src/email-transport.ts` owns transport configuration and the single-transport email outcome path.

`./notification-deliveries` owns writes to `notification_deliveries` (declared in `packages/database/src/schema/notification-deliveries.ts`). It exposes transactional enqueue, scheduled and targeted dispatch, failed delivery listing, and re-drive. The consumer claims one row at a time under a lease and records its transport before calling a provider.

Claim producers write deterministic inbox rows and queue eligible email and push deliveries in the same transaction as the claim event or message. Domain claims supplies resolved staff recipients and rechecks staff claim scope before delivery. The notification delivery worker export provides lease operations and rendering to the claim runner. The message storage export handles idempotent insertion for the claim message command.

`./messages/send` takes the claim lock before storing a message and runs the supplied claim response commands for a newly stored qualifying public message in that transaction. It returns the new delivery IDs for the caller's post-commit dispatch.

`./messages/select` shares the message and sender projection for reads and command results. It scopes the query to the supplied tenant and applies the caller's operation-specific predicate within the existing transaction.

`./recipient-locale` resolves the stored locale, applies the tenant default, and writes the caller's preference under session authority. `./tenant-locale` exports the tenant default rule.
