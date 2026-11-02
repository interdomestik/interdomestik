import assert from 'node:assert/strict';
import test from 'node:test';

import {
  isTenantAuthority,
  mintTenantAuthority,
  readTenantAuthority,
  type TenantAuthority,
} from '../src/tenant-authority';
import { resolveTenantContext } from '../src/tenant-context-resolution';
import { mintTestTenantAuthority } from '../src/testing/tenant-authority';

const NOW = 1_800_000_000_000;
const principal = { userId: 'user-1', role: 'staff', branchId: 'branch-1', agentId: null };

test('a minted authority carries its tenant, access tenant, purpose and principal', () => {
  const authority = mintTenantAuthority(
    { tenantId: ' tenant-a ', accessTenantId: 'tenant-b', purpose: 'session', principal },
    NOW
  );
  const descriptor = readTenantAuthority(authority, NOW);
  assert.equal(descriptor.tenantId, 'tenant-a');
  assert.equal(descriptor.accessTenantId, 'tenant-b');
  assert.equal(descriptor.purpose, 'session');
  assert.deepEqual(descriptor.principal, principal);
  assert.equal(descriptor.expiresAtMs, NOW + 10 * 60_000);
});

test('the access tenant defaults to the tenant', () => {
  const authority = mintTenantAuthority({ tenantId: 'tenant-a', purpose: 'scheduled-work' }, NOW);
  assert.equal(readTenantAuthority(authority, NOW).accessTenantId, 'tenant-a');
});

test('minting rejects a blank tenant, a blank principal user and an unknown purpose', () => {
  assert.throws(() => mintTenantAuthority({ tenantId: '  ', purpose: 'session' }), /tenantId/u);
  assert.throws(
    () =>
      mintTenantAuthority({
        tenantId: 'tenant-a',
        purpose: 'session',
        principal: { ...principal, userId: ' ' },
      }),
    /principal userId/u
  );
  assert.throws(
    () => mintTenantAuthority({ tenantId: 'tenant-a', purpose: 'admin' as never }),
    /known purpose/u
  );
});

test('forged, copied and look-alike tokens are not authorities', () => {
  const authority = mintTenantAuthority({ tenantId: 'tenant-a', purpose: 'session' }, NOW);
  const forgeries: unknown[] = [
    {},
    Object.freeze(Object.create(null)),
    { ...authority },
    Object.assign(Object.create(null), authority),
    structuredClone(authority),
    { tenantId: 'tenant-victim' },
    null,
    'tenant-a',
  ];
  for (const forged of forgeries) {
    assert.equal(isTenantAuthority(forged), false);
    assert.throws(() => readTenantAuthority(forged as TenantAuthority, NOW), /Unrecognized/u);
  }
});

test('a token and its descriptor cannot be mutated after minting', () => {
  const authority = mintTenantAuthority(
    { tenantId: 'tenant-a', purpose: 'session', principal },
    NOW
  );
  assert.equal(Object.isFrozen(authority), true);
  assert.equal(Reflect.set(authority, 'tenantId', 'tenant-victim'), false);
  const descriptor = readTenantAuthority(authority, NOW);
  assert.equal(Object.isFrozen(descriptor), true);
  assert.equal(Object.isFrozen(descriptor.principal), true);
  assert.equal(Reflect.set(descriptor, 'tenantId', 'tenant-victim'), false);
  assert.equal(Reflect.set(descriptor.principal as object, 'role', 'super_admin'), false);
  assert.equal(readTenantAuthority(authority, NOW).tenantId, 'tenant-a');
});

test('an expired authority fails closed', () => {
  const authority = mintTenantAuthority({ tenantId: 'tenant-a', purpose: 'session' }, NOW);
  assert.doesNotThrow(() => readTenantAuthority(authority, NOW + 10 * 60_000 - 1));
  assert.throws(() => readTenantAuthority(authority, NOW + 10 * 60_000), /Expired/u);
});

test('context resolution takes every field from the authority descriptor', () => {
  const authority = mintTenantAuthority(
    { tenantId: 'tenant-a', accessTenantId: 'tenant-b', purpose: 'session', principal },
    Date.now()
  );
  assert.deepEqual(resolveTenantContext(authority), {
    tenantId: 'tenant-a',
    accessTenantId: 'tenant-b',
    role: 'staff',
  });
});

test('legacy context resolution keeps its validation and access-tenant default', () => {
  assert.deepEqual(resolveTenantContext({ tenantId: ' tenant-a ' }), {
    tenantId: 'tenant-a',
    accessTenantId: 'tenant-a',
    role: null,
  });
  assert.deepEqual(resolveTenantContext({ tenantId: 'tenant-a', accessTenantId: ' ' }), {
    tenantId: 'tenant-a',
    accessTenantId: 'tenant-a',
    role: null,
  });
  assert.throws(() => resolveTenantContext({ tenantId: ' ' }), /non-empty tenantId/u);
});

test('a look-alike object without a string tenant fails closed instead of reaching the database', () => {
  const lookAlike = Object.freeze(Object.create(null)) as TenantAuthority;
  assert.throws(() => resolveTenantContext(lookAlike), /non-empty tenantId/u);
});

test('test minting works under the test runner and carries the test purpose', () => {
  const authority = mintTestTenantAuthority('tenant-a', { userId: 'user-1', role: 'agent' });
  const descriptor = readTenantAuthority(authority);
  assert.equal(descriptor.purpose, 'test');
  assert.equal(descriptor.principal?.role, 'agent');
});
