import { E2E_CASE_FIXTURES, E2E_USERS, type E2EUserKey } from '@interdomestik/database';

export type MessageCaseKey = keyof typeof E2E_CASE_FIXTURES;
export type MessageActorCases = {
  actor: E2EUserKey;
  allowed: readonly MessageCaseKey[];
  internal: boolean;
  managerProbe?: Readonly<{ own: MessageCaseKey; foreign: MessageCaseKey }>;
};
export const MESSAGE_CASE_KEYS = Object.keys(E2E_CASE_FIXTURES) as MessageCaseKey[];
const KS_A: readonly MessageCaseKey[] = [
  'KS_ANCHOR',
  'KS_OTHER_MEMBER',
  'KS_PEER_STAFF',
  'KS_UNASSIGNED',
];
const ALL_KS: readonly MessageCaseKey[] = [...KS_A, 'KS_OTHER_BRANCH'];

/** Current message-reader scopes: exact BM content veto, existing role/relationship scopes retained. */
export const KS_MESSAGE_CASES: readonly MessageActorCases[] = [
  // KS_ADMIN is tenant_admin, not branch_manager: it retains internal and public content.
  { actor: 'KS_ADMIN', allowed: ALL_KS, internal: true },
  {
    actor: 'KS_BRANCH_MANAGER',
    allowed: [],
    internal: false,
    managerProbe: { own: 'KS_ANCHOR', foreign: 'MK_FOREIGN_TENANT' },
  },
  { actor: 'KS_STAFF', allowed: KS_A, internal: true },
  { actor: 'KS_STAFF_UNASSIGNED', allowed: ['KS_PEER_STAFF', 'KS_UNASSIGNED'], internal: true },
  { actor: 'KS_AGENT', allowed: KS_A, internal: false },
  { actor: 'KS_AGENT_INACTIVE_LINK', allowed: [], internal: false },
  { actor: 'KS_MEMBER', allowed: ['KS_ANCHOR', 'KS_UNASSIGNED'], internal: false },
  { actor: 'KS_MEMBER_EMPTY', allowed: [], internal: false },
  { actor: 'GLOBAL_SUPPORT', allowed: [], internal: false },
];
export const MK_MESSAGE_CASES: readonly MessageActorCases[] = [
  { actor: 'SUPER_ADMIN', allowed: ['MK_FOREIGN_TENANT'], internal: true },
  { actor: 'MK_ADMIN', allowed: ['MK_FOREIGN_TENANT'], internal: true },
  {
    actor: 'MK_BRANCH_MANAGER',
    allowed: [],
    internal: false,
    managerProbe: { own: 'MK_FOREIGN_TENANT', foreign: 'KS_ANCHOR' },
  },
  { actor: 'MK_STAFF', allowed: ['MK_FOREIGN_TENANT'], internal: true },
  { actor: 'MK_AGENT', allowed: ['MK_FOREIGN_TENANT'], internal: false },
  { actor: 'MK_MEMBER', allowed: ['MK_FOREIGN_TENANT'], internal: false },
  { actor: 'AUDITOR', allowed: [], internal: false },
];

export type PreviewAccess = {
  handoffs: 'metadata' | 'content' | 'denied';
  verification: 'redacted' | 'content' | 'denied';
  verificationStatus: 200 | 403 | 404;
};
const PREVIEW_ACCESS: Record<string, Omit<PreviewAccess, 'verificationStatus'>> = {
  branch_manager: { handoffs: 'metadata', verification: 'redacted' },
  staff: { handoffs: 'content', verification: 'content' },
  tenant_admin: { handoffs: 'denied', verification: 'content' },
  admin: { handoffs: 'denied', verification: 'content' },
  super_admin: { handoffs: 'denied', verification: 'content' },
  member: { handoffs: 'denied', verification: 'denied' },
  agent: { handoffs: 'denied', verification: 'denied' },
  global_support: { handoffs: 'denied', verification: 'denied' },
  auditor: { handoffs: 'denied', verification: 'denied' },
};
export function previewAccessFor(actor: E2EUserKey): PreviewAccess {
  const access = PREVIEW_ACCESS[E2E_USERS[actor].dbRole];
  if (!access) throw new Error('Missing nine-role preview case');
  // Branchless staff still retain their message-reader relationships above, but neither
  // preview surface admits them: verification resolves an empty scope and handoffs deny.
  const user = E2E_USERS[actor];
  const branchId = 'branchId' in user ? user.branchId : null;
  if ((user.dbRole === 'staff' || user.dbRole === 'branch_manager') && !branchId) {
    return { handoffs: 'denied', verification: 'denied', verificationStatus: 404 };
  }
  return { ...access, verificationStatus: access.verification === 'denied' ? 403 : 200 };
}
