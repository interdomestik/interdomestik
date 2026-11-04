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
]);
