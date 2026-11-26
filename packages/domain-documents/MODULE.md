# Domain documents

`./claim-documents` exports `readOpsClaimDetailData({ authority, claimId,
documentsAfter, staffAfter, staffSearch })`. It opens one restricted
transaction with the session authority validated by the claims owner. The
fixed claims-owned subquery admits the exact claim. An empty selection returns null
before document or staff reads.

The private document reader applies that same subquery as an EXISTS in both
access arms for counts and metadata. Each arm matches the requested claim
and either the document's explicit access tenant or its home tenant when
the access tenant is null. Branch managers receive a count and a null
staff page. Admin metadata pages merge the two access modes by ID and
return up to 25 rows. The next cursor is the last emitted ID when an extra
row exists. Storage targets use the selected row's home tenant. Only admins
reach the users-owned assignable staff query, in the same transaction.

## Claim evidence confirmation

`./claim-evidence` owns the confirmation writes to `claim_documents` and the upload-time record in
`claim_document_ai_extraction_consents`. `confirmClaimEvidence` takes the caller's tenant
transaction, a scope verified under the claim lock, and the verified upload metadata. It returns
`created`, `replayed`, or `conflict` by comparing the stored metadata and original consent.
The caller verifies any information-request link in the same transaction. A replay-only caller
may use `hasClaimEvidenceDocument` before taking locks to avoid reading stored bytes.

## Storage metadata

`./storage` allocates canonical relative keys with ASCII-safe filename labels.
After uploading a new object, pass the exact `buildStoragePath` result as
`recordUpload({ ..., storagePath })`. The writer checks the allocated key
against the authorized tenant, entity coordinates, and filename and preserves
the display name verbatim. When `storagePath` is omitted, the legacy format
still applies and the writer rejects keys the canonical formatter would change.
PostgreSQL enforces canonical spelling on
`documents.storage_path` and `claim_documents.file_path`.
