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

`allocateStoragePath` from `./storage` returns an immutable server-side allocation
record with a canonical relative `storagePath` and an ASCII-safe filename label.
Use that key for the upload, then pass the original record to
`recordUpload({ ..., allocation })` in the same server process. The writer checks
the record against the authorized tenant, entity coordinates, and filename,
and preserves the display name verbatim. It rejects raw keys and copied records.
When `allocation` is omitted, the legacy format still applies and the writer
rejects keys the canonical formatter would change.
PostgreSQL enforces canonical spelling on
`documents.storage_path` and `claim_documents.file_path`.

## WP-12.1 pilot evidence

Migration `0114_wp12_1_inbound_documents` adds pilot enrollment, upload decisions and received-document records.

Ordinary publication remains a domain-documents write inside the caller's case transaction. The committed visibility decision supplies the canonical evidence coordinates and approved uploader. Confirmation rechecks the case and returns the existing document ID on exact replay. Publication makes the PDF visible through the ordinary case read; inbound correspondence records the receipt separately.

`./claim-evidence` exports `readCurrentMemberVaultEvidence`. Its evidence statement checks the exact home tenant, case and current member before returning MK vault document metadata in the caller's tenant transaction.
