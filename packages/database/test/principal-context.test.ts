import assert from 'node:assert/strict';
import test from 'node:test';

import { withPrincipalTenantContext } from '../src/principal-context';
import { mintTenantAuthority } from '../src/tenant-authority';

test('principal context rejects delegated authorities before invoking the callback', async () => {
  const authority = mintTenantAuthority({
    tenantId: 'fixture-tenant',
    purpose: 'test',
    principal: { userId: 'fixture-member', role: 'member', branchId: null, agentId: null },
  });
  await assert.rejects(
    withPrincipalTenantContext(authority, async () => assert.fail('unexpected tenant callback')),
    /Session principal required/
  );
});

test('principal context rejects sessions without an actor role', async () => {
  const authority = mintTenantAuthority({
    tenantId: 'fixture-tenant',
    purpose: 'session',
    principal: { userId: 'fixture-member', role: null, branchId: null, agentId: null },
  });
  await assert.rejects(
    withPrincipalTenantContext(authority, async () => assert.fail('unexpected tenant callback')),
    /Session principal required/
  );
});
