# Domain documents

## Claim evidence confirmation

`./claim-evidence` owns the confirmation writes to `claim_documents` and the upload-time record in
`claim_document_ai_extraction_consents`. `confirmClaimEvidence` takes the caller's tenant
transaction, a scope verified under the claim lock, and the verified upload metadata. It returns
`created`, `replayed`, or `conflict` by comparing the stored metadata and original consent.
The caller verifies any information-request link in the same transaction. A replay-only caller
may use `hasClaimEvidenceDocument` before taking locks to avoid reading stored bytes.
