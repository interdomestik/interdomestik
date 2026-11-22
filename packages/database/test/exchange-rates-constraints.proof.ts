import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import type { TestContext } from 'node:test';

import { withLockedBook } from './exchange-rates-lock.fixture';
import {
  firstRate,
  insertRate,
  restricted,
  runSequentially,
  tables,
  type ExchangeRateFixture,
} from './exchange-rates.fixture';
import { TEST_DB_ROLE } from './rls-test-connection';

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
        select stored_at >= ${mark}::timestamptz as after_holder
        from public.exchange_rates where id = ${rate.id}`
      );
      assert.equal(stored?.after_holder, true, 'storage time follows the book release marker');
    }
  );

  await t.test('refuses direct UPDATE, DELETE and TRUNCATE on both populated tables', async () => {
    await runSequentially(tables, async table => {
      const truncate =
        table === 'exchange_rate_books' ? `truncate ${table}, exchange_rates` : `truncate ${table}`;
      await runSequentially(
        [`update ${table} set id = id`, `delete from ${table}`, truncate],
        statement =>
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
