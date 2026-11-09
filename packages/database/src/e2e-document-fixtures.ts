import { E2E_CLAIM_STATE_FIXTURES } from './e2e-claim-state-fixtures';
import { E2E_DOCUMENT_FIXTURES, E2E_CASE_FIXTURES, E2E_USER_IDS } from './e2e-role-fixtures';
import {
  discoveryAccessIntent,
  E2E_DISCOVERY_ACTORS,
  E2E_DISCOVERY_DOCUMENT_READERS,
} from './e2e-discovery-access';
import { goldenId } from './seed-utils/seed-ids';

export const E2E_DISCOVERY_SEED_BASE_TIME = '2026-01-01T00:00:00.000Z';
export const E2E_DISCOVERY_AS_OF = '2026-01-03T00:00:00.000Z';

/** Extend the existing six evidence rows; do not create a second copy of those documents. */
function stateDocument(key: keyof typeof E2E_CLAIM_STATE_FIXTURES) {
  const claim = E2E_CLAIM_STATE_FIXTURES[key];
  return {
    id: goldenId('discovery', 'document', key),
    tenantId: 'tenant_ks',
    accessTenantId: 'tenant_ks',
    claimId: claim.id,
    bucket: 'claim-evidence',
    category: 'evidence',
    classification: 'pii',
    name: `${key.toLowerCase()}-evidence.pdf`,
    filePath: `pii/tenants/tenant_ks/claims/${claim.id}/discovery-evidence.pdf`,
    uploadedBy: E2E_USER_IDS[claim.owner],
    fileType: 'application/pdf',
    fileSize: 1024,
  } as const;
}

export const E2E_DISCOVERY_DOCUMENT_FIXTURES = {
  ...E2E_DOCUMENT_FIXTURES,
  DRAFT: stateDocument('DRAFT'),
  REJECTED: stateDocument('REJECTED'),
  SUBMITTED_TO_AIRLINE: stateDocument('SUBMITTED_TO_AIRLINE'),
} as const;
export type E2EDiscoveryDocumentKey = keyof typeof E2E_DISCOVERY_DOCUMENT_FIXTURES;

export const E2E_DISCOVERY_DOCUMENT_ACCESS = Object.fromEntries(
  Object.entries(E2E_DISCOVERY_DOCUMENT_READERS).map(([key, readers]) => [
    key,
    discoveryAccessIntent(readers, 'delete-document', [
      'AUDITOR',
      'GLOBAL_SUPPORT',
      ...E2E_DISCOVERY_ACTORS.filter(actor => !readers.some(reader => reader === actor)),
    ]),
  ])
) as Record<E2EDiscoveryDocumentKey, ReturnType<typeof discoveryAccessIntent>>;

/** Share packs reference polymorphic documents, never claim_documents IDs. Bytes are pending. */
function shareDocument(key: 'REPORT' | 'PHOTO' | 'DELETED' | 'OTHER_MEMBER') {
  const claim =
    key === 'OTHER_MEMBER' ? E2E_CASE_FIXTURES.KS_OTHER_MEMBER : E2E_CASE_FIXTURES.KS_ANCHOR;
  return {
    id: goldenId('discovery', 'share_document', key),
    tenantId: claim.tenantId,
    entityType: 'claim',
    entityId: claim.id,
    fileName: `discovery-${key.toLowerCase()}.pdf`,
    mimeType: 'application/pdf',
    fileSize: 1024,
    storagePath: `pii/tenants/${claim.tenantId}/claims/${claim.id}/discovery-${key.toLowerCase()}.pdf`,
    category: 'evidence',
    description: `Plan070 discovery ${key.toLowerCase()}`,
    uploadedBy: claim.ownerUserId,
    uploadedAt: '2025-12-05T09:00:00.000Z',
    deletedAt: key === 'DELETED' ? '2025-12-06T09:00:00.000Z' : null,
    deletedBy: key === 'DELETED' ? claim.ownerUserId : null,
  } as const;
}

export const E2E_SHARE_DOCUMENT_FIXTURES = {
  REPORT: shareDocument('REPORT'),
  PHOTO: shareDocument('PHOTO'),
  DELETED: shareDocument('DELETED'),
  OTHER_MEMBER: shareDocument('OTHER_MEMBER'),
} as const;

export const E2E_SHARE_DOCUMENT_ACCESS = {
  REPORT: E2E_DISCOVERY_DOCUMENT_ACCESS.KS_ANCHOR,
  PHOTO: E2E_DISCOVERY_DOCUMENT_ACCESS.KS_ANCHOR,
  DELETED: discoveryAccessIntent([], 'create-share-pack', E2E_DISCOVERY_ACTORS),
  OTHER_MEMBER: E2E_DISCOVERY_DOCUMENT_ACCESS.KS_OTHER_MEMBER,
} as const;

export const E2E_SHARE_DOCUMENT_SETS = {
  ANCHOR_EVIDENCE: {
    owner: 'KS_MEMBER',
    documentIds: [E2E_SHARE_DOCUMENT_FIXTURES.REPORT.id, E2E_SHARE_DOCUMENT_FIXTURES.PHOTO.id],
  },
  ANCHOR_WITH_DELETED: {
    owner: 'KS_MEMBER',
    documentIds: [E2E_SHARE_DOCUMENT_FIXTURES.REPORT.id, E2E_SHARE_DOCUMENT_FIXTURES.DELETED.id],
  },
  MIXED_OWNER: {
    owner: 'KS_MEMBER',
    documentIds: [
      E2E_SHARE_DOCUMENT_FIXTURES.REPORT.id,
      E2E_SHARE_DOCUMENT_FIXTURES.OTHER_MEMBER.id,
    ],
  },
} as const;
