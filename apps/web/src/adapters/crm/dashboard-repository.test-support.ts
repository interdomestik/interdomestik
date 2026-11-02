import { mintTestTenantAuthority } from '@interdomestik/database/testing/tenant-authority';
import { vi } from 'vitest';
import type { CrmActorContext } from '@interdomestik/domain-crm/context';
import { createCrmDashboardRepository } from './dashboard-repository';

const hoisted = vi.hoisted(() => {
  const dbSelect = vi.fn();
  const db = { select: dbSelect };
  return {
    db,
    dbSelect,
    withTenantContext: vi.fn(async (_context: unknown, callback: (tx: typeof db) => unknown) =>
      callback(db)
    ),
  };
});
vi.mock('@interdomestik/database', () => ({
  withTenantContext: hoisted.withTenantContext,
}));
vi.mock('@interdomestik/database/db', () => ({
  db: hoisted.db,
}));
vi.mock('@interdomestik/database/schema', () => ({
  agentCommissions: {
    agentId: 'agentCommissions.agentId',
    amount: 'agentCommissions.amount',
    status: 'agentCommissions.status',
    tenantId: 'agentCommissions.tenantId',
  },
  crmActivities: {
    agentId: 'crmActivities.agentId',
    branchId: 'crmActivities.branchId',
    completedAt: 'crmActivities.completedAt',
    createdAt: 'crmActivities.createdAt',
    id: 'crmActivities.id',
    leadId: 'crmActivities.leadId',
    scheduledAt: 'crmActivities.scheduledAt',
    summary: 'crmActivities.summary',
    tenantId: 'crmActivities.tenantId',
    type: 'crmActivities.type',
  },
  crmDeals: {
    agentId: 'crmDeals.agentId',
    leadId: 'crmDeals.leadId',
    stage: 'crmDeals.stage',
    tenantId: 'crmDeals.tenantId',
  },
  crmLeads: {
    agentId: 'crmLeads.agentId',
    branchId: 'crmLeads.branchId',
    companyName: 'crmLeads.companyName',
    fullName: 'crmLeads.fullName',
    id: 'crmLeads.id',
    stage: 'crmLeads.stage',
    tenantId: 'crmLeads.tenantId',
  },
  crmTasks: {
    assignedActorId: 'crmTasks.assignedActorId',
    assignedKind: 'crmTasks.assignedKind',
    branchId: 'crmTasks.branchId',
    createReasonCode: 'crmTasks.createReasonCode',
    createdAt: 'crmTasks.createdAt',
    dueAt: 'crmTasks.dueAt',
    id: 'crmTasks.id',
    lifecycleVersion: 'crmTasks.lifecycleVersion',
    status: 'crmTasks.status',
    subjectId: 'crmTasks.subjectId',
    subjectKind: 'crmTasks.subjectKind',
    tenantId: 'crmTasks.tenantId',
  },
}));
vi.mock('drizzle-orm', () => ({
  and: vi.fn((...args: unknown[]) => ({ and: args })),
  asc: vi.fn((col: unknown) => ({ asc: col })),
  count: vi.fn(() => ({ kind: 'count' })),
  eq: vi.fn((a: unknown, b: unknown) => ({ eq: [a, b] })),
  inArray: vi.fn((col: unknown, vals: unknown) => ({ inArray: [col, vals] })),
  isNull: vi.fn((col: unknown) => ({ isNull: col })),
  lte: vi.fn((a: unknown, b: unknown) => ({ lte: [a, b] })),
  sql: (strings: TemplateStringsArray, ...values: unknown[]) => ({ sql: { strings, values } }),
}));
const authority = mintTestTenantAuthority('tenant-1');
const repository = createCrmDashboardRepository(authority);
const actor: CrmActorContext = {
  actorId: 'agent-1',
  role: 'agent',
  scope: { agentId: 'agent-1', branchId: 'branch-1' },
  tenantId: 'tenant-1',
};
function createSelectChain(result: unknown) {
  return {
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockResolvedValue(result),
  };
}
function createGroupByChain(result: unknown) {
  const afterWhere = { groupBy: vi.fn().mockResolvedValue(result) };
  return {
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnValue(afterWhere),
    afterWhere,
  };
}
function createJoinSelectChain(result: unknown) {
  return {
    from: vi.fn().mockReturnThis(),
    innerJoin: vi.fn().mockReturnThis(),
    where: vi.fn().mockResolvedValue(result),
  };
}
function createDueFollowUpsChain(result: unknown) {
  const afterOrderBy = { limit: vi.fn().mockResolvedValue(result) };
  const afterWhere = { orderBy: vi.fn().mockReturnValue(afterOrderBy) };
  return {
    from: vi.fn().mockReturnThis(),
    innerJoin: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnValue(afterWhere),
    afterWhere,
    afterOrderBy,
  };
}

export {
  hoisted,
  authority,
  repository,
  actor,
  createSelectChain,
  createGroupByChain,
  createJoinSelectChain,
  createDueFollowUpsChain,
};
