import assert from 'node:assert/strict';
import test from 'node:test';
import { mintIngressCapability } from '../src/ingress-capability';
import { authorizePaddleBillingTenant } from '../src/paddle-tenant-authority';
import { readTenantAuthority } from '../src/tenant-authority';

test('an entity-bound delivery authorizes exactly its billing tenant', () => {
  const delivery = mintIngressCapability('paddle-delivery', Date.now(), {
    billingTenantId: 'tenant_mk',
  });
  const authority = authorizePaddleBillingTenant(delivery, 'tenant_mk');
  const descriptor = readTenantAuthority(authority);
  assert.equal(descriptor.tenantId, 'tenant_mk');
  assert.equal(descriptor.accessTenantId, 'tenant_mk');
  assert.equal(descriptor.purpose, 'paddle-billing');
  assert.equal(descriptor.principal, null);
});

test('a billing authority for any other tenant fails closed', () => {
  const delivery = mintIngressCapability('paddle-delivery', Date.now(), {
    billingTenantId: 'tenant_mk',
  });
  assert.throws(
    () => authorizePaddleBillingTenant(delivery, 'tenant_ks'),
    /requires the delivery billing tenant/
  );
  assert.throws(() => authorizePaddleBillingTenant(delivery, ''), /billing tenant/);
});

test('an unbound legacy-secret delivery never yields a billing authority', () => {
  const delivery = mintIngressCapability('paddle-delivery');
  assert.throws(
    () => authorizePaddleBillingTenant(delivery, 'tenant_ks'),
    /requires an entity-bound delivery/
  );
});

test('a billing authority needs a registered, unexpired Paddle delivery', () => {
  const lookAlike = Object.freeze(Object.create(null));
  assert.throws(
    () => authorizePaddleBillingTenant(lookAlike as never, 'tenant_ks'),
    /Unrecognized ingress capability/
  );
  const cron = mintIngressCapability('cron');
  assert.throws(
    () => authorizePaddleBillingTenant(cron as never, 'tenant_ks'),
    /Unrecognized ingress capability/
  );
  const expired = mintIngressCapability('paddle-delivery', Date.now() - 11 * 60_000, {
    billingTenantId: 'tenant_ks',
  });
  assert.throws(() => authorizePaddleBillingTenant(expired, 'tenant_ks'), /Expired/);
});

test('only a Paddle delivery can carry a billing tenant binding', () => {
  assert.throws(
    () => mintIngressCapability('cron', Date.now(), { billingTenantId: 'tenant_ks' }),
    /Only a Paddle delivery/
  );
});
