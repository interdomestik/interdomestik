import { E2E_DOCUMENT_FIXTURES, type E2EUserKey } from '@interdomestik/database';

type DocumentKey = keyof typeof E2E_DOCUMENT_FIXTURES;
export type DocumentActorCases = { actor: E2EUserKey; allowed: readonly DocumentKey[] };

/** Every catalogue document; each actor row lists the ones it may read, the rest must deny. */
export const DOCUMENT_KEYS = Object.keys(E2E_DOCUMENT_FIXTURES) as DocumentKey[];

const KS_A: readonly DocumentKey[] = [
  'KS_ANCHOR',
  'KS_OTHER_MEMBER',
  'KS_PEER_STAFF',
  'KS_UNASSIGNED',
];
const ALL_KS: readonly DocumentKey[] = [...KS_A, 'KS_OTHER_BRANCH'];

/**
 * Current document read policy per representative actor of each of the nine roles, on its home
 * tenant host. Pilot-tenant actors are seeded on the pilot host only and are not covered here.
 * - tenant admins and global support read their home tenant (read-oriented support, ADR-09);
 * - branch managers read their branch;
 * - staff read the cases assigned to them, including an assigned case in another branch;
 * - agents read attributed cases of active clients in their branch;
 * - members read the cases they own; auditors read none.
 */
export const KS_DOCUMENT_CASES: readonly DocumentActorCases[] = [
  { actor: 'KS_ADMIN', allowed: ALL_KS },
  { actor: 'GLOBAL_SUPPORT', allowed: ALL_KS },
  { actor: 'KS_BRANCH_MANAGER', allowed: KS_A },
  { actor: 'KS_STAFF', allowed: ['KS_ANCHOR', 'KS_OTHER_MEMBER', 'KS_OTHER_BRANCH'] },
  { actor: 'KS_STAFF_UNASSIGNED', allowed: ['KS_PEER_STAFF'] },
  { actor: 'KS_AGENT', allowed: KS_A },
  { actor: 'KS_AGENT_INACTIVE_LINK', allowed: [] },
  { actor: 'KS_MEMBER', allowed: ['KS_ANCHOR', 'KS_UNASSIGNED'] },
  { actor: 'KS_MEMBER_EMPTY', allowed: [] },
];

export const MK_DOCUMENT_CASES: readonly DocumentActorCases[] = [
  { actor: 'SUPER_ADMIN', allowed: ['MK_FOREIGN_TENANT'] },
  { actor: 'MK_ADMIN', allowed: ['MK_FOREIGN_TENANT'] },
  { actor: 'MK_BRANCH_MANAGER', allowed: ['MK_FOREIGN_TENANT'] },
  // The MK case is unassigned and unattributed, so MK staff and agents have no claim to it.
  { actor: 'MK_STAFF', allowed: [] },
  { actor: 'MK_AGENT', allowed: [] },
  { actor: 'MK_MEMBER', allowed: ['MK_FOREIGN_TENANT'] },
  { actor: 'AUDITOR', allowed: [] },
];
