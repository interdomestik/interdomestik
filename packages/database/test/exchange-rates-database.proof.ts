import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import type { TestContext } from 'node:test';

import { sql } from 'drizzle-orm';

import {
  firstRate,
  insertRate,
  rateInput,
  restricted,
  runtimeRole,
  signal,
  tables,
  waitForLockWaiters,
  withLockedBook,
  type ExchangeRateFixture,
} from './exchange-rates.fixture';
import { quoteIdentifier, quoteSqlLiteral, TEST_DB_ROLE } from './rls-test-connection';

export async function proveExchangeRateDatabase(t: TestContext, fixture: ExchangeRateFixture) {
  const {
    admin,
    peer,
    port,
    withTenantAuthority,
    tenantId,
    otherTenant,
    noEntity,
    concurrentTenant,
    withoutBook,
    session,
    authority,
    publish,
    bookRows,
    createEntity,
  } = fixture;

  await t.test('forces RLS and backfills books for pre-existing entities', async () => {
    const rls = await admin`select relname, relrowsecurity, relforcerowsecurity from pg_class
      where oid in ('public.exchange_rate_books'::regclass, 'public.exchange_rates'::regclass)
      order by relname`;
    assert.deepEqual(
      [...rls],
      tables.map(relname => ({ relname, relrowsecurity: true, relforcerowsecurity: true }))
    );
    const existing = await admin`select e.tenant_id, count(distinct b.id)::int as books
      from legal_entities e left join exchange_rate_books b using (tenant_id) group by e.tenant_id`;
    assert.ok(
      existing.length > 0,
      'the journal must have provisioned entities before migration 0101'
    );
    for (const { books } of existing) assert.equal(books, 1);
    const [posture] = await withTenantAuthority(authority, tx =>
      tx.execute(sql`
      select current_user as role, rolsuper, rolbypassrls,
        row_security_active('public.exchange_rate_books') as books,
        row_security_active('public.exchange_rates') as rates
      from pg_roles where rolname = current_user`)
    );
    assert.deepEqual(posture, {
      role: runtimeRole,
      rolsuper: false,
      rolbypassrls: false,
      books: true,
      rates: true,
    });
  });

  await t.test(
    'refuses publication before the first entity and provisions one book afterwards',
    async () => {
      assert.equal((await bookRows(tenantId)).length, 0);
      const input = rateInput('2026-01-07');
      assert.deepEqual(await publish(input), { ok: false, code: 'not_found' });
      assert.deepEqual(
        await port.recordExchangeRate(
          session('tenant_admin', noEntity, noEntity, withoutBook.id),
          input,
          withoutBook
        ),
        { ok: false, code: 'not_found' }
      );
      assert.equal((await bookRows(noEntity)).length, 0);
      await createEntity(admin, tenantId);
      await createEntity(admin, otherTenant);
      assert.deepEqual(
        (await bookRows(tenantId)).map(({ base, quote }) => ({ base, quote })),
        [{ base: 'EUR', quote: 'MKD' }]
      );
    }
  );

  await t.test('concurrent legal-entity inserts create one book', async () => {
    const first = signal();
    const release = signal();
    let blocker = 0;
    const holding = peer.begin(async tx => {
      const [{ pid }] = await tx<{ pid: number }[]>`select pg_backend_pid() as pid`;
      blocker = pid;
      await createEntity(tx, concurrentTenant);
      first.resolve();
      await release.promise;
    });
    let second: Promise<unknown> | undefined;
    try {
      await Promise.race([first.promise, holding]);
      second = createEntity(peer, concurrentTenant).then(rows => rows);
      await Promise.race([
        waitForLockWaiters(admin, blocker, 1),
        second.then(() => assert.fail('The second entity did not contend for the tenant book')),
      ]);
      release.resolve();
      await Promise.all([holding, second]);
    } finally {
      release.resolve();
      await Promise.allSettled([holding, second]);
    }
    assert.equal((await bookRows(concurrentTenant)).length, 1);
    const [{ entities }] =
      await admin`select count(*)::int as entities from legal_entities where tenant_id = ${concurrentTenant}`;
    assert.equal(entities, 2);
  });

  const [book] = await bookRows(tenantId);
  const [otherBook] = await bookRows(otherTenant);
  assert.ok(book && otherBook);
  const valid = firstRate(tenantId, book.id);

  await t.test(
    'enforces tenant RLS on both tables with own, foreign, empty and absent context',
    async () => {
      const foreign = firstRate(otherTenant, otherBook.id);
      await restricted(admin, otherTenant, tx => insertRate(tx, foreign));
      const own = firstRate(tenantId, book.id, '2026-01-14');
      await restricted(admin, tenantId, tx => insertRate(tx, own));
      for (const [access, books, rates] of [
        [undefined, [], []],
        ['', [], []],
        [tenantId, [book.id], [own.id]],
        [otherTenant, [otherBook.id], [foreign.id]],
      ] as const) {
        assert.deepEqual(
          await restricted(access === undefined ? peer : admin, access, async tx => {
            const [{ tenant }] =
              await tx`select current_setting('app.current_access_tenant_id', true) as tenant`;
            return {
              tenant,
              books: (await tx`select id from exchange_rate_books`).map(row => row.id),
              rates: (await tx`select id from exchange_rates`).map(row => row.id),
            };
          }),
          { tenant: access ?? null, books, rates }
        );
      }
      await assert.rejects(
        restricted(admin, tenantId, async tx => {
          await tx`insert into exchange_rate_books values (${randomUUID()}, ${noEntity}, 'EUR', 'MKD')`;
        }),
        { code: '42501', message: /row-level security/u }
      );
      await assert.rejects(
        restricted(admin, tenantId, tx =>
          insertRate(tx, { ...foreign, id: randomUUID(), effective_on: '2026-01-28' })
        ),
        { code: '23503', constraint_name: 'exchange_rates_book_fk' }
      );
    }
  );

  await t.test(
    'rejects a foreign rate insert even when its parent book can be locked',
    async () => {
      const foreign = firstRate(otherTenant, otherBook.id, '2026-02-18');
      const role = quoteIdentifier(runtimeRole);
      const bookId = quoteSqlLiteral(foreign.book_id);
      // PostgreSQL applies both SELECT and UPDATE visibility policies to FOR UPDATE.
      await admin.begin(async tx => {
        await tx.unsafe(`create policy wp07_test_foreign_book_select on public.exchange_rate_books
        for select to ${role} using (id = ${bookId})`);
        await tx.unsafe(`create policy wp07_test_foreign_book_lock on public.exchange_rate_books
        for update to ${role} using (id = ${bookId}) with check (false)`);
      });
      try {
        await assert.rejects(
          restricted(admin, tenantId, async tx => {
            const parent = await tx`select id from public.exchange_rate_books
            where tenant_id = ${foreign.tenant_id} and id = ${foreign.book_id}
              and base = ${foreign.base} and quote = ${foreign.quote}
            for update`;
            assert.deepEqual([...parent], [{ id: foreign.book_id }]);

            await tx`insert into public.exchange_rates ${tx(foreign)}`;
          }),
          {
            code: '42501',
            message: 'new row violates row-level security policy for table "exchange_rates"',
          }
        );
      } finally {
        await admin.begin(async tx => {
          await tx`drop policy wp07_test_foreign_book_lock on public.exchange_rate_books`;
          await tx`drop policy wp07_test_foreign_book_select on public.exchange_rate_books`;
        });
      }
    }
  );

  await t.test(
    'a direct rate insert stamps storage time after acquiring the book lock',
    async () => {
      const rate = firstRate(tenantId, book.id, '2100-03-03');
      const { mark } = await withLockedBook(
        peer,
        admin,
        tenantId,
        book.id,
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
    for (const table of tables) {
      const truncate =
        table === 'exchange_rate_books' ? `truncate ${table}, exchange_rates` : `truncate ${table}`;
      for (const statement of [`update ${table} set id = id`, `delete from ${table}`, truncate]) {
        await assert.rejects(
          restricted(
            admin,
            tenantId,
            async tx => {
              await tx.unsafe(statement);
            },
            TEST_DB_ROLE
          ),
          { code: '23514', message: `${table} is append-only` }
        );
      }
    }
  });

  await t.test(
    'rejects null book currencies and invalid direct rate values for the named invariant',
    async () => {
      for (const column of ['base', 'quote']) {
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
      }
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
      for (const [changes, code, constraint_name] of cases) {
        await assert.rejects(
          restricted(admin, tenantId, tx => insertRate(tx, { ...valid, ...changes })),
          { code, constraint_name }
        );
      }
      const [row] = await restricted(admin, tenantId, tx => insertRate(tx, valid));
      assert.equal(row.week_starts_on, '2026-01-05');
    }
  );
}
