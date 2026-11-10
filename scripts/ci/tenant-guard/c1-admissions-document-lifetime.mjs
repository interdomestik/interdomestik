// Unchanged reviewed lifetime predecessor; kept separate to bound the admission module size.
const DOCUMENTS = 'apps/web/src/app/api/documents';

export const TX_LIFETIME_TRANSITION = {
  id: 'tx-lifetime-transition-2026-11',
  // Plan070 standing owner approval 2026-11-04 (chat): "miratohen te gjitha kerkesat deri ne
  // perfundim te planit 070 ne bashkpunim me codex", bound to Codex YES on this exact bundle
  // (design r10: session authority for local reads; no exemption for changed legacy operations).
  reason:
    'Reviewed S8 lifetime transition. The document routes take the session and its tenant ' +
    'authority from one authorizeSessionTenant result and the local read opens ' +
    'withTenantAuthority, the same tenant, access tenant and role as before. The cross-tenant ' +
    'lookups and durable grant reads hand the unchanged grant-resolved read runners only ' +
    'request fields split off the read handle. The jurisdiction handoff no longer hands its ' +
    'transaction to the grant actor resolver, which reads identifiers only.',
  files: [
    {
      file: `${DOCUMENTS}/[id]/route.ts`,
      sha256: 'bbf82b984e3f7ca0dcaf8d50a67b57848a858d20c2f39f3823dd8ff328f339da',
      units: ['GET'],
    },
    {
      file: `${DOCUMENTS}/[id]/download/route.ts`,
      sha256: '7f7a816b189d844bab0ff259805c8a331bc02fb9d4396cd15e691091592f54a3',
      units: ['GET'],
    },
    {
      file: `${DOCUMENTS}/_core.ts`,
      sha256: '15cdcb0d07b540eaff3bae1456b5bfefb948bd0d656339d601b34241659f2a92',
      units: ['getDocumentAccessCore'],
    },
    {
      file: `${DOCUMENTS}/cross-tenant-document-lookup.ts`,
      sha256: 'e5d6ceac85c6df6a07636a36911f2a6877cddca4c6c0663705e4c1bb5234632c',
      units: ['lookupCrossGrantDoc'],
    },
    {
      file: `${DOCUMENTS}/durable-case-grants.ts`,
      sha256: '184f475d6e7989816be8e81d24b393410148512bf8d5b962bd93c056d2abc35f',
      units: ['findActorCrossGrantContexts', 'hasDurableCaseScopedDocumentGrant'],
    },
    {
      file: 'packages/domain-claims/src/claims/jurisdiction-handoff.ts',
      sha256: '3dd71195a2e332a6eb66a2cbaea5c5669485a71f4e91eec8b4609e2e4cdb71bb',
      units: ['recordJurisdictionHandoffInTransaction'],
    },
    {
      file: 'packages/domain-claims/src/claims/jurisdiction-handoff-grant-actor.ts',
      sha256: 'dc1bc426bfa963dce6a8262b953a00d4979bfa61a3b2de70bd1fda287d4aaf08',
      units: ['resolveTrustedRecoveryGrantActor'],
    },
    {
      file: 'packages/domain-claims/src/claims/jurisdiction-handoff-store-insert.ts',
      sha256: '0693671722af35cf5cd1a1a6af96e6e6f73d5473fe0b3b40e68691be7926135b',
      units: ['insertHandoffGrant'],
    },
  ],
  sinkEdges: [
    {
      file: `${DOCUMENTS}/cross-tenant-document-lookup.ts`,
      unit: 'lookupCrossGrantDoc',
      sink: `${DOCUMENTS}/durable-case-grants.ts#findActorCrossGrantContexts`,
    },
    {
      file: `${DOCUMENTS}/cross-tenant-document-lookup.ts`,
      unit: 'lookupCrossGrantDoc',
      sink: `${DOCUMENTS}/cross-tenant-document-lookup.ts#withDocumentReadContext`,
    },
    {
      file: `${DOCUMENTS}/cross-tenant-document-lookup.ts`,
      unit: 'lookupCrossGrantDoc',
      sink: `${DOCUMENTS}/cross-tenant-document-lookup.ts#lookupGrantedDocument`,
    },
    {
      file: `${DOCUMENTS}/durable-case-grants.ts`,
      unit: 'findActorCrossGrantContexts',
      sink: `${DOCUMENTS}/durable-case-grants.ts#withGrantReadContext`,
    },
    {
      file: `${DOCUMENTS}/durable-case-grants.ts`,
      unit: 'hasDurableCaseScopedDocumentGrant',
      sink: `${DOCUMENTS}/durable-case-grants.ts#withGrantReadContext`,
    },
    {
      file: `${DOCUMENTS}/_core.ts`,
      unit: 'getDocumentAccessCore',
      sink: `${DOCUMENTS}/document-access-reads.ts#readLocalDocumentAccess`,
    },
    {
      file: `${DOCUMENTS}/_core.ts`,
      unit: 'getDocumentAccessCore',
      sink: `${DOCUMENTS}/document-access-reads.ts#readCrossGrantDocumentAccess`,
    },
    {
      file: `${DOCUMENTS}/[id]/route.ts`,
      unit: 'GET',
      sink: `${DOCUMENTS}/_core.ts#getDocumentAccessCore`,
    },
    {
      file: `${DOCUMENTS}/[id]/download/route.ts`,
      unit: 'GET',
      sink: `${DOCUMENTS}/_core.ts#getDocumentAccessCore`,
    },
  ],
};
