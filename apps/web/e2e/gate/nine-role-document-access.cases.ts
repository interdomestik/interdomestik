import { E2E_DOCUMENT_FIXTURES, type E2EUserKey } from '@interdomestik/database';

type DocumentKey = keyof typeof E2E_DOCUMENT_FIXTURES;
export type DocumentActorCases = {
  actor: E2EUserKey;
  allowed: readonly DocumentKey[];
  /**
   * Documents the current policy still serves although the intended policy denies them. Each one
   * is a known gap asserted as served, so the case fails once the fix lands and must move to denied.
   */
  knownGapServed?: readonly DocumentKey[];
};

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
 * - agents read attributed cases of active clients in their branch (known gap below);
 * - members read the cases they own; auditors read none.
 */
export const KS_DOCUMENT_CASES: readonly DocumentActorCases[] = [
  { actor: 'KS_ADMIN', allowed: ALL_KS },
  { actor: 'GLOBAL_SUPPORT', allowed: ALL_KS },
  { actor: 'KS_BRANCH_MANAGER', allowed: KS_A },
  { actor: 'KS_STAFF', allowed: ['KS_ANCHOR', 'KS_OTHER_MEMBER', 'KS_OTHER_BRANCH'] },
  { actor: 'KS_STAFF_UNASSIGNED', allowed: ['KS_PEER_STAFF'] },
  { actor: 'KS_AGENT', allowed: KS_A },
  // Known gap: document reads still admit an agent by claim attribution alone, so the inactive
  // client link does not deny the KS-B case. The fix waits on the reviewed S2 re-pin of the
  // document read path.
  { actor: 'KS_AGENT_INACTIVE_LINK', allowed: [], knownGapServed: ['KS_OTHER_BRANCH'] },
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
