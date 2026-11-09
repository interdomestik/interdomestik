import assert from 'node:assert/strict';
import test from 'node:test';
import {
  END,
  insert,
  LATER,
  MID,
  rejected,
  restricted,
  row,
  serial,
  START,
  uid,
  update,
  withFixture,
  type Row,
} from './sponsor-test-fixture';

test('Roster guard freezes identity, sets binding/evidence once and allows only one-way erasure', async t => {
  await withFixture(t, async ({ admin, a, b }) => {
    await restricted(admin, a, async tx => {
      const table = 'sponsor_roster_entries';
      const id = a[table];
      const frozen: Row = {
        id: uid(),
        tenant_id: b.tenant,
        term_id: b.sponsor_terms,
        added_by: a.staff,
        added_at: LATER,
      };
      await serial(Object.entries(frozen), ([column, value]) =>
        rejected(
          tx,
          sp => update(sp, table, id, { [column]: value }),
          '23514',
          'immutable, set-once or erased'
        )
      );
      // The seeded row is bound; a fresh row proves NULL -> user binding is permitted.
      const unbound = row(a, table, true);
      await insert(tx, table, unbound);
      await update(tx, table, String(unbound.id), { user_id: a.staff });
      const once: Row = {
        user_id: a.user,
        conflict_decision: 'accepted',
        conflict_decided_at: START,
        starts_at: MID,
        handover_intent_id: a.sponsor_handover_intents,
        revoked_at: END,
        revoked_reason: 'staff',
        left_company_at: MID,
        opted_out_at: MID,
      };
      await update(tx, table, id, once);
      await update(tx, table, id, once);
      await serial(Object.keys(once), async column => {
        await rejected(
          tx,
          sp => update(sp, table, id, { [column]: null }),
          '23514',
          'immutable, set-once or erased'
        );
        const value = column.endsWith('_at') ? LATER : uid();
        await rejected(
          tx,
          sp => update(sp, table, id, { [column]: value }),
          '23514',
          'immutable, set-once or erased'
        );
      });
      const erasures = [
        'first_name',
        'last_name',
        'email_normalized',
        'email_hmac',
        'optout_token_hash',
      ];
      await serial(erasures, async column => {
        await rejected(
          tx,
          sp => update(sp, table, id, { [column]: uid() }),
          '23514',
          'immutable, set-once or erased'
        );
        await update(tx, table, id, { [column]: null });
        await update(tx, table, id, { [column]: null });
        await rejected(
          tx,
          sp => update(sp, table, id, { [column]: uid() }),
          '23514',
          'immutable, set-once or erased'
        );
      });
      await update(tx, table, String(unbound.id), { email_hmac: null });
      const erased = await tx`select id from sponsor_roster_entries
        where term_id = ${a.sponsor_terms} and email_hmac is null`;
      assert.equal(erased.length, 2, 'NULL retention hashes do not collide');
      await update(tx, table, id, { outcome: 'staff_review', review_reason: 'binding' });
      await update(tx, table, id, { outcome: 'seated', review_reason: null });
    });
  });
});
