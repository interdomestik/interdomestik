import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

const migration = readFileSync('drizzle/0070_domain_event_deliveries.sql', 'utf8');

describe('domain event delivery migration', () => {
  it('creates per-consumer uniqueness and tenant-isolated RLS', () => {
    assert.match(migration, /CREATE TABLE "domain_event_deliveries"/);
    assert.match(migration, /"domain_events_tenant_id_id_uq"/);
    assert.match(migration, /"domain_event_deliveries_event_consumer_uq"/);
    assert.match(migration, /"event_id","consumer_name"/);
    assert.match(migration, /FOREIGN KEY \("tenant_id","event_id"\)/);
    assert.match(migration, /ENABLE ROW LEVEL SECURITY/);
    assert.match(migration, /tenant_isolation_domain_event_deliveries/);
  });
});
