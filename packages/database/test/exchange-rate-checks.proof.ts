import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import type postgres from 'postgres';

import { withE2eRuntimeGrants } from './e2e-runtime-role.fixture';
import {
  firstRate,
  insertRate,
  provisionRateWindow,
  restricted,
  runSequentially,
  runtimeRole,
  type ExchangeRateFixture,
} from './exchange-rates.fixture';
import { quoteIdentifier, TEST_DB_ROLE } from './rls-test-connection';

export async function proveOfficialCheckConstraints(f: ExchangeRateFixture) {
  const { admin, peer, tenantId, actor, otherTenant } = f;
  const [{ day, version }] = await admin<{ day: string; version: string }[]>`
    select (clock_timestamp() at time zone 'Europe/Skopje')::date::text as day,
      current_setting('server_version_num') as version`;
  assert.equal(Math.floor(Number(version) / 10000), 16);
  const [{ id: entity }] =
    await admin`insert into legal_entities (id, tenant_id, legal_name, country_code)
    values (${randomUUID()}, ${tenantId}, 'Test check entity', 'MK') returning id`;
  await f.createEntity(admin, otherTenant);
  const [book] = await f.bookRows(tenantId);
  const [foreignBook] = await f.bookRows(otherTenant);
  const window = await provisionRateWindow(admin, tenantId, book.id, day);
  const foreignWindow = await provisionRateWindow(admin, otherTenant, foreignBook.id, day);
  await assert.rejects(provisionRateWindow(admin, tenantId, book.id, day), {
    code: '23P01',
    constraint_name: 'exchange_rate_check_windows_no_overlap',
  });
  await admin.unsafe(
    `grant select, update (id) on legal_entities to ${quoteIdentifier(runtimeRole)}`
  );
  const [rate] = await restricted(peer, tenantId, tx =>
    insertRate(tx, firstRate(tenantId, book.id, day))
  );
  const [foreign] = await restricted(peer, otherTenant, tx =>
    insertRate(tx, firstRate(otherTenant, foreignBook.id, day))
  );

  const newStart = () => ({
    id: randomUUID(),
    tenant_id: tenantId,
    book_id: book.id,
    legal_entity_id: entity,
    actor_id: actor.id,
    kind: 'start',
    operation_key: randomUUID(),
  });
  const start = (tx: postgres.TransactionSql, seed = newStart()) => tx`
    insert into exchange_rate_check_events ${tx(seed)}
    returning id, window_id, rate_id, start_order::int as start_order,
      occurred_at >= transaction_timestamp() and occurred_at <= clock_timestamp() as stamp`;
  const asTenant = <T>(run: (tx: postgres.TransactionSql) => Promise<T>) =>
    restricted(peer, tenantId, run);

  await assert.rejects(
    restricted(peer, tenantId, tx => start(tx), runtimeRole, 'repeatable read'),
    {
      code: '23514',
      constraint_name: 'exchange_rate_check_events_read_committed',
    }
  );
  await assert.rejects(
    restricted(peer, tenantId, tx => start(tx), runtimeRole, 'read committed', {
      homeTenant: otherTenant,
    }),
    { code: '42501' }
  );
  await assert.rejects(
    restricted(peer, undefined, tx => start(tx)),
    { code: '42501' }
  );
  const wrongWindow = { ...newStart(), window_id: foreignWindow };
  await assert.rejects(
    asTenant(tx => start(tx, wrongWindow)),
    {
      code: '23503',
      constraint_name: 'exchange_rate_check_events_window_fk',
    }
  );
  // Isolate the actual FK in a rolled-back scratch transaction. The insert guard would
  // reject this same foreign ID before PostgreSQL checks the constraint.
  await assert.rejects(
    restricted(
      peer,
      tenantId,
      async tx => {
        await tx`insert into exchange_rate_check_events ${tx({
          ...wrongWindow,
          occurred_at: new Date().toISOString(),
          start_order: 1,
        })}`;
        assert.fail('The window FK accepted a foreign window');
      },
      runtimeRole,
      'read committed',
      {
        beforeRole: async tx => {
          await tx`alter table exchange_rate_check_events disable trigger exchange_rate_check_events_insert_guard`;
        },
      }
    ),
    {
      code: '23503',
      constraint_name: 'exchange_rate_check_events_window_fk',
      table_name: 'exchange_rate_check_events',
    }
  );
  // Supply a valid but stale timestamp so the raw client can send it and the trigger must replace it.
  const injectedTimestamp = '2000-01-03T00:00:00Z';
  const injected = {
    ...newStart(),
    rate_id: foreign.id,
    window_id: window,
    occurred_at: injectedTimestamp,
    start_order: 999,
  };
  const [check] = await asTenant(tx => start(tx, injected));
  assert.deepEqual(check, {
    id: injected.id,
    window_id: window,
    rate_id: rate.id,
    start_order: 1,
    stamp: true,
  });
  await assert.rejects(
    asTenant(tx => start(tx)),
    { code: '23514', constraint_name: 'exchange_rate_check_pending' }
  );
  type VisibleRows = { windows: number; checks: number; rates: number };
  await runSequentially([undefined, otherTenant], async scope => {
    const rows: VisibleRows[] = await restricted(
      peer,
      scope,
      (tx): Promise<VisibleRows[]> => tx<VisibleRows[]>`
      select (select count(*)::int from exchange_rate_check_windows where id = ${window}) as windows,
        (select count(*)::int from exchange_rate_check_events where id = ${check.id}) as checks,
        (select count(*)::int from membership_sale_rate_at(${tenantId}, ${book.id})) as rates`
    );
    assert.deepEqual(rows[0], { windows: 0, checks: 0, rates: 0 });
  });

  const positive = {
    id: randomUUID(),
    tenant_id: tenantId,
    book_id: book.id,
    legal_entity_id: entity,
    rate_id: rate.id,
    base: 'EUR',
    quote: 'MKD',
    rate_effective_on: day,
    observed_rate: '61.50',
    operation_key: randomUUID(),
    source_ref: 'NBRM/contract',
    verified_by: actor.id,
    check_id: check.id,
    verified_at: injectedTimestamp,
  };
  const invalidVerifications = [
    [{ observed_rate: '61.52' }, 'exchange_rate_verifications_exact_rate_fk'],
    [{ rate_effective_on: '2000-01-01' }, 'exchange_rate_verifications_exact_rate_fk'],
    [{ verified_by: randomUUID() }, 'exchange_rate_verifications_check_fk'],
  ] as const;
  await runSequentially(invalidVerifications, ([change, constraint_name]) =>
    assert.rejects(
      asTenant(
        tx => tx`
      insert into exchange_rate_verifications ${tx({ ...positive, ...change })}`
      ),
      { code: '23503', constraint_name }
    )
  );
  const [verified] = await asTenant(
    tx => tx`
    insert into exchange_rate_verifications ${tx(positive)}
    returning verified_at >= transaction_timestamp() and verified_at <= clock_timestamp() as stamp`
  );
  assert.equal(verified.stamp, true);

  const negative = {
    id: randomUUID(),
    tenant_id: tenantId,
    book_id: book.id,
    legal_entity_id: entity,
    actor_id: actor.id,
    rate_id: rate.id,
    rate_effective_on: day,
    window_id: window,
    kind: 'inconclusive',
    reason: 'No bulletin',
    check_id: check.id,
    operation_key: randomUUID(),
  };
  await assert.rejects(
    asTenant(tx => tx`insert into exchange_rate_check_events ${tx(negative)}`),
    {
      code: '23505',
      constraint_name: 'exchange_rate_check_terminal_guard',
    }
  );
  const appendOnlyTables = ['exchange_rate_check_windows', 'exchange_rate_check_events'];
  await runSequentially(appendOnlyTables, async table => {
    const [posture] = await asTenant(
      tx => tx`
      select row_security_active(${table}) as rls,
        (select relforcerowsecurity from pg_class where oid = ${table}::regclass) as forced`
    );
    assert.deepEqual(posture, { rls: true, forced: true });
    await assert.rejects(
      asTenant(tx => tx.unsafe(`update ${table} set id = id`)),
      { code: '42501' }
    );
    await admin.unsafe(
      `grant update, delete, truncate on ${table} to ${quoteIdentifier(TEST_DB_ROLE)}`
    );
    await assert.rejects(
      restricted(peer, tenantId, tx => tx.unsafe(`delete from ${table}`), TEST_DB_ROLE),
      {
        code: '23514',
        message: `${table} is append-only`,
      }
    );
  });
  const insertWindow = (tx: postgres.TransactionSql) => tx`
    insert into exchange_rate_check_windows
      (id, tenant_id, book_id, effective_on, opens_at, deadline_at, approval_ref)
    values (${randomUUID()}, ${tenantId}, ${book.id}, ${day}::date + 1,
      (${day}::date + 1)::timestamp at time zone 'Europe/Skopje',
      (${day}::date + 2)::timestamp at time zone 'Europe/Skopje', 'finance/wp07-test')`;
  const noWindowInsert = {
    code: '42501',
    message: 'permission denied for table exchange_rate_check_windows',
  };
  await assert.rejects(asTenant(insertWindow), noWindowInsert);
  await withE2eRuntimeGrants(admin, async e2eRole => {
    const asE2eTenant = <T>(run: (tx: postgres.TransactionSql) => Promise<T>) =>
      restricted(admin, tenantId, run, e2eRole);
    await assert.rejects(asE2eTenant(insertWindow), noWindowInsert);
    await assert.rejects(
      asE2eTenant(tx => tx`delete from exchange_rate_verification_limits`),
      { code: '42501' }
    );
    const [counts] = await asE2eTenant(
      tx => tx`
      select (select count(*)::int from exchange_rate_check_windows) as windows,
        (select count(*)::int from exchange_rate_check_events) as events,
        (select count(*)::int from exchange_rate_verifications) as verifications`
    );
    assert.deepEqual(counts, { windows: 1, events: 1, verifications: 1 });
  });
}

