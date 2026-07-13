# REC-02 Protected Preview Runbook

This runbook authorizes one deployment-protected **preview** of the standalone Review & Evidence
Console. It does not authorize reassignment of `reviewer-ecohub.vercel.app` or any production
route, database, upload, Supabase, or Interdomestik runtime integration.

## Before deployment

1. Confirm the linked project exactly matches team `team_zZnOjQLylAZArqxcUhLbHDHc`, project
   `prj_Yn7w7tQEAJYaALs2gL2FR9UWgHCc`, and `interdomestik-reviewer-portal`.
2. Run `pnpm accounts:check` with `REVIEW_PORTAL_ACCOUNTS_JSON` supplied privately. Record only
   its fingerprint, never registry content, hashes, passwords, keys, receipts, or cookies.
3. Configure preview-only `REVIEW_PORTAL_ACCOUNTS_JSON`, a 32–64-byte base64url
   `REVIEW_PORTAL_SESSION_SECRET`, PKCS8 `REVIEW_PORTAL_RECEIPT_PRIVATE_KEY`, and trusted
   `REVIEW_PORTAL_RECEIPT_KEYS_JSON`. Publish and verify the public key before activating its
   matching private key.
4. Keep Vercel Deployment Protection enabled. Add a Vercel Firewall rule limiting
   `POST /api/session/login` to five requests per source IP per minute.

## Verification

Run `pnpm verify`, then `vercel build` and `pnpm security:deployment-leakage` before deploying
without assigning an alias.
Through deployment protection, verify named login, role-scoped inboxes, cross-role denial,
logout, signed submission, signature verification, correction lineage, download, keyboard
navigation, and 320/390-pixel layouts.

Send six deliberately invalid login POSTs within one minute from the same test source. The sixth
must return generic `429` with `Retry-After`; correlate it with the exact Firewall rule. Confirm
Vercel logs contain only bounded event code/count objects and trigger the configured alert using
a sustained rate-limit or configuration-failure test. Save no identity or review content.

## Rotation and rollback

Use `pnpm accounts:admin -- <action>` in dry-run mode first. `--apply` remains fail-closed until
an authority-approved provider primitive offers true atomic compare-and-swap; Vercel's current
unconditional environment-variable update must not be represented as CAS.
Increment the account session version for targeted revocation; rotate the session secret for
global revocation. Retain historical receipt public keys.

On any mismatch, stop the preview, disable its deployment, restore the prior preview environment
values, and verify the prior protected deployment. Do not move the production alias. Escalate
partial writes, ineffective revocation, alert failure, or signature failure before retrying.
