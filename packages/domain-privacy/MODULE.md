# Privacy domain

`@interdomestik/domain-privacy` owns the stored legal acceptance contract.

## Stored acceptance

The global `legal_document_versions` registry binds each kind, version and
locale to a digest of the displayed text. Migrations publish immutable versions.
The tenant-scoped `legal_acceptances` table records the member's acceptance
of terms or acknowledgment of the privacy notice with a database timestamp.

The domain exposes `getAcceptanceState`, `acceptLegalDocuments` and
`listMembersWithoutAcceptance`. The web layer resolves session authority,
enforces admission at member entry points and renders the submitted locale and
current document versions for digest verification. The command binds the actor and tenant
from session authority and stores acceptance and audit evidence in one
transaction. Only a tenant admin can list members without current acceptance
in that tenant.

The gated raw session roles are `member` and `user`. Both current documents
must be approved in production. Runtime acceptance rows are append-only.
Actor and access-tenant settings are transaction-local and bound by the
application to the minted session authority.
