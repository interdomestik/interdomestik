import assert from 'node:assert/strict';
import test from 'node:test';

import { withTenantAuthority } from '../src/tenant-authority-context';
import type { TenantAuthority } from '../src/tenant-authority';

test('the authority-only entry refuses legacy contexts and look-alikes before opening a transaction', async () => {
  let opened = false;
  const action = async () => {
    opened = true;
    return 'reached';
  };
  const refused: unknown[] = [
    { tenantId: 'tenant-victim' },
    { tenantId: 'tenant-victim', accessTenantId: 'tenant-victim', role: 'admin' },
    Object.freeze(Object.create(null)),
    null,
    'tenant-victim',
  ];
  for (const value of refused) {
    await assert.rejects(
      withTenantAuthority(value as TenantAuthority, action),
      /Unrecognized tenant authority/u
    );
  }
  assert.equal(opened, false);
});
