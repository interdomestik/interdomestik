import assert from 'node:assert/strict';
import test from 'node:test';

import {
  defaultBookingLinks,
  legalEntities,
  marketingHosts,
  subscriptions,
  tenantEntityBoundaries,
} from '../src/schema';

test('T-504 schema exports explicit legal, host, and booking boundaries', () => {
  assert.equal(legalEntities.id.name, 'id');
  assert.equal(legalEntities.tenantId.name, 'tenant_id');
  assert.equal(legalEntities.legalName.name, 'legal_name');
  assert.equal(legalEntities.governingLaw.name, 'governing_law');
  assert.equal(legalEntities.tenantId.notNull, true);
  assert.equal(legalEntities.governingLaw.notNull, false);

  assert.equal(marketingHosts.tenantId.name, 'tenant_id');
  assert.equal(marketingHosts.host.name, 'host');
  assert.equal(marketingHosts.isPrimary.name, 'is_primary');

  assert.equal(defaultBookingLinks.marketingHostId.name, 'marketing_host_id');
  assert.equal(defaultBookingLinks.defaultBookingTenantId.name, 'default_booking_tenant_id');
  assert.equal(defaultBookingLinks.legalEntityId.name, 'legal_entity_id');
});

test('T-504 keeps subscription legal entity compatibility additive and nullable', () => {
  assert.equal(subscriptions.legalTenantId.name, 'legal_tenant_id');
  assert.equal(subscriptions.legalEntityId.name, 'legal_entity_id');
  assert.equal(subscriptions.legalEntityId.notNull, false);
});

test('T-504 exposes the compatibility boundary view shape', () => {
  assert.equal(tenantEntityBoundaries.homeTenantId.name, 'home_tenant_id');
  assert.equal(tenantEntityBoundaries.legalEntityId.name, 'legal_entity_id');
  assert.equal(tenantEntityBoundaries.marketingHostId.name, 'marketing_host_id');
  assert.equal(tenantEntityBoundaries.defaultBookingTenantId.name, 'default_booking_tenant_id');
  assert.equal(tenantEntityBoundaries.marketingHost.name, 'marketing_host');
});
