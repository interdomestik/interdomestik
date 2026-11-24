import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import type { TestContext } from 'node:test';
import type postgres from 'postgres';

import { withLockedBook } from './exchange-rates-lock.fixture';
import { seedRateLinkedSale } from './exchange-rates-sale.fixture';
import {
  firstRate,
  insertRate,
  restricted,
  runSequentially,
  tables,
  type ExchangeRateFixture,
} from './exchange-rates.fixture';
import { TEST_DB_ROLE } from './rls-test-connection';

async function attemptTruncate(
  tx: postgres.TransactionSql,
  table: (typeof tables)[number],
  mode: 'restrict' | 'cascade' = 'restrict'
) {
  const clause = mode === 'cascade' ? tx`cascade` : tx`restrict`;
  await tx`truncate table public.${tx(table)} ${clause}`;
  // Force rollback even if a missing guard lets TRUNCATE succeed.
  assert.fail(`TRUNCATE unexpectedly succeeded on ${table}`);
}

export async function proveExchangeRateConstraints(
  t: TestContext,
  fixture: ExchangeRateFixture,
  bookId: string
) {
  const { admin, peer, tenantId, noEntity, withoutBook } = fixture;
  const valid = firstRate(tenantId, bookId);

  await t.test(
    'a direct rate insert stamps storage time after acquiring the book lock',
    async () => {
      const rate = firstRate(tenantId, bookId, '2100-03-03');
      const { mark } = await withLockedBook(
        peer,
        admin,
        tenantId,
        bookId,
        () =>
          restricted(peer, tenantId, async tx => {
            await tx`insert into public.exchange_rates ${tx(rate)}`;
          }),
        1
      );
      const [stored] = await restricted(
        admin,
        tenantId,
        tx => tx<{ after_holder: boolean }[]>`
        select stored_at >= ${mark}::text::timestamptz as after_holder
        from public.exchange_rates where id = ${rate.id}`
      );
      assert.equal(stored?.after_holder, true, 'storage time follows the book release marker');
    }
  );

  await t.test('refuses direct UPDATE and DELETE on both populated tables', async () => {
    await runSequentially(tables, async table => {
      await runSequentially([`update ${table} set id = id`, `delete from ${table}`], statement =>
        assert.rejects(
          restricted(
            admin,
            tenantId,
            async tx => {
              await tx.unsafe(statement);
            },
            TEST_DB_ROLE
          ),
          { code: '23514', message: `${table} is append-only` }
        )
      );
    });
  });

  await t.test('append-only triggers refuse TRUNCATE on both populated tables', async () => {
    await runSequentially(tables, table =>
      assert.rejects(
        restricted(
          admin,
          tenantId,
          tx => attemptTruncate(tx, table),
          TEST_DB_ROLE,
          'read committed',
          {
            beforeRole: async tx => {
              // Foreign keys are checked before BEFORE TRUNCATE triggers. Rollback restores them.
              await tx`alter table public.membership_sales drop constraint membership_sales_rate_fk`;
              await tx`alter table public.exchange_rate_verifications
                drop constraint exchange_rate_verifications_exact_rate_fk`;
              await tx`alter table public.exchange_rates
              drop constraint exchange_rates_book_fk,
              drop constraint exchange_rates_correction_fk`;
            },
          }
        ),
        { code: '23514', message: `${table} is append-only` }
      )
    );
  });

  await t.test(
    'foreign keys refuse TRUNCATE on both rate tables and preserve their rows',
    async () => {
      await runSequentially(tables, async table => {
        const readIds = () =>
          restricted(
            admin,
            tenantId,
            async tx => [
              ...(await tx<{ id: string }[]>`select id from public.${tx(table)} order by id`),
            ],
            TEST_DB_ROLE
          );
        const before = await readIds();
        assert.ok(before.length > 0, `${table} must be populated before TRUNCATE`);
        await assert.rejects(
          restricted(admin, tenantId, tx => attemptTruncate(tx, table), TEST_DB_ROLE),
          {
            code: '0A000',
            message: 'cannot truncate a table referenced in a foreign key constraint',
          }
        );
        assert.deepEqual(
          await readIds(),
          before,
          `${table} rows must survive the refused TRUNCATE`
        );
      });
    }
  );

  await t.test(
    'append-only triggers refuse TRUNCATE CASCADE with foreign keys in place',
    async () => {
      const sale = await seedRateLinkedSale(fixture, bookId);
      const countRows = () => admin<
        {
          books: number;
          rates: number;
          sales: number;
          charges: number;
          verifications: number;
          linked_sale: boolean;
        }[]
      >`
      select
        (select count(*)::int from public.exchange_rate_books) as books,
        (select count(*)::int from public.exchange_rates) as rates,
        (select count(*)::int from public.membership_sales) as sales,
        (select count(*)::int from public.exchange_rate_verifications) as verifications,
        (select count(*)::int from public.membership_ledger_entries
          where sale_id = ${sale.id} and kind = 'charge') as charges,
        exists (select 1 from public.membership_sales
          where id = ${sale.id} and rate_id = ${sale.rate_id}) as linked_sale`;
      const [before] = await countRows();
      assert.ok(before.books > 0 && before.rates > 0, 'both rate tables must be populated');
      assert.equal(before.linked_sale, true, 'the sale must reference the fixture rate');
      assert.equal(before.charges, 1, 'the sale must have a posted charge');
      assert.equal(before.verifications, 1, 'the sale must have an exact-rate verification');

      await runSequentially(['exchange_rates', 'exchange_rate_books'] as const, async table => {
        // PostgreSQL fires the named table's BEFORE TRUNCATE trigger before the cascaded ones.
        await assert.rejects(
          restricted(admin, tenantId, tx => attemptTruncate(tx, table, 'cascade'), TEST_DB_ROLE),
          { code: '23514', message: `${table} is append-only` }
        );
        const [after] = await countRows();
        assert.deepEqual(after, before, `${table} TRUNCATE CASCADE must preserve row counts`);
      });
    }
  );

  await t.test(
    'rejects null book currencies and invalid direct rate values for the named invariant',
    async () => {
      await runSequentially(['base', 'quote'], async column => {
        const candidate = {
          id: randomUUID(),
          tenant_id: noEntity,
          base: 'EUR',
          quote: 'MKD',
          [column]: null,
        };
        await assert.rejects(
          restricted(admin, noEntity, async tx => {
            await tx`insert into exchange_rate_books ${tx(candidate)}`;
          }),
          { code: '23502', column_name: column }
        );
      });
      const { actor } = fixture;
      const cases: [Partial<typeof valid>, string, string][] = [
        [{ quote: 'USD' }, '23503', 'exchange_rates_book_fk'],
        ...['NaN', '0', '-1'].map((rate): [Partial<typeof valid>, string, string] => [
          { rate },
          '23514',
          'exchange_rates_positive_rate',
        ]),
        [{ week_starts_on: '2026-01-12' }, '23514', 'exchange_rates_week_starts_on_iso_monday'],
        [{ effective_on: 'infinity' }, '23514', 'exchange_rates_finite_effective_on'],
        [{ caller_kind: 'cron' }, '23514', 'exchange_rates_caller_kind_check'],
        [{ caller_kind: 'staff' }, '23514', 'exchange_rates_stored_by_check'],
        [{ stored_by: actor.id }, '23514', 'exchange_rates_stored_by_check'],
        [
          { caller_kind: 'staff', stored_by: withoutBook.id },
          '23503',
          'exchange_rates_stored_by_fk',
        ],
      ];
      await runSequentially(cases, ([changes, code, constraint_name]) =>
        assert.rejects(
          restricted(admin, tenantId, tx => insertRate(tx, { ...valid, ...changes })),
          { code, constraint_name }
        )
      );
      const [row] = await restricted(admin, tenantId, tx => insertRate(tx, valid));
      assert.equal(row.week_starts_on, '2026-01-05');
    }
  );
}
