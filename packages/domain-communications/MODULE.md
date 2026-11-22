# Module contract for domain communications

The package handles messages, notifications, and email and Web Push delivery.

## WP-11 preparation

The internal `src/claim-mail` catalogue renders localized claim emails from supplied facts. Restricted member messages use generic copy. Staff messages use a claim number, a catalogue category and a link.

`./email` exposes `sendEmailOutcome` and `./push` exposes `sendPushOutcome` for future delivery records. Each returns a typed outcome within the caller's timeout and reports a bounded provider code or status on failure. Email uses SMTP first when configured and attempts Resend after a definite pre-acceptance SMTP failure.
