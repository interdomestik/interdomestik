import {
  paymentPortTestSession,
  restricted,
  runSequentially,
  runtimeRole,
  type PaymentPortDatabase,
} from '../../../../database/test/exchange-rates.fixture';
import { sql } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { expect } from 'vitest';

import { grantSaleFixturePrerequisites, type SaleFixture } from './individual-sales.test-support';

export async function installAgeProbe(database: PaymentPortDatabase) {
  const { admin } = database;
  const [{ name, version }] = await admin<{ name: string; version: string }[]>`
    select current_database() as name, current_setting('server_version_num') as version`;
  expect(name).toMatch(/^wp07_payment_/u);
  expect(Math.floor(Number(version) / 10000)).toBe(16);
  await grantSaleFixturePrerequisites(database);
  const { withTenantAuthority } = await import('@interdomestik/database/tenant-authority-context');
  const authority = paymentPortTestSession(randomUUID(), randomUUID(), 'tenant_admin');
  await withTenantAuthority(authority, async tx => {
    const [connection] = await tx.execute<{ name: string; role: string }>(
      sql`select current_database() as name, current_user as role`
    );
    expect(connection).toEqual({ name, role: runtimeRole });
  });

  await admin`create table wp07_sale_age_probe (
    id uuid primary key, kind text not null, tenant_id text not null, rate_book_id text not null,
    rate_id text not null, sold_at timestamptz not null)`;
  await admin`create trigger wp07_sale_age_probe before insert on wp07_sale_age_probe
    for each row when (new.kind = 'individual')
    execute function public.membership_sale_rate_verification_age_fn()`;
  await admin.unsafe(`grant select, insert on wp07_sale_age_probe to "${runtimeRole}"`);
}

export function probeSaleAge(f: SaleFixture, rateId: string, instant: string, id = randomUUID()) {
  return restricted(
    f.peer,
    f.tenantId,
    tx => tx`
    insert into wp07_sale_age_probe (id, kind, tenant_id, rate_book_id, rate_id, sold_at)
    values (${id}, 'individual', ${f.tenantId}, ${f.bookId}, ${rateId}, ${instant}::text::timestamptz)
    returning id`
  );
}

export async function installCalendarClock({ admin }: PaymentPortDatabase) {
  await admin`create table wp07_rate_clock (instant timestamptz not null)`;
  await admin`insert into wp07_rate_clock values (clock_timestamp())`;
  await admin`create function public.wp07_test_rate_clock() returns timestamptz
    language sql volatile security invoker set search_path = pg_catalog, public
    as $$ select instant from public.wp07_rate_clock $$`;
  await admin.unsafe(`grant select on wp07_rate_clock to "${runtimeRole}"`);
  await runSequentially(
    [
      ['public.exchange_rate_insert_guard_fn()', 'NEW.stored_at := clock_timestamp()'],
      [
        'public.exchange_rate_verifications_insert_guard_fn()',
        'NEW.verified_at := clock_timestamp()',
      ],
    ],
    async ([name, assignment]) => {
      const [{ body }] = await admin<{ body: string }[]>`
        select pg_get_functiondef(${name}::regprocedure) as body`;
      expect(body.split(assignment)).toHaveLength(2);
      const testStamp = assignment.replace('clock_timestamp()', 'public.wp07_test_rate_clock()');
      await admin.unsafe(body.replace(assignment, testStamp));
    }
  );
  return (instant: string) =>
    admin`update wp07_rate_clock set instant = ${instant}::text::timestamptz`;
}
