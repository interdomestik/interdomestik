import type { TenantTransaction } from '@interdomestik/database';
import { mintTestTenantAuthority } from '@interdomestik/database/testing/tenant-authority';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import { expect, it } from 'vitest';
import { selectVisibleOpsClaim } from './visible-ops-claim';

it('keeps a manager’s exact claim and branch filters inside the fixed relation', () => {
  const db = drizzle.mock();
  const authority = mintTestTenantAuthority('tenant-1', {
    purpose: 'session',
    userId: 'manager-1',
    role: 'branch_manager',
    branchId: 'branch-1',
  });
  const visibleClaim = selectVisibleOpsClaim(db as unknown as TenantTransaction, {
    authority,
    claimId: 'claim-1',
  });
  if (!visibleClaim) throw new Error('Expected a visible claim subquery');

  expect(visibleClaim).not.toHaveProperty('where');
  expect(visibleClaim).not.toHaveProperty('execute');
  expect(visibleClaim).not.toHaveProperty('$dynamic');
  const query = db.select().from(visibleClaim).where(eq(visibleClaim.id, 'outer-id')).toSQL();
  expect(query.sql).toContain(
    'where (("claim"."access_tenant_id" = $1 or ("claim"."tenant_id" = $2 and "claim"."access_tenant_id" is null)) and "claim"."id" = $3 and "claim"."branch_id" = $4)'
  );
  expect(query.params).toEqual(['tenant-1', 'tenant-1', 'claim-1', 'branch-1', 'outer-id']);
});
