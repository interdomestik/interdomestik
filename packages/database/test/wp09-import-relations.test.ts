import assert from 'node:assert/strict';
import test from 'node:test';
import postgres from 'postgres';

import { END, insert, rejected, row, START, uid, type Tx } from './sponsor-test-fixture';
import { adminOf, asPrincipal, digest, insertRecord, withWp09Fixture } from './wp09-import.fixture';

test('WP-09 binds replay sets, prior-paid evidence, seats, exit notices and token hashes', async t => {
  await withWp09Fixture(t, async ({ db, a, b, home, away }) => {
    const list = home.membership_import_lists;
    const entry = home.membership_import_rows;
    const seat = home.sponsor_contract_year_seats;
    const year = home.sponsor_contract_years;
    const exit = home.sponsor_exit_events;
    const notice = home.membership_notice_obligations;

    await asPrincipal(db, adminOf(a), async tx => {
      const prior = {
        ...list,
        id: uid(),
        origin: 'prior_paid_company',
        upload_key: 'prior',
        upload_list_count: 2,
        digest: digest('prior'),
        employer_approved_digest: null,
        employer_approver_ref: null,
        employer_approval_ref: null,
        employer_approved_at: null,
      };
      await insertRecord(tx, 'membership_import_lists', prior);
      const second = { ...prior, id: uid(), upload_position: 2, digest: digest('second') };
      await rejected(
        tx,
        sp =>
          insertRecord(sp, 'membership_import_lists', {
            ...second,
            upload_fingerprint: digest('changed ordered set'),
          }),
        '23503',
        'membership_import_lists_upload_claim_fk'
      );
      await rejected(
        tx,
        sp =>
          insertRecord(sp, 'membership_import_lists', {
            ...second,
            upload_position: 1,
            upload_fingerprint: digest('changed ordered set'),
          }),
        '23505',
        'membership_import_lists_position_uq'
      );
      await insertRecord(tx, 'membership_import_lists', second);
      const priorEntry = {
        ...entry,
        id: uid(),
        list_id: prior.id,
        origin: prior.origin,
        stable_identity_key: digest('prior identity'),
        email_alias_key: null,
        member_user_id: null,
        member_verified_at: null,
      };
      await rejected(
        tx,
        sp => insertRecord(sp, 'membership_import_rows', priorEntry),
        '23514',
        'membership_import_rows_proof_ck'
      );
      const paid = {
        ...priorEntry,
        evidence_class: 'historical-payment',
        evidence_ref: 'fixture-paid-proof',
      };
      await rejected(
        tx,
        sp =>
          insertRecord(sp, 'membership_import_rows', { ...paid, source_paid_through: 'infinity' }),
        '23514',
        'membership_import_rows_proof_ck'
      );
      await insertRecord(tx, 'membership_import_rows', {
        ...paid,
        source_paid_through: '2041-01-01',
      });
      await rejected(
        tx,
        sp =>
          insertRecord(sp, 'sponsor_contract_year_seats', {
            ...seat,
            id: uid(),
            import_row_id: priorEntry.id,
          }),
        '23505',
        'sponsor_contract_year_seats_slot_uq'
      );
      await rejected(
        tx,
        sp =>
          insertRecord(sp, 'sponsor_contract_year_seats', {
            ...seat,
            id: uid(),
            slot: 1,
            import_row_id: priorEntry.id,
            year_current_limit: 3,
          }),
        '23503',
        'sponsor_contract_year_seats_limit_fk'
      );
      const secondSeat = { ...seat, id: uid(), slot: 1, import_row_id: priorEntry.id };
      await insertRecord(tx, 'sponsor_contract_year_seats', secondSeat);
      const exitNotice = {
        ...notice,
        id: uid(),
        obligation_key: 'fixture-departure-notice',
        purpose: 'employer_exit',
        exit_event_id: exit.id,
        exit_kind: exit.kind,
        employee_exit_seat_id: seat.id,
        verified_paid_end: END,
      };
      await rejected(
        tx,
        sp =>
          insertRecord(sp, 'membership_notice_obligations', {
            ...exitNotice,
            seat_id: secondSeat.id,
            employee_exit_seat_id: secondSeat.id,
            import_row_id: priorEntry.id,
          }),
        '23503',
        'membership_notice_obligations_exit_employee_fk'
      );
      await insertRecord(tx, 'membership_notice_obligations', exitNotice);
      await rejected(
        tx,
        sp =>
          insertRecord(sp, 'membership_opt_out_tokens', {
            ...home.membership_opt_out_tokens,
            id: uid(),
            notice_id: exitNotice.id,
            token_hash: digest('wrong purpose'),
          }),
        '23503',
        'membership_opt_out_tokens_notice_fk'
      );

      const foreign = await tx`update sponsor_contract_years set current_limit = 500
        where id = ${away.sponsor_contract_years.id} returning id`;
      assert.equal(foreign.length, 0);
      await proveLimitChanges(tx, year.id, seat.id);
    });

    await asPrincipal(db, adminOf(b), async tx => {
      const newNotice = {
        ...away.membership_notice_obligations,
        id: uid(),
        obligation_key: 'another-notice',
      };
      await insertRecord(tx, 'membership_notice_obligations', newNotice);
      await rejected(
        tx,
        sp =>
          insertRecord(sp, 'membership_opt_out_tokens', {
            ...away.membership_opt_out_tokens,
            id: uid(),
            notice_id: newNotice.id,
            token_hash: home.membership_opt_out_tokens.token_hash,
          }),
        '23505',
        'membership_opt_out_tokens_format_hash_uq'
      );
    });
  });
});

async function proveLimitChanges(tx: Tx, yearId: string, seatId: string) {
  const change = (scope: Tx, limit: number) => scope`update sponsor_contract_years
    set current_limit = ${limit} where id = ${yearId} returning current_limit`;
  await rejected(tx, sp => change(sp, 1), '23514', 'sponsor_contract_year_seats_slot_ck');
  const [before] = await tx`select current_limit from sponsor_contract_years where id = ${yearId}`;
  assert.equal(before.current_limit, 2);
  assert.deepEqual([...(await change(tx, 500))], [{ current_limit: 500 }]);
  const [seat] =
    await tx`select slot, year_current_limit from sponsor_contract_year_seats where id = ${seatId}`;
  assert.deepEqual(seat, { slot: 2, year_current_limit: 500 });
}

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
    const contenders = [uid(), uid()];
    await asPrincipal(db, adminOf(a), async tx => {
      for (const [index, id] of contenders.entries()) {
        await insertRecord(tx, 'membership_import_rows', {
          ...home.membership_import_rows,
          id,
          source_row: index + 2,
          stable_identity_key: digest(id),
          email_alias_key: null,
          member_user_id: null,
          member_verified_at: null,
        });
      }
    });

    let ready = 0;
    let release = () => {};
    const bothStarted = new Promise<void>(resolve => {
      release = resolve;
    });
    const results = await Promise.allSettled(
      contenders.map(id =>
        asPrincipal(db, adminOf(a), async tx => {
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
    await asPrincipal(db, adminOf(a), async tx => {
      const occupied = await tx`select slot from sponsor_contract_year_seats order by slot`;
      assert.deepEqual([...occupied], [{ slot: 1 }, { slot: 2 }]);
    });
  });
});
