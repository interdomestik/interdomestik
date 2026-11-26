import assert from 'node:assert/strict';

import type { TenantTransaction } from '@interdomestik/database';
import { sql } from 'drizzle-orm';

import { role } from '../../../database/test/wp11-notification-deliveries-rls.fixture';
import {
  seedRecipient,
  tenantA,
  tenantB,
  withVerifiedRecipientDatabase,
} from '../../../database/test/wp11-verified-recipient-rls.fixture';
import { paymentPortTestScheduledAuthority } from '../../../database/test/exchange-rates.fixture';
import type { ExpiryDeliveryKey, ExpiryDeliveryRecord, ExpiryDeliveryState } from './types';

const queued: ExpiryDeliveryState = {
  state: 'queued',
  attempts: 0,
  nextAttemptAt: 0,
  terminalAt: null,
  lease: null,
  authorization: null,
  code: null,
};

export const recipientId = 'expiry-member';
export const foreignId = 'expiry-foreign';
export const staffId = 'expiry-staff';
export const absentId = 'expiry-absent';

export function withExpiryFixture(
  maxConnections: number,
  run: (
    fixture: Awaited<ReturnType<typeof expiryFixture>> & {
      appPoolSize: () => number | undefined;
    }
  ) => Promise<void>
) {
  return withVerifiedRecipientDatabase(maxConnections, async ({ admin, appPoolSize }) => {
    await run({ ...(await expiryFixture(admin)), appPoolSize });
  });
}

async function expiryFixture(
  admin: Parameters<Parameters<typeof withVerifiedRecipientDatabase>[1]>[0]['admin']
) {
  const email = await seedRecipient(admin, tenantA, recipientId);
  await seedRecipient(admin, tenantA, staffId, { roleName: 'staff' });
  await seedRecipient(admin, tenantB, foreignId);
  // These scratch relations supply the transaction helpers for the proof.
  await admin.unsafe(`
    create table expiry_fixture_gate (tenant_id text primary key, enabled boolean not null);
    create table expiry_fixture_period (
      tenant_id text not null, period_id text not null, member_id text,
      primary key (tenant_id, period_id)
    );
    create table expiry_fixture_delivery (
      tenant_id text not null, period_id text not null, reference text not null, metadata jsonb not null,
      primary key (tenant_id, period_id)
    );
    grant select, update (enabled) on expiry_fixture_gate to ${role};
    grant select, update (member_id) on expiry_fixture_period to ${role};
    grant select, update (metadata) on expiry_fixture_delivery to ${role};
  `);
  await admin`insert into expiry_fixture_gate values (${tenantA}, true)`;

  async function enqueue(periodId: string, memberId: string | null = recipientId) {
    await admin`insert into expiry_fixture_period values (${tenantA}, ${periodId}, ${memberId})
      on conflict do nothing`;
    await admin`insert into expiry_fixture_delivery
      values (${tenantA}, ${periodId}, ${`opaque-${periodId}`}, ${admin.json(queued)})
      on conflict do nothing`;
  }

  async function record(periodId: string) {
    const [row] = await admin<{ metadata: ExpiryDeliveryState }[]>`
      select metadata from expiry_fixture_delivery
      where tenant_id = ${tenantA} and period_id = ${periodId}`;
    assert.ok(row);
    return row.metadata;
  }

  return {
    admin,
    email,
    enqueue,
    record,
    authority: paymentPortTestScheduledAuthority(tenantA),
  };
}

export async function gateInTx(tx: TenantTransaction, tenantId: string) {
  const [row] = await tx.execute<{ enabled: boolean }>(sql`
    select enabled from expiry_fixture_gate where tenant_id = ${tenantId} for share`);
  return row?.enabled === true;
}

export async function lockEligiblePeriodInTx(
  tx: TenantTransaction,
  { tenantId, periodId }: ExpiryDeliveryKey
) {
  const [row] = await tx.execute<{ memberId: string | null }>(sql`
    select member_id as "memberId" from expiry_fixture_period
    where tenant_id = ${tenantId} and period_id = ${periodId} for share`);
  return row ?? null;
}

export async function lockDeliveryInTx(
  tx: TenantTransaction,
  { tenantId, periodId }: ExpiryDeliveryKey
) {
  const [row] = await tx.execute<{ reference: string; metadata: ExpiryDeliveryState }>(sql`
    select reference, metadata from expiry_fixture_delivery
    where tenant_id = ${tenantId} and period_id = ${periodId} for update`);
  return row ? { tenantId, periodId, ...row } : null;
}

export async function saveDeliveryInTx(
  tx: TenantTransaction,
  locked: ExpiryDeliveryRecord,
  next: ExpiryDeliveryState
) {
  const rows = await tx.execute(sql`
    update expiry_fixture_delivery set metadata = ${JSON.stringify(next)}::jsonb
    where tenant_id = ${locked.tenantId} and period_id = ${locked.periodId}
    and metadata = ${JSON.stringify(locked.metadata)}::jsonb
    returning period_id`);
  return rows.length === 1;
}
