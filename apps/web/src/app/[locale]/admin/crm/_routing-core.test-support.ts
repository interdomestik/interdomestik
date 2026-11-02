import { mintTestTenantAuthority } from '@interdomestik/database/testing/tenant-authority';
import { vi } from 'vitest';
import type { CrmActorContext } from '@interdomestik/domain-crm/context';
import type {
  AdminCrmRoutingRuleAdminRepository,
  AdminCrmRoutingRuleRow,
} from '@/adapters/crm/routing-repository';

export const TEST_AUTHORITY = mintTestTenantAuthority('tenant-1');

export const adminActor: CrmActorContext = {
  actorId: 'admin-1',
  role: 'admin',
  scope: { branchId: null },
  tenantId: 'tenant-1',
};

export const adminSession = {
  user: {
    branchId: null,
    id: 'admin-1',
    role: 'admin',
    tenantId: 'tenant-1',
  },
};

export const baseInput = {
  agentIds: ['agent-1', 'agent-2'],
  branchId: null,
  effectiveFrom: null,
  effectiveTo: null,
  fallbackAgentId: null,
  fallbackRuleId: null,
  leadType: null,
  maxNewLeadsPerAgentPerDay: null,
  maxOpenLeadsPerAgent: null,
  priority: 0,
  source: 'website',
  strategy: 'round_robin' as const,
  utmCampaign: null,
  utmMedium: null,
  utmSource: null,
};

export function rule(overrides: Partial<AdminCrmRoutingRuleRow> = {}): AdminCrmRoutingRuleRow {
  return {
    agentIds: ['agent-1', 'agent-2'],
    archivedAt: null,
    branchId: null,
    createdAt: '2026-05-16T08:00:00.000Z',
    effectiveFrom: null,
    effectiveTo: null,
    enabled: true,
    fallbackAgentId: null,
    fallbackRuleId: null,
    id: 'rule-1',
    leadType: null,
    maxNewLeadsPerAgentPerDay: null,
    maxOpenLeadsPerAgent: null,
    priority: 0,
    source: 'website',
    strategy: 'round_robin' as const,
    tenantId: 'tenant-1',
    updatedAt: '2026-05-16T08:00:00.000Z',
    utmCampaign: null,
    utmMedium: null,
    utmSource: null,
    ...overrides,
  };
}

export function repository(
  overrides: Partial<AdminCrmRoutingRuleAdminRepository> = {}
): AdminCrmRoutingRuleAdminRepository {
  return {
    archiveRoutingRule: vi.fn(() => Promise.resolve(rule())),
    createRoutingRule: vi.fn(() => Promise.resolve(rule())),
    getRoutingRule: vi.fn(() => Promise.resolve(rule())),
    listAgentScopes: vi.fn(() =>
      Promise.resolve([
        { branchId: null, id: 'agent-1', role: 'agent', tenantId: 'tenant-1' },
        { branchId: null, id: 'agent-2', role: 'agent', tenantId: 'tenant-1' },
      ])
    ),
    listBranches: vi.fn(() =>
      Promise.resolve([{ id: 'branch-1', label: 'North', tenantId: 'tenant-1' }])
    ),
    listRoutingRulesForAdmin: vi.fn(() => Promise.resolve([rule()])),
    reorderRoutingRules: vi.fn(() => Promise.resolve([rule()])),
    setRoutingRuleEnabled: vi.fn(() => Promise.resolve(rule())),
    updateRoutingRule: vi.fn(() => Promise.resolve(rule())),
    ...overrides,
  };
}
