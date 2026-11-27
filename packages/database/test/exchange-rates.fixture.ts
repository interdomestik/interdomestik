import { randomUUID } from 'node:crypto';

import { sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import type postgres from 'postgres';

import type { TenantTransaction } from '../src/index';
import { mintIngressCapability, type IngressCapability } from '../src/ingress-capability';
import * as schema from '../src/schema';
import { mintTenantAuthority, type TenantAuthority } from '../src/tenant-authority';
import {
  requirePaymentPortTestRunner,
  withPaymentPortDatabase,
  type RateMigrationPhase,
} from './exchange-rates-database.fixture';
import { restricted, runtimeRole } from './exchange-rates-restricted.fixture';
import { runSequentially } from './in-order';
import { quoteIdentifier, TEST_DB_ROLE } from './rls-test-connection';

export {
  migratePaymentPortPhase,
  tables,
  withPaymentPortDatabase,
  type PaymentPortDatabase,
} from './exchange-rates-database.fixture';
export { signal, waitForLockWaiters, withLockedBook } from './exchange-rates-lock.fixture';
export { restricted, runtimeRole } from './exchange-rates-restricted.fixture';
export { withPaymentPortReleaseClient } from './exchange-rates-release-client.fixture';
export { TEST_DB_ROLE as paymentPortTestGuardRole } from './rls-test-connection';
export const rateInput = (effectiveOn: string) => ({
  base: 'EUR',
  quote: 'MKD',
  rate: '61.5',
  effectiveOn,
});

export { runSequentially } from './in-order';

export type RateRow = {
  id: string;
  caller_kind: string;
  stored_by: string | null;
  effective_on: string;
  week_starts_on: string;
  revision: number;
  corrects_rate_id: string | null;
};

export function firstRate(tenantId: string, bookId: string, effectiveOn = '2026-01-07') {
  return {
    id: randomUUID(),
    tenant_id: tenantId,
    book_id: bookId,
    base: 'EUR',
    quote: 'MKD',
    rate: '61.5',
    effective_on: effectiveOn,
    week_starts_on: null as string | null,
    revision: 1,
    corrects_rate_id: null as string | null,
    correction_reason: null as string | null,
    source: 'nbrm',
    caller_kind: 'inngest',
    stored_by: null as string | null,
  };
}

export function insertRate(tx: postgres.TransactionSql, rate: ReturnType<typeof firstRate>) {
  return tx<RateRow[]>`insert into exchange_rates ${tx(rate)}
    returning id, caller_kind, stored_by, effective_on::text, week_starts_on::text, revision, corrects_rate_id`;
}

export type ExchangeRateFixture = Awaited<ReturnType<typeof createFixture>> & {
  peer: postgres.Sql;
  session: (
    roleName?: string,
    home?: string,
    access?: string,
    userId?: ReturnType<typeof randomUUID>
  ) => TenantAuthority;
  authority: TenantAuthority;
};

export async function provisionRateWindow(
  client: postgres.Sql,
  tenantId: string,
  bookId: string,
  effectiveOn: string,
  opensAt?: string,
  deadlineAt?: string
) {
  const role = quoteIdentifier(TEST_DB_ROLE);
  await client.unsafe(`grant select on exchange_rate_books to ${role}`);
  await client.unsafe(`grant update (id) on exchange_rate_books to ${role}`);
  await client.unsafe(`grant select, insert on exchange_rate_check_windows to ${role}`);
  const id = randomUUID();
  await restricted(
    client,
    tenantId,
    tx => tx`
    insert into exchange_rate_check_windows (id, tenant_id, book_id, effective_on, opens_at, deadline_at, approval_ref)
    values (${id}, ${tenantId}, ${bookId}, ${effectiveOn}::date,
      coalesce(${opensAt ?? null}::timestamptz, ${effectiveOn}::date::timestamp at time zone 'Europe/Skopje'),
      coalesce(${deadlineAt ?? null}::timestamptz, (${effectiveOn}::date + 1)::timestamp at time zone 'Europe/Skopje'),
      'finance/wp07-test')`,
    TEST_DB_ROLE
  );
  return id;
}
export type PaymentPortTestTransaction = postgres.TransactionSql;

export { scratchServerMissing } from './pg16/scratch-database';

export function mintPaymentPortTestIngress<T extends 'cron' | 'inngest'>(
  kind: T,
  issuedAt?: number
): IngressCapability<T> {
  requirePaymentPortTestRunner();
  return mintIngressCapability(kind, issuedAt);
}

export function paymentPortTestScheduledAuthority(tenantId: string): TenantAuthority {
  requirePaymentPortTestRunner();
  return mintTenantAuthority({ tenantId, purpose: 'scheduled-work' });
}

export function paymentPortTestSession(
  tenantId: string,
  userId: string,
  role: string,
  branchId: string | null = null,
  accessTenantId = tenantId
): TenantAuthority {
  requirePaymentPortTestRunner();
  return mintTenantAuthority({
    tenantId,
    accessTenantId,
    purpose: 'session',
    principal: { userId, role, branchId, agentId: null },
  });
}

export function withPaymentPortTestTransaction<T>(
  client: postgres.Sql,
  tenantId: string,
  role: string,
  work: (tx: TenantTransaction) => Promise<T>,
  isolationLevel: 'read committed' | 'repeatable read'
) {
  requirePaymentPortTestRunner();
  return drizzle(client, { schema }).transaction(
    async tx => {
      await tx.execute(sql.raw(`set local role ${quoteIdentifier(runtimeRole)}`));
      await tx.execute(sql`set local row_security = on`);
      await tx.execute(sql`select set_config('app.current_access_tenant_id', ${tenantId}, true),
      set_config('app.current_tenant_id', ${tenantId}, true),
      set_config('app.user_role', ${role}, true)`);
      return work(tx);
    },
    { isolationLevel }
  );
}

export function withExchangeRateFixture(
  run: (fixture: ExchangeRateFixture) => Promise<void>,
  phase?: RateMigrationPhase
) {
  return withPaymentPortDatabase(async ({ admin, peer }) => {
    const fixture = await createFixture(admin);
    const { tenantId, actor } = fixture;
    const session = (
      roleName = 'tenant_admin',
      home = tenantId,
      access = home,
      userId = actor.id
    ) => paymentPortTestSession(home, userId, roleName, null, access);
    await run({ ...fixture, peer, session, authority: session() });
  }, phase);
}

async function createFixture(admin: postgres.Sql) {
  const tenants = Array.from({ length: 4 }, () => `wp07_${randomUUID()}`);
  const [tenantId, otherTenant, noEntity, concurrentTenant] = tenants;
  await admin`insert into tenants (id, name, legal_name, country_code)
    select id, id, id, 'MK' from unnest(${tenants}::text[]) as id`;
  const actor = { id: randomUUID(), tenantId };
  const withoutBook = { id: randomUUID(), tenantId: noEntity };
  await runSequentially([actor, withoutBook], async user => {
    const email = `${user.id}@example.test`;
    await admin`insert into "user" (id, tenant_id, name, email, "emailVerified", role, "createdAt", "updatedAt")
      values (${user.id}, ${user.tenantId}, 'Test administrator', ${email}, true, 'tenant_admin', now(), now())`;
  });

  const bookRows = (id: string) =>
    restricted(
      admin,
      id,
      tx =>
        tx<
          { id: string; base: string; quote: string }[]
        >`select id, base, quote from exchange_rate_books`
    );
  const createEntity = (client: postgres.Sql | postgres.TransactionSql, id: string) =>
    client`insert into legal_entities (id, tenant_id, legal_name, country_code)
      values (${randomUUID()}, ${id}, 'Test entity', 'MK')`;
  return {
    admin,
    tenantId,
    otherTenant,
    noEntity,
    concurrentTenant,
    actor,
    withoutBook,
    bookRows,
    createEntity,
  };
}
