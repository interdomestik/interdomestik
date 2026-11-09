import { E2E_SHARE_DOCUMENT_SETS } from './e2e-document-fixtures';
import { discoveryAccessIntent, E2E_DISCOVERY_ACTORS } from './e2e-discovery-access';
import type { E2EDiscoveryActor } from './e2e-discovery-access';
import { E2E_CASE_FIXTURES, E2E_USER_IDS } from './e2e-role-fixtures';
import { goldenId } from './seed-utils/seed-ids';

function sharePack(key: 'VALID' | 'EXPIRED' | 'REVOKED') {
  return {
    id: goldenId('discovery', 'share_pack', key),
    tenantId: E2E_CASE_FIXTURES.KS_ANCHOR.tenantId,
    createdByUserId: E2E_USER_IDS[E2E_SHARE_DOCUMENT_SETS.ANCHOR_EVIDENCE.owner],
    entityType: 'claim',
    entityId: E2E_CASE_FIXTURES.KS_ANCHOR.id,
    documentSet: 'ANCHOR_EVIDENCE',
    createdAt: '2025-12-07T09:00:00.000Z',
    // Fixed horizon keeps the valid case usable without consulting the wall clock at seed time.
    expiresAt: key === 'EXPIRED' ? '2025-12-08T09:00:00.000Z' : '2099-01-01T00:00:00.000Z',
    revokedAt: key === 'REVOKED' ? '2025-12-08T10:00:00.000Z' : null,
    revokedByUserId: key === 'REVOKED' ? E2E_USER_IDS.KS_MEMBER : null,
  } as const;
}

export const E2E_SHARE_PACK_FIXTURES = {
  VALID: sharePack('VALID'),
  EXPIRED: sharePack('EXPIRED'),
  REVOKED: sharePack('REVOKED'),
} as const;

function packAccess(valid: boolean) {
  return {
    requiresValidToken: true,
    ...discoveryAccessIntent(valid ? E2E_DISCOVERY_ACTORS : [], 'create-share-pack', [
      'AUDITOR',
      'GLOBAL_SUPPORT',
      'KS_MEMBER_A2',
      'MK_ADMIN',
    ]),
  } as const;
}

/** A valid bearer token is required separately; role alone never grants public pack access. */
export const E2E_SHARE_PACK_ACCESS = {
  VALID: packAccess(true),
  EXPIRED: packAccess(false),
  REVOKED: packAccess(false),
} as const;

/** Per-document eligibility is an explicit creation expectation, independent of seeded pack rows. */
export const E2E_SHARE_CREATION_INTENTS = {
  ANCHOR_EVIDENCE: {
    allowed: ['KS_MEMBER', 'KS_ADMIN', 'KS_STAFF', 'KS_AGENT', 'KS_BRANCH_MANAGER'],
    denied: ['AUDITOR', 'GLOBAL_SUPPORT', 'KS_MEMBER_A2', 'MK_ADMIN', 'KS_STAFF_UNASSIGNED'],
  },
  ANCHOR_WITH_DELETED: { allowed: [], denied: E2E_DISCOVERY_ACTORS },
  MIXED_OWNER: {
    allowed: ['KS_ADMIN', 'KS_STAFF', 'KS_AGENT', 'KS_BRANCH_MANAGER'],
    denied: ['KS_MEMBER', 'KS_MEMBER_A2', 'AUDITOR', 'GLOBAL_SUPPORT', 'MK_ADMIN'],
  },
} as const satisfies Record<
  keyof typeof E2E_SHARE_DOCUMENT_SETS,
  {
    allowed: readonly E2EDiscoveryActor[];
    denied: readonly E2EDiscoveryActor[];
  }
>;
