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
import { ACQ2C_CREDENTIAL_HARDENING } from './c1-admissions-auth.mjs';
import { DE_LOCALE_ADDITION } from './c1-admissions-i18n.mjs';
import { TX_LIFETIME_TRANSITION } from './c1-admissions-document-lifetime.mjs';
import { DB_TRANSACTION_POOLER } from './c1-admissions-pooler.mjs';

const deepFreeze = value => {
  if (value && typeof value === 'object') {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
};

const DOCUMENTS = 'apps/web/src/app/api/documents';
const CASE_GRANT_SINK = `${DOCUMENTS}/claim-document-access.ts#hasAnyCaseScopedGrant`;

// A successor re-binds a reviewed admission to new postimages of some of its files (and may add
// files and edges); every other file keeps its reviewed SHA-256 and units. The predecessor stays
// in the list until main carries the successor's bundle, so main and the candidate both match.
function successor(base, { id, reason, rebind, add = [], sinkEdges = [] }) {
  const files = base.files.map(entry => ({ ...entry, ...rebind[entry.file] }));
  return { id, reason, files: [...files, ...add], sinkEdges: [...base.sinkEdges, ...sinkEdges] };
}

const DOCUMENTS_READ_RESTRICTION = {
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
};

const STAFF_DRAFT =
  'Owner decision 2026-11-06 (chat): "Stafi nuk ka te drejt ne draft"; Plan070 standing approval ' +
  '2026-11-04 with Codex.';

const TX_LIFETIME_STAFF_DRAFT = successor(TX_LIFETIME_TRANSITION, {
  id: 'tx-lifetime-staff-draft-grants-2026-11',
  reason:
    `${STAFF_DRAFT} The reviewed lifetime transition, with the grant-bound document lookup ` +
    'refusing a member draft or a claim without a lifecycle inside the same home-tenant read ' +
    'context, so a grant issued before handoffs refused drafts reads none of its documents.',
  rebind: {
    [`${DOCUMENTS}/cross-tenant-document-lookup.ts`]: {
      sha256: 'e3e9a34d1b0f84987e7e139a85354fdf7ca0b34f8a67a7f0c445c6cc8cd3a43d',
      units: ['lookupCrossGrantDoc', 'lookupGrantedDocument', 'isSubmittedGrantCase'],
    },
  },
  sinkEdges: [
    {
      file: `${DOCUMENTS}/cross-tenant-document-lookup.ts`,
      unit: 'lookupGrantedDocument',
      sink: `${DOCUMENTS}/cross-tenant-document-lookup.ts#lookupPoly`,
    },
    {
      file: `${DOCUMENTS}/cross-tenant-document-lookup.ts`,
      unit: 'lookupGrantedDocument',
      sink: `${DOCUMENTS}/cross-tenant-document-lookup.ts#lookupLegacy`,
    },
  ],
});

export const C1_ADMISSIONS = deepFreeze([
  DOCUMENTS_READ_RESTRICTION,
  TX_LIFETIME_TRANSITION,
  successor(DOCUMENTS_READ_RESTRICTION, {
    id: 'documents-staff-draft-denial-2026-11',
    reason:
      `${STAFF_DRAFT} The reviewed document-read restriction plus the staff draft denial: staff ` +
      'are denied every document of a member draft or a claim without a lifecycle, after the ' +
      'claimant-owner check and before the uploader, scope and grant paths, including the ' +
      'polymorphic uploader entry. Tenant transactions, the case-grant fallback, storage and ' +
      'audit boundaries are unchanged.',
    rebind: {
      [`${DOCUMENTS}/claim-document-access.ts`]: {
        sha256: 'b51256fd3d404f08c550684d218d28eabbc4f9b6c9d550e1b62b6b5c82a8c0ef',
      },
      // Unchanged from the trusted comparator: bound for the bundle, admitted as no unit.
      [`${DOCUMENTS}/agent-document-scope.ts`]: { units: [] },
      [`${DOCUMENTS}/access-policy.ts`]: {
        sha256: 'e3dbde4be395247019c12fe7410fee2c2a84c1eabd8b2a5e6106fe33c9114c68',
        units: ['hasScopedClaimReadAccess', 'isStaffBlockedFromClaim'],
      },
      [`${DOCUMENTS}/document-access-reads.ts`]: {
        sha256: 'adb7578ca3b0b8c8917502cce1bf9d129f100fe9a8a0b90f501bbff1f0644f36',
      },
    },
    add: [
      {
        file: `${DOCUMENTS}/polymorphic-document-access.ts`,
        sha256: '5e7c160ae08689a3dbff11721e351ebe4e6bd9c88b261893bcbf6c9641a4ba8c',
        units: ['canReadPolymorphicDocument'],
      },
    ],
    sinkEdges: [
      {
        file: `${DOCUMENTS}/polymorphic-document-access.ts`,
        unit: 'canReadPolymorphicDocument',
        sink: `${DOCUMENTS}/claim-document-access.ts#canReadPolymorphicClaimDocument`,
      },
    ],
  }),
  TX_LIFETIME_STAFF_DRAFT,
  successor(TX_LIFETIME_STAFF_DRAFT, {
    id: 'tx-lifetime-branch-manager-content-denial-2026-11',
    reason:
      'Owner-approved D1 (SRS v0.9): branch managers have allocation authority only and no ' +
      'document preview, read, download or signed URL. The reviewed entrance veto precedes ' +
      'tenant transactions, local reads and cross-grant fallback. All staff-draft lifetime ' +
      'files, units and sink edges remain; route-owned forbidden auditing is unchanged.',
    rebind: {
      [`${DOCUMENTS}/_core.ts`]: {
        sha256: '6bb91b937859c42300909491703632a5f90118f5d9518bb9aad3cc3dba9fc3e0',
        units: ['getDocumentAccessCore'],
      },
    },
    add: [
      {
        file: `${DOCUMENTS}/branch-manager-document-boundary.ts`,
        sha256: 'eb035356d5c13bb548228c1c054ccb52d21893f81800b04e0c7f08281d6dcb96',
        units: ['deniesClaimDocumentContent'],
      },
    ],
  }),
  {
    id: 'draft-handoff-and-airline-stage-2026-11',
    reason:
      `${STAFF_DRAFT} The jurisdiction handoff loads the claim lifecycle and refuses a member ` +
      'draft or a claim without a lifecycle for every role, so no recovery grant is issued on a ' +
      'draft. The ops pool negotiation stage also matches submitted_to_airline, as the shared ' +
      'lifecycle mapping already does. Tenant transactions, grant writes and the ' +
      'transferred-candidate scan are unchanged.',
    files: [
      {
        file: 'packages/domain-claims/src/claims/jurisdiction-handoff-auth.ts',
        sha256: '0c7dba6cfe47dfebd1ca96ab88453b11cab85f4064d5bbb4472c62cd3838ba6e',
        units: ['canInitiateHandoff'],
      },
      {
        file: 'packages/domain-claims/src/claims/jurisdiction-handoff-store.ts',
        sha256: '294ab8f572826fc77eff35421e721a91d08a61dd4250249d8672ba2aef193d2a',
        units: ['loadHandoffClaim'],
      },
      {
        file: 'apps/web/src/features/admin/claims/server/readOpsCenterPool.ts',
        sha256: '939a4cd3ea17619e41e59f087783ea927ca135dbd9555b124cbca03a6a38113d',
        units: ['LIFECYCLE_STATUS_MAP'],
      },
    ],
    sinkEdges: [],
  },
  ACQ2C_CREDENTIAL_HARDENING,
  DE_LOCALE_ADDITION,
  DB_TRANSACTION_POOLER,
]);
