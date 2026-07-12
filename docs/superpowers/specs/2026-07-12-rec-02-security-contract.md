---
status: approved
owner: platform
reviewed: 2026-07-12
related:
  - docs/superpowers/specs/2026-07-12-rec-02-named-role-scoped-reviewer-access-design.md
---

# REC-02 Security Contract

## Authentication And Session

Normalize usernames by trimming and lowercasing, then require
`^[a-z0-9][a-z0-9._-]{2,63}$`. Detect duplicates after normalization. Registry
validation rejects malformed entries, duplicate immutable account IDs, duplicate
normalized usernames, duplicate reviewer fixture IDs, unknown roles, weak password
parameters, stale versions, and missing secrets. A well-formed disabled entry remains
valid configuration but cannot log in or retain a session.

PBKDF2 uses SHA-256, a unique 16-to-32-byte random salt, 600,000-to-1,000,000
iterations, and an exact 32-byte key. Bound passwords at 256 UTF-8 bytes and apply the
rate limit before PBKDF2. Unknown and disabled accounts execute the same dummy PBKDF2
path and generic response as a wrong password. Validate buffer lengths before Node
`crypto.timingSafeEqual`; Edge signature checks use `crypto.subtle.verify`.

The HMAC-signed cookie uses `HttpOnly`, `Secure`, `SameSite=Strict`, a narrow console
path, issued-at time, expiry, immutable account ID, reviewer fixture ID, role, and
session version. Maximum lifetime is eight hours. Every authenticated request requires
an existing enabled account whose ID, fixture, role, and version exactly match the
signed claims. Every authorization-affecting change increments the version.

All session, assignment, and receipt responses use `Cache-Control: private, no-store`.
Login requires an allowed origin and rate limit but no prior session. Logout and receipt
submission require an allowed origin and a valid live-bound session. Errors and logs
omit usernames, passwords, hashes, cookies, review content, and account existence.

## Assignment Isolation

Move fixture JSON and generated modules out of `public/` into server-only modules. They
must not appear in public assets, client chunks, browser source maps, static routes, or
shared caches. A build audit scans fixture sentinels and fails on client/deployment
leakage or a reachable public path.

The server derives the reviewer fixture and role from the live-bound session and returns
only matching assignments and packet data. It ignores client reviewer IDs and roles. It
requires assignment, packet, account, and reviewer roles to agree. Continuation targets
must use the same reviewer fixture and role. Mismatches return neutral forbidden or
unavailable responses without exposing another assignment.

## Receipt Attribution

The browser submits schema-allowed answers and judgments only. The server resolves the
assignment and packet, validates answers, and reconstructs the entire envelope: receipt
ID/version, account, reviewer, fixture, role, assignment, packet ID/version/role,
submission time, signature version, and key ID.

A correction includes the prior signed receipt. The server verifies its signature,
session/assignment/packet ownership, and canonical hash before deriving correction
lineage. Client envelope and lineage fields never override server state.

Receipt attestation uses Ed25519. Sign the UTF-8 encoding of
`REC02-RECEIPT-SIGNATURE-V1\0` followed by the existing receipt canonical-JSON format.
Golden vectors freeze Unicode, key ordering, null, array, number, and UTC ISO-8601
millisecond timestamp behavior. Signatures use unpadded base64url; private keys use
PKCS8 PEM and public keys use SPKI PEM.

At startup, derive the public key from the private key and require an exact fingerprint/
key-ID match in the trusted versioned public-key registry. Rotation publishes and proves
the public key before activating its private key. Retain prior public keys so old
receipts verify. The server stores no receipt.

## Local Draft Boundary

Persist only schema-allowed repo-safe fixture answers and governance judgments. Keys
include immutable account ID, reviewer fixture ID, assignment ID, and packet version.
Load only after the server authorizes that exact tuple. Clear in-memory state on logout
or account switch; reviewer A's draft is never offered to reviewer B.

Shape, length, secret, and obvious-identifier guards cannot prove arbitrary free text
lacks semantic PII. The UI forbids customer data, claim narratives, uploaded document
text, medical facts, and private legal facts, warns reviewers to use their own browser
profile, and provides export and delete controls. Local drafts are not a confidential
document vault.
