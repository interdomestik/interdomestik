/** Private restricted-reader protocol; no database is imported at runtime. */
export type ListCore =
  typeof import('../../../src/app/[locale]/(agent)/agent/claims/_core').getAgentClaimsCore;
export type WorkspaceCore =
  typeof import('../../../src/app/[locale]/(agent)/agent/workspace/claims/_core').getAgentWorkspaceClaimsCore;
export type Database = typeof import('@interdomestik/database');
export interface Cores {
  list: ListCore;
  workspace: WorkspaceCore;
  database: Database;
}
export type EndableClient = { end: (options?: { timeout?: number }) => Promise<void> };

export const ADMIN_FAMILY = ['admin', 'tenant_admin', 'super_admin'];
export const DENIED_ROLES: unknown[] = ['member', 'staff', 'unknown', '', null, undefined];
export const LIST_KEYS = ['claims', 'memberEmail', 'memberId', 'memberName'];
export const LIST_CLAIM_KEYS = [
  'createdAt',
  'id',
  'status',
  'statusLabelKey',
  'title',
  'updatedAt',
];
export const WORKSPACE_KEYS = [
  'branch',
  'claimNumber',
  'createdAt',
  'id',
  'lastMessage',
  'member',
  'policy',
  'status',
  'title',
  'unreadCount',
  'updatedAt',
];
