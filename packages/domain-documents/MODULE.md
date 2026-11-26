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
