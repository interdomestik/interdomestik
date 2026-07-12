---
status: approved
owner: platform
reviewed: 2026-07-12
related:
  - docs/superpowers/specs/2026-07-12-rec-02-named-role-scoped-reviewer-access-design.md
  - docs/superpowers/specs/2026-07-12-rec-02-security-contract.md
---

# REC-02 Operations And Verification

## Configuration And Administration

Production requires `REVIEW_PORTAL_ACCOUNTS_JSON`, `REVIEW_PORTAL_SESSION_SECRET`, and
`REVIEW_PORTAL_RECEIPT_PRIVATE_KEY` with its active key ID. Trusted versioned public
keys are non-secret verifier inputs. Real credentials, hashes, private keys, cookies,
and receipt content never enter Git, browser bundles, logs, screenshots, CI, or PR text.

The administrator CLI validates the complete registry and can add, rotate, disable, or
increment one account's session version. It uses a cryptographically secure salt, reads
plaintext only through a hidden prompt or protected standard input, rejects passwords
shorter than 20 characters, and directs administrators to password-manager-generated
unique values.

Dry-run is the default. Apply mode uses direct process invocation without a shell, pins
immutable Vercel team/project IDs and environment, fetches the remote fingerprint, and
refuses a stale compare-and-swap update. It passes the registry to `vercel env` through
standard input, verifies the post-write fingerprint, creates a protected deployment,
and proves the intended session-version change. Project mismatch, concurrency, partial
write, failed deployment, or ineffective revocation stops the operation.

Rotate the session secret at least every 90 days or after exposure; this invalidates all
sessions. Rotate the receipt key at least annually or after exposure. Publish the public
key before private-key activation and retain historical public keys.

## Rate Limit And Events

The login endpoint requires a Vercel Firewall limit of at most five POST attempts per
source IP per minute. Generic `429` responses include `Retry-After` and reveal no account
state. Preview stays behind deployment protection. The six-request probe deliberately
passes deployment protection, targets login, and correlates `429` with the exact firewall
rule in project logs.

Emit only bounded event codes/counts for failed login, rate limit, configuration,
session, role boundary, and receipt signature failures to isolated Vercel logs. Events
omit identity and review content. Production deployment must prove an alert for sustained
rate-limit or configuration failure. Central Interdomestik logging remains excluded.

## Test-First Proof

Implementation must prove:

- valid, wrong, unknown, disabled, duplicate, malformed, expired, stale-version,
  tampered, and wrong-origin authentication paths;
- normalized usernames, dummy PBKDF2 timing parity, salt/hash length, password/iteration
  bounds, secure cookies, exact live account binding, logout, and targeted revocation;
- CLI add/rotate/disable/invalidate, password non-reflection, immutable project/team/
  environment pinning, stale-fingerprint rejection, direct-process stdin handoff,
  post-write fingerprint, deployment, and effectiveness proof;
- all four roles, empty inboxes, cross-user/role denial, continuation isolation, direct
  path denial, and build/client/source-map fixture leakage detection;
- private/no-store headers on every authenticated response;
- server-owned normal/correction receipt envelopes, prior-receipt linkage, canonical
  Unicode golden vectors, tamper rejection, wrong key/key-ID rejection, two-phase
  rotation, and historical verification;
- account-scoped draft recovery, session expiry, A-logout-B isolation, cross-tab conflict,
  export/delete, and no automatic submission;
- Albanian-first keyboard, screen-reader, desktop, and 320-pixel mobile flows;
- protected-preview firewall, security-event, alert, and rollback proof;
- complete console tests, modularity, security guard, `pnpm pr:verify`,
  `pnpm security:guard`, `pnpm e2e:gate`, independent review, and current-head PR checks.
