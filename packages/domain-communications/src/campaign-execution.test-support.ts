import type { IngressCapability } from '@interdomestik/database/ingress';
import { type TenantAuthority } from '@interdomestik/database/tenant-authority';
import { mintTestTenantAuthority } from '@interdomestik/database/testing/tenant-authority';
import { vi, type Mock } from 'vitest';
import { type FakeUser } from './tenant-campaign-test-support';

// Matches Vitest's own Procedure so typed mocks stay callable and assignable like inferred ones.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type MockFunction = Mock<(...args: any[]) => any>;

// The producer is mocked; this stands in for the cron or Inngest entry's admitted capability.
export const INGRESS = Object.freeze({}) as IngressCapability<'cron'>;
export const authorities: Record<string, TenantAuthority> = {};

export function authorityFor(tenantId: string): TenantAuthority {
  authorities[tenantId] ??= mintTestTenantAuthority(tenantId);
  return authorities[tenantId];
}

type HMocks = {
  events: string[];
  findManyLogs: MockFunction;
  findManySkipped: MockFunction;
  findManyUsers: MockFunction;
  insertValues: MockFunction;
  listScheduledTenantWork: MockFunction;
  withTenantContext: MockFunction;
};

const h: HMocks = vi.hoisted(() => ({
  events: [] as string[],
  findManyLogs: vi.fn(),
  findManySkipped: vi.fn().mockResolvedValue([]),
  findManyUsers: vi.fn(),
  insertValues: vi.fn(),
  listScheduledTenantWork: vi.fn(),
  withTenantContext: vi.fn(),
}));

vi.mock('@interdomestik/database', () => ({
  inArray: (left: unknown, right: unknown[]) => ({ left, op: 'inArray', right }),
  withTenantContext: h.withTenantContext,
  listScheduledTenantWork: h.listScheduledTenantWork,
}));

vi.mock('@interdomestik/database/schema', () => ({
  engagementEmailSends: {
    tenantId: 'engagementEmailSends.tenantId',
    userId: 'engagementEmailSends.userId',
    templateKey: 'engagementEmailSends.templateKey',
    status: 'engagementEmailSends.status',
    dedupeKey: 'engagementEmailSends.dedupeKey',
  },
  emailCampaignLogs: {
    campaignId: 'emailCampaignLogs.campaignId',
    tenantId: 'emailCampaignLogs.tenantId',
    userId: 'emailCampaignLogs.userId',
  },
}));
vi.mock('drizzle-orm', () => ({
  inArray: (left: unknown, right: unknown[]) => ({ left, op: 'inArray', right }),
  and: (...clauses: unknown[]) => ({ clauses, op: 'and' }),
  eq: (left: unknown, right: unknown) => ({ left, op: 'eq', right }),
}));
vi.mock('nanoid', () => ({ nanoid: () => 'id-1' }));

export function scheduleTenants(tenantIds: string[]) {
  h.listScheduledTenantWork.mockResolvedValue(
    tenantIds.map(tenantId => ({ tenantId, authority: authorityFor(tenantId) }))
  );
}

export function user(id: string, tenantId: string): FakeUser {
  return { email: `${id}@example.com`, id, name: id, tenantId };
}

export { h };