export async function proveHeadQueryPlan(f: ExchangeRateFixture) {
  await f.createEntity(f.admin, f.tenantId);
  const [book] = await f.bookRows(f.tenantId);
  await restricted(
    f.peer,
    f.tenantId,
    tx => tx`
    insert into exchange_rates (id, tenant_id, book_id, base, quote, rate, effective_on, revision, source, caller_kind)
    select ${book.id} || ':' || day, ${f.tenantId}, ${book.id}, 'EUR', 'MKD', 61.50,
      '2020-01-01'::date + day, 1, 'nbrm', 'inngest'
    from generate_series(0, 3999) as dates(day)`
  );
  await f.admin`analyze public.exchange_rates`;
  const [{ statement }] = await f.admin<{ statement: string }[]>`
    select prosrc as statement from pg_proc
    where oid = 'public.exchange_rate_head_at(text,text,timestamptz)'::regprocedure`;
  await restricted(f.peer, f.tenantId, async tx => {
    // A function with a fixed search_path hides its internal plan behind Function Scan.
    const query = statement
      .replace(/\bp_tenant\b/gu, '$1')
      .replace(/\bp_book\b/gu, '$2')
      .replace(/\bp_at\b/gu, '$3');
    const plan = await tx.unsafe('explain (analyze, buffers, costs off) ' + query, [
      f.tenantId,
      book.id,
      '2027-01-02T05:00:00Z',
    ]);
    const rendered = plan.map(row => row['QUERY PLAN']).join('\n');
    assert.match(
      rendered,
      /Index Scan Backward using exchange_rates_tenant_book_date_revision_uq/u,
      rendered
    );
    assert.match(rendered, /Index Cond:.*tenant_id.*book_id.*effective_on/u, rendered);
    assert.doesNotMatch(rendered, /\bSort\b/u, rendered);
  });
}
