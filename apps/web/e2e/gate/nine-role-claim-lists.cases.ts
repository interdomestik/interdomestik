import { E2E_CASE_FIXTURES, E2E_USER_IDS, type E2EUserKey } from '@interdomestik/database';

/**
 * Mounted claim-list surfaces: the staff queue, the admin list and its ops view, the agent client
 * list and workspace, and the member claims page.
 */
export type ListSurface = 'staff' | 'admin' | 'ops' | 'agent' | 'workspace' | 'member';
export type DeniableSurface = 'staff' | 'admin' | 'ops';
export type ListRow = readonly [
  surface: Exclude<ListSurface, 'ops'>,
  caseId: string,
  listed: boolean,
];
/** Ops view filters: the branch code of a case's branch, and a staff assignee. */
export type OpsFilter = Readonly<{ branchOf?: string; assignee?: string }>;
/**
 * One ops view read under existing filters. The ops loader returns an empty view when its read
 * fails, so every read must also list its control case before an absence counts.
 */
export type OpsRow = readonly [filter: OpsFilter, caseId: string, listed: boolean, control: string];
export type ListActorCases = {
  actor: E2EUserKey;
  rows: readonly ListRow[];
  opsRows?: readonly OpsRow[];
  /** Surfaces whose list page must render the not-found boundary for this actor. */
  deniedSurfaces: readonly DeniableSurface[];
};

const ANCHOR = E2E_CASE_FIXTURES.KS_ANCHOR.id;
const OTHER_MEMBER = E2E_CASE_FIXTURES.KS_OTHER_MEMBER.id;
const PEER_STAFF = E2E_CASE_FIXTURES.KS_PEER_STAFF.id;
const UNASSIGNED = E2E_CASE_FIXTURES.KS_UNASSIGNED.id;
const OTHER_BRANCH = E2E_CASE_FIXTURES.KS_OTHER_BRANCH.id;
const FOREIGN = E2E_CASE_FIXTURES.MK_FOREIGN_TENANT.id;
const OPERATIONS_ONLY: readonly DeniableSurface[] = ['staff', 'admin', 'ops'];
// The KS staff fixture is assigned the KS-A anchor cases and the KS-B cases; filtering the ops view
// by that assignee keeps every filtered read within one display page of the pool.
const KS_STAFF_QUEUE: OpsFilter = { assignee: E2E_USER_IDS.KS_STAFF };

/**
 * Current runtime claim-list membership per catalogue actor on its home tenant host. Each row
 * searches for the case first where the surface has search, so it proves the search result too.
 * The ops view has no search; its rows filter by branch and assignee instead.
 */
export const KS_LIST_CASES: readonly ListActorCases[] = [
  {
    actor: 'KS_ADMIN',
    rows: [
      ['admin', ANCHOR, true],
      ['admin', OTHER_BRANCH, true],
      ['admin', FOREIGN, false],
    ],
    opsRows: [
      [{ ...KS_STAFF_QUEUE, branchOf: ANCHOR }, ANCHOR, true, ANCHOR],
      [{ ...KS_STAFF_QUEUE, branchOf: OTHER_BRANCH }, OTHER_BRANCH, true, OTHER_BRANCH],
    ],
    deniedSurfaces: ['staff'],
  },
  {
    actor: 'KS_BRANCH_MANAGER',
    rows: [
      ['admin', ANCHOR, true],
      ['admin', OTHER_BRANCH, false],
      ['admin', FOREIGN, false],
      ['staff', ANCHOR, true],
      ['staff', PEER_STAFF, true],
      ['staff', OTHER_BRANCH, false],
    ],
    opsRows: [
      [{ ...KS_STAFF_QUEUE, branchOf: ANCHOR }, ANCHOR, true, ANCHOR],
      // The same assignee holds KS-B cases, so only the branch scope keeps them out of this read.
      [KS_STAFF_QUEUE, OTHER_BRANCH, false, ANCHOR],
    ],
    deniedSurfaces: [],
  },
  {
    actor: 'KS_STAFF',
    rows: [
      ['staff', ANCHOR, true],
      ['staff', UNASSIGNED, true],
      ['staff', PEER_STAFF, false],
      ['staff', OTHER_BRANCH, false],
      ['staff', FOREIGN, false],
    ],
    deniedSurfaces: ['admin', 'ops'],
  },
  {
    actor: 'KS_STAFF_UNASSIGNED',
    rows: [
      ['staff', PEER_STAFF, true],
      ['staff', UNASSIGNED, true],
      ['staff', ANCHOR, false],
      ['staff', OTHER_BRANCH, false],
      ['staff', FOREIGN, false],
    ],
    deniedSurfaces: ['admin', 'ops'],
  },
  {
    actor: 'KS_AGENT',
    rows: [
      ['agent', ANCHOR, true],
      ['agent', OTHER_BRANCH, false],
      ['agent', FOREIGN, false],
      ['workspace', ANCHOR, true],
      ['workspace', OTHER_BRANCH, false],
      ['workspace', FOREIGN, false],
      // The agent's member surface lists only claims the agent owns, never its clients' claims.
      ['member', ANCHOR, false],
    ],
    deniedSurfaces: OPERATIONS_ONLY,
  },
  {
    actor: 'KS_AGENT_INACTIVE_LINK',
    rows: [
      ['agent', OTHER_BRANCH, false],
      ['workspace', OTHER_BRANCH, false],
    ],
    deniedSurfaces: [],
  },
  {
    actor: 'KS_MEMBER',
    rows: [
      ['member', ANCHOR, true],
      ['member', UNASSIGNED, true],
      ['member', OTHER_MEMBER, false],
      ['member', FOREIGN, false],
    ],
    deniedSurfaces: OPERATIONS_ONLY,
  },
  { actor: 'GLOBAL_SUPPORT', rows: [], deniedSurfaces: OPERATIONS_ONLY },
];

// The unfiltered MK pool is small; a KS case would enter it only through a tenant scope failure.
const MK_OPS_ROWS: readonly OpsRow[] = [
  [{ branchOf: FOREIGN }, FOREIGN, true, FOREIGN],
  [{}, ANCHOR, false, FOREIGN],
];

export const MK_LIST_CASES: readonly ListActorCases[] = [
  {
    actor: 'MK_ADMIN',
    rows: [
      ['admin', FOREIGN, true],
      ['admin', ANCHOR, false],
    ],
    opsRows: MK_OPS_ROWS,
    deniedSurfaces: [],
  },
  {
    actor: 'SUPER_ADMIN',
    rows: [
      ['admin', FOREIGN, true],
      ['admin', ANCHOR, false],
    ],
    opsRows: MK_OPS_ROWS,
    deniedSurfaces: [],
  },
  { actor: 'AUDITOR', rows: [], deniedSurfaces: OPERATIONS_ONLY },
];

/** Every catalogue role's primary actor reads the member claims API on its home host. */
export const KS_API_ACTORS: readonly E2EUserKey[] = [
  'KS_MEMBER',
  'KS_MEMBER_EMPTY',
  'KS_AGENT',
  'KS_STAFF',
  'KS_STAFF_UNASSIGNED',
  'KS_BRANCH_MANAGER',
  'KS_ADMIN',
  'GLOBAL_SUPPORT',
];
export const MK_API_ACTORS: readonly E2EUserKey[] = ['MK_ADMIN', 'SUPER_ADMIN', 'AUDITOR'];

/** Cases whose ids a tampered search must never surface for an actor that does not own them. */
export const API_PROBE_CASES = [ANCHOR, PEER_STAFF, UNASSIGNED, OTHER_BRANCH, FOREIGN] as const;
