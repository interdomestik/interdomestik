// Reviewed C1 admissions: exact, owner-authorized postimages of changed units that C1 may treat as
// reviewed where it otherwise requires an unchanged unit. A module, not JSON, so the protected
// required workflow loads it through its closed .mjs closure; changing it changes what the guard
// admits, so it is part of the owner-pinned guard source.
//
// An admission is all or nothing. It applies only while EVERY listed file is byte-identical to its
// bound SHA-256 (the whole reviewed bundle, imports included); any other content leaves the files
// judged as ordinary changed code. While active it admits only:
// - the listed units as unchanged inside C1 closure comparisons (a caller's tenant closure and the
//   closure of a callee handed retained legacy state), and
// - the listed caller -> legacy sink edges in place of C1's unchanged-caller requirement.
// Every rule still classifies the listed units as changed code (custody, receivers, module state,
// legacy pins, C3 contracts); only rules that compare a callee's closure, such as custody's
// state-callee check, see the admitted closure comparison. The sinks keep propagating through
// their callers as before.
const deepFreeze = value => {
  if (value && typeof value === 'object') {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
};

const DOCUMENTS = 'apps/web/src/app/api/documents';
const CASE_GRANT_SINK = `${DOCUMENTS}/claim-document-access.ts#hasAnyCaseScopedGrant`;

export const C1_ADMISSIONS = deepFreeze([
  {
    id: 'documents-read-restriction-2026-11',
    // Owner authorization 2026-11-04 (chat): "re-pin it is!" and "ok approved" for this admission.
    reason:
      'Reviewed document-read restriction: agent attribution additionally requires an active ' +
      'same-tenant client link and the existing workspace branch scope; the local polymorphic ' +
      'lookup excludes soft-deleted rows. Tenant transactions, the case-grant fallback, storage ' +
      'and audit boundaries are unchanged.',
    files: [
      {
        file: `${DOCUMENTS}/claim-document-access.ts`,
        sha256: '2b38e62b11fcacece454b2f737f457a545458eac93725a662ad961ab3a62c39c',
        units: [
          'canReadPolymorphicClaimDocument',
          'canReadLegacyClaimDocument',
          'hasScopedClaimDocumentAccess',
        ],
      },
      {
        file: `${DOCUMENTS}/agent-document-scope.ts`,
        sha256: '737b484c43c108aee209c2a51a33d15f7621d65ac73cc81e845ad213eac6e25e',
        units: ['hasAgentClaimDocumentScope'],
      },
      {
        file: `${DOCUMENTS}/access-policy.ts`,
        sha256: '20139d56b0f4cf2f1d3d862732f7d52d03c7d9d77a1b909cf75e5d9ad920290f',
        units: ['hasScopedClaimReadAccess'],
      },
      {
        file: `${DOCUMENTS}/document-access-reads.ts`,
        sha256: '609809923739d2adc4fc8dcf286527a8e112897fad6531468fd877e784e65dbe',
        units: ['readLocalDocumentAccess'],
      },
    ],
    sinkEdges: [
      {
        file: `${DOCUMENTS}/claim-document-access.ts`,
        unit: 'canReadPolymorphicClaimDocument',
        sink: CASE_GRANT_SINK,
      },
      {
        file: `${DOCUMENTS}/claim-document-access.ts`,
        unit: 'canReadLegacyClaimDocument',
        sink: CASE_GRANT_SINK,
      },
      // The claim readers carry the case-grant sink to their caller, the local document read.
      {
        file: `${DOCUMENTS}/document-access-reads.ts`,
        unit: 'readLocalDocumentAccess',
        sink: `${DOCUMENTS}/claim-document-access.ts#canReadLegacyClaimDocument`,
      },
      {
        file: `${DOCUMENTS}/document-access-reads.ts`,
        unit: 'readLocalDocumentAccess',
        sink: `${DOCUMENTS}/polymorphic-document-access.ts#canReadPolymorphicDocument`,
      },
    ],
  },
  {
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
  },
]);
