import assert from 'node:assert/strict';
import test from 'node:test';
import postgres from 'postgres';

import { insert, rejected, row, START, uid } from './sponsor-test-fixture';
import { insertCompleteList } from './wp09-import-actions.fixture';
import {
  adminOf,
  asPrincipal,
  insertRecord,
  staffOf,
  withWp09Fixture,
} from './wp09-import.fixture';

test('WP-09 years for the same signed agreement exclude overlap and allow adjacent windows', async t => {
  await withWp09Fixture(t, async ({ db, a, home }) => {
    const term = row(a, 'sponsor_terms', true);
    await insert(db, 'sponsor_terms', term);
    const year = {
      ...home.sponsor_contract_years,
      id: uid(),
      term_id: term.id,
      starts_on: '2041-01-01',
      ends_before: '2042-01-01',
      verified_at: START,
    };
    await asPrincipal(db, adminOf(a), async tx => {
      await rejected(
        tx,
        sp =>
          insertRecord(sp, 'sponsor_contract_years', {
            ...year,
            starts_on: '2040-12-31',
          }),
        '23P01',
        'sponsor_contract_years_agreement_window_excl'
      );
      await insertRecord(tx, 'sponsor_contract_years', year);
    });
  });
});

test('WP-09 concurrent reservations contend for the last annual slot', async t => {
  await withWp09Fixture(t, async ({ db, a, home }) => {
    // Two rows of one new pending list contend for the year's one remaining slot.
    const contenders = await asPrincipal(db, staffOf(a), async tx => {
      const { rows } = await insertCompleteList(tx, home, 2);
      return rows.map(entry => entry.id);
    });

    let ready = 0;
    let release = () => {};
    const bothStarted = new Promise<void>(resolve => {
      release = resolve;
    });
    const results = await Promise.allSettled(
      contenders.map(id =>
        asPrincipal(db, staffOf(a), async tx => {
          ready += 1;
          if (ready === contenders.length) release();
          await bothStarted;
          await insertRecord(tx, 'sponsor_contract_year_seats', {
            ...home.sponsor_contract_year_seats,
            id: uid(),
            import_row_id: id,
            slot: 1,
          });
        }).catch((error: unknown) => {
          release();
          throw error;
        })
      )
    );
    const refused = results.filter(result => result.status === 'rejected');
    assert.equal(refused.length, 1);
    const error: unknown = refused[0].reason;
    assert.ok(error instanceof postgres.PostgresError);
    assert.equal(error.code, '23505');
    assert.equal(error.constraint_name, 'sponsor_contract_year_seats_slot_uq');
    await asPrincipal(db, staffOf(a), async tx => {
      const occupied = await tx`select slot from sponsor_contract_year_seats order by slot`;
      assert.deepEqual([...occupied], [{ slot: 1 }, { slot: 2 }]);
    });
  });
});
