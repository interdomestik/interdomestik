import type { E2EUserKey } from './e2e-users';

/** Representative catalogue actors, on their home tenant, without delegated case grants. */
export const E2E_DISCOVERY_ACTORS = [
  'SUPER_ADMIN',
  'MK_ADMIN',
  'MK_STAFF',
  'MK_BRANCH_MANAGER',
  'MK_AGENT',
  'MK_MEMBER',
  'KS_ADMIN',
  'GLOBAL_SUPPORT',
  'AUDITOR',
  'KS_BRANCH_MANAGER',
  'KS_STAFF',
  'KS_STAFF_UNASSIGNED',
  'KS_AGENT',
  'KS_AGENT_INACTIVE_LINK',
  'KS_MEMBER',
  'KS_MEMBER_A2',
  'KS_MEMBER_B1',
  'KS_MEMBER_EMPTY',
  'KS_MEMBER_CONVERTED_LEAD',
  'KS_AGENT_CASH_STATES',
  'PILOT_MK_ADMIN',
] as const satisfies readonly E2EUserKey[];

export type E2EDiscoveryActor = (typeof E2E_DISCOVERY_ACTORS)[number];
export type E2EDiscoveryAccessIntent = {
  readonly read: {
    readonly allowed: readonly E2EDiscoveryActor[];
    readonly denied: readonly E2EDiscoveryActor[];
  };
  readonly deniedWrite: {
    readonly operation:
      | 'delete-document'
      | 'create-share-pack'
      | 'send-public-message'
      | 'send-internal-message'
      | 'mark-notification-read';
    readonly actors: readonly E2EDiscoveryActor[];
  };
};

/** Only partitions a finite test actor set; this never authorizes seed or runtime operations. */
export function discoveryAccessIntent(
  allowed: readonly E2EDiscoveryActor[],
  operation: E2EDiscoveryAccessIntent['deniedWrite']['operation'],
  deniedWriters: readonly E2EDiscoveryActor[]
): E2EDiscoveryAccessIntent {
  return {
    read: { allowed, denied: E2E_DISCOVERY_ACTORS.filter(actor => !allowed.includes(actor)) },
    deniedWrite: { operation, actors: [...new Set(deniedWriters)] },
  };
}

// Explicit expected scopes, separate from the row builders and runtime policy implementation.
export const E2E_DISCOVERY_DOCUMENT_READERS = {
  KS_ANCHOR: [
    'KS_ADMIN',
    'GLOBAL_SUPPORT',
    'KS_BRANCH_MANAGER',
    'KS_STAFF',
    'KS_AGENT',
    'KS_MEMBER',
  ],
  KS_OTHER_MEMBER: [
    'KS_ADMIN',
    'GLOBAL_SUPPORT',
    'KS_BRANCH_MANAGER',
    'KS_STAFF',
    'KS_AGENT',
    'KS_MEMBER_A2',
  ],
  KS_PEER_STAFF: [
    'KS_ADMIN',
    'GLOBAL_SUPPORT',
    'KS_BRANCH_MANAGER',
    'KS_STAFF_UNASSIGNED',
    'KS_AGENT',
  ],
  KS_UNASSIGNED: ['KS_ADMIN', 'GLOBAL_SUPPORT', 'KS_BRANCH_MANAGER', 'KS_AGENT', 'KS_MEMBER'],
  KS_OTHER_BRANCH: ['KS_ADMIN', 'GLOBAL_SUPPORT', 'KS_STAFF', 'KS_MEMBER_B1'],
  MK_FOREIGN_TENANT: ['SUPER_ADMIN', 'MK_ADMIN', 'MK_BRANCH_MANAGER', 'MK_MEMBER'],
  DRAFT: ['KS_ADMIN', 'GLOBAL_SUPPORT', 'KS_MEMBER_CONVERTED_LEAD'],
  REJECTED: ['KS_ADMIN', 'GLOBAL_SUPPORT', 'KS_STAFF_UNASSIGNED', 'KS_MEMBER_CONVERTED_LEAD'],
  SUBMITTED_TO_AIRLINE: [
    'KS_ADMIN',
    'GLOBAL_SUPPORT',
    'KS_STAFF_UNASSIGNED',
    'KS_MEMBER_CONVERTED_LEAD',
  ],
} as const satisfies Record<string, readonly E2EDiscoveryActor[]>;

/** Messaging uses branch staff scope, unlike the document reader's assignment scope. */
export const E2E_DISCOVERY_MESSAGE_READERS = {
  KS_ANCHOR: ['KS_ADMIN', 'KS_BRANCH_MANAGER', 'KS_STAFF', 'KS_AGENT', 'KS_MEMBER'],
  KS_OTHER_MEMBER: ['KS_ADMIN', 'KS_BRANCH_MANAGER', 'KS_STAFF', 'KS_AGENT', 'KS_MEMBER_A2'],
  KS_PEER_STAFF: ['KS_ADMIN', 'KS_BRANCH_MANAGER', 'KS_STAFF', 'KS_STAFF_UNASSIGNED', 'KS_AGENT'],
  KS_UNASSIGNED: [
    'KS_ADMIN',
    'KS_BRANCH_MANAGER',
    'KS_STAFF',
    'KS_STAFF_UNASSIGNED',
    'KS_AGENT',
    'KS_MEMBER',
  ],
  KS_OTHER_BRANCH: ['KS_ADMIN', 'KS_MEMBER_B1'],
  // MK_AGENT holds the active same-branch link to MK_MEMBER (golden_assign_mk_1).
  MK_FOREIGN_TENANT: [
    'SUPER_ADMIN',
    'MK_ADMIN',
    'MK_BRANCH_MANAGER',
    'MK_STAFF',
    'MK_AGENT',
    'MK_MEMBER',
  ],
} as const satisfies Record<string, readonly E2EDiscoveryActor[]>;

export const E2E_DISCOVERY_INTERNAL_READERS = {
  KS_ANCHOR: ['KS_ADMIN', 'KS_BRANCH_MANAGER', 'KS_STAFF'],
  KS_OTHER_MEMBER: ['KS_ADMIN', 'KS_BRANCH_MANAGER', 'KS_STAFF'],
  KS_PEER_STAFF: ['KS_ADMIN', 'KS_BRANCH_MANAGER', 'KS_STAFF', 'KS_STAFF_UNASSIGNED'],
  KS_UNASSIGNED: ['KS_ADMIN', 'KS_BRANCH_MANAGER', 'KS_STAFF', 'KS_STAFF_UNASSIGNED'],
  KS_OTHER_BRANCH: ['KS_ADMIN'],
  MK_FOREIGN_TENANT: ['SUPER_ADMIN', 'MK_ADMIN', 'MK_BRANCH_MANAGER', 'MK_STAFF'],
} as const satisfies Record<string, readonly E2EDiscoveryActor[]>;
