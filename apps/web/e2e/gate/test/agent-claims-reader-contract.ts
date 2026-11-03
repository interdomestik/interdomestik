/** Private restricted-reader protocol; no database is imported at runtime. */
type ListCore =
  typeof import('../../../src/app/[locale]/(agent)/agent/claims/_core').getAgentClaimsCore;
type WorkspaceCore =
  typeof import('../../../src/app/[locale]/(agent)/agent/workspace/claims/_core').getAgentWorkspaceClaimsCore;
export type Database = typeof import('@interdomestik/database');
type TenantTransaction = import('@interdomestik/database').TenantTransaction;

/** The identity a session would carry; readers mint its authority the way the pages do. */
export type ReaderIdentity = { tenantId: string; userId: string; role: string };
export interface Cores {
  list: (params: ReaderIdentity & { branchId?: string | null }) => ReturnType<ListCore>;
  workspace: (params: ReaderIdentity & { selectedClaimId?: string }) => ReturnType<WorkspaceCore>;
  /** Opens an agent tenant transaction through a minted authority, never a caller-built context. */
  asAgent: <T>(
    tenantId: string,
    userId: string,
    action: (tx: TenantTransaction) => Promise<T>
  ) => Promise<T>;
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
