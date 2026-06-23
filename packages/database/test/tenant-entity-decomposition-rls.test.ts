import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';

import { inArray, sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

import { defaultBookingLinks, legalEntities, marketingHosts } from '../src/schema';
import {
  grantRlsTestRole,
  quoteIdentifier,
  requireRlsPreconditions,
  TEST_DB_ROLE,
} from './rls-test-connection';

const KS_TENANT_ID = 'tenant_ks';
const MK_TENANT_ID = 'tenant_mk';
const REQUIRED_RLS_TABLES = ['legal_entities', 'marketing_hosts', 'default_booking_links'] as const;

function uniqueId(prefix: string): string {
  return `${prefix}_${Date.now()}_${randomUUID().slice(0, 8)}`;
}

test('T-504 entity tables use home tenant RLS, not access or booking tenant hints', async t => {
  const requireIntegration = process.env.REQUIRE_RLS_INTEGRATION === '1';

  if (!process.env.DATABASE_URL) {
    if (requireIntegration) {
      assert.fail('T-504 RLS test requires DATABASE_URL when REQUIRE_RLS_INTEGRATION=1.');
    }
    t.skip('DATABASE_URL is required for T-504 RLS integration test');
    return;
  }

  const adminSql = postgres(process.env.DATABASE_URL);
  const adminDb = drizzle(adminSql);

  await requireRlsPreconditions(adminDb, adminSql, requireIntegration, t, REQUIRED_RLS_TABLES);
  if (t.signal.aborted) return;

  const runId = uniqueId('t504');
  const ksLegalId = `${runId}_ks_legal`;
  const mkLegalId = `${runId}_mk_legal`;
  const ksHostId = `${runId}_ks_host`;
  const mkHostId = `${runId}_mk_host`;
  const ksBookingId = `${KS_TENANT_ID}:default-booking`;
  const mkBookingId = `${MK_TENANT_ID}:default-booking`;

  try {
    const bookingFixtures = await adminDb
      .select({ id: defaultBookingLinks.id, tenantId: defaultBookingLinks.tenantId })
      .from(defaultBookingLinks)
      .where(inArray(defaultBookingLinks.id, [ksBookingId, mkBookingId]));
    bookingFixtures.sort((a, b) => a.id.localeCompare(b.id));
    assert.deepEqual(
      bookingFixtures,
      [
        { id: ksBookingId, tenantId: KS_TENANT_ID },
        { id: mkBookingId, tenantId: MK_TENANT_ID },
      ],
      'T-504 RLS test requires migrated default_booking_links fixture rows'
    );

    await adminDb.execute(
      sql.raw(`
        do $$
        begin
          create role ${quoteIdentifier(TEST_DB_ROLE)} nologin;
        exception
          when duplicate_object then null;
        end
        $$;
      `)
    );
    await grantRlsTestRole(adminDb, REQUIRED_RLS_TABLES);

    await adminDb
      .insert(legalEntities)
      .values([
        entityRow(ksLegalId, KS_TENANT_ID, 'KS Test Entity'),
        entityRow(mkLegalId, MK_TENANT_ID, 'MK Test Entity'),
      ]);
    await adminDb
      .insert(marketingHosts)
      .values([
        hostRow(ksHostId, KS_TENANT_ID, `${runId}-ks.example.test`),
        hostRow(mkHostId, MK_TENANT_ID, `${runId}-mk.example.test`),
      ]);

    const rows = await adminDb.transaction(async tx => {
      await tx.execute(sql.raw(`set local role ${quoteIdentifier(TEST_DB_ROLE)}`));
      await tx.execute(sql`set local row_security = on`);
      await tx.execute(sql`select set_config('app.current_tenant_id', ${KS_TENANT_ID}, true)`);
      await tx.execute(
        sql`select set_config('app.current_access_tenant_id', ${MK_TENANT_ID}, true)`
      );

      const [legalRows, hostRows, bookingRows] = await Promise.all([
        tx
          .select({ id: legalEntities.id, tenantId: legalEntities.tenantId })
          .from(legalEntities)
          .where(inArray(legalEntities.id, [ksLegalId, mkLegalId])),
        tx
          .select({ id: marketingHosts.id, tenantId: marketingHosts.tenantId })
          .from(marketingHosts)
          .where(inArray(marketingHosts.id, [ksHostId, mkHostId])),
        tx
          .select({ id: defaultBookingLinks.id, tenantId: defaultBookingLinks.tenantId })
          .from(defaultBookingLinks)
          .where(inArray(defaultBookingLinks.id, [ksBookingId, mkBookingId])),
      ]);
      return { bookingRows, hostRows, legalRows };
    });

    assert.deepEqual(rows.legalRows, [{ id: ksLegalId, tenantId: KS_TENANT_ID }]);
    assert.deepEqual(rows.hostRows, [{ id: ksHostId, tenantId: KS_TENANT_ID }]);
    assert.deepEqual(rows.bookingRows, [{ id: ksBookingId, tenantId: KS_TENANT_ID }]);
  } finally {
    await adminDb.delete(marketingHosts).where(inArray(marketingHosts.id, [ksHostId, mkHostId]));
    await adminDb.delete(legalEntities).where(inArray(legalEntities.id, [ksLegalId, mkLegalId]));
    await adminSql.end({ timeout: 5 });
  }
});

function entityRow(id: string, tenantId: string, legalName: string) {
  return { countryCode: 'XK', currency: 'EUR', id, legalName, tenantId };
}

function hostRow(id: string, tenantId: string, host: string) {
  return { host, id, isPrimary: false, label: id, tenantId };
}
