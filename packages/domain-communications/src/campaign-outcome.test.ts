import { mintTestTenantAuthority } from '@interdomestik/database/testing/tenant-authority';
import { QueryBuilder } from 'drizzle-orm/pg-core';
import { expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({ context: vi.fn() }));
vi.mock('@interdomestik/database/tenant-authority-context', () => ({
  withTenantAuthority: h.context,
}));
import { completedCampaignUsers } from './campaign-outcome';

it('executes one bounded UNION with tenant and batch predicates on both terminal sources', async () => {
  const authority = mintTestTenantAuthority('tenant-a');
  const result = [{ tenantId: 'tenant-a', userId: 'u1' }];
  let statement: { sql: string; params: unknown[] } | undefined;
  h.context.mockImplementation((_authority, query) => {
    statement = query(new QueryBuilder()).toSQL();
    return Promise.resolve(result);
  });
  expect(await completedCampaignUsers(authority, 'winter', ['u1', 'u2'])).toBe(result);
  expect(h.context).toHaveBeenCalledExactlyOnceWith(authority, expect.any(Function));
  expect(statement?.sql.match(/\bunion\b/g)).toHaveLength(1);
  expect(statement?.sql).not.toContain('union all');
  expect(statement?.sql).toContain('"email_campaign_logs"."tenant_id"');
  expect(statement?.sql).toContain('"engagement_email_sends"."tenant_id"');
  expect(statement?.sql.match(/\bin\s*\(/g)).toHaveLength(2);
  expect(statement?.params).toEqual([
    'tenant-a',
    'winter',
    'u1',
    'u2',
    'tenant-a',
    'campaign:winter',
    'skipped',
    'u1',
    'u2',
  ]);
});
