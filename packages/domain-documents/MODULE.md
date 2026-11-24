# Domain documents

`listVisibleClaimDocuments(tx, { visibleClaim, afterId, limit })` reads claim
documents under the restricted transaction that selected the visible claim.
The claim owner validates the live transaction-bound proof before document
SQL and supplies the claim visibility check included in each document
statement. Effective access uses the document's access tenant and falls back
to its home tenant when the access tenant is null. Branch managers receive
a count only. Admin metadata pages merge the two access modes by ID and
return up to 25 rows. The next cursor is the last emitted ID when an extra
row exists. Storage targets use the selected row's home tenant.
