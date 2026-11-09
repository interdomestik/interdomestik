import test from 'node:test';
import {
  END,
  LATER,
  MID,
  rejected,
  restricted,
  rollback,
  serial,
  START,
  uid,
  update,
  withFixture,
  type Row,
} from './sponsor-test-fixture';

test('Attempt authorization snapshots are immutable and outcome resolves only once', async t => {
  await withFixture(t, async ({ admin, a, b }) => {
    await restricted(admin, a, async tx => {
      const table = 'sponsor_handover_cancel_attempts';
      const id = a[table];
      const frozen: Row = {
        id: uid(),
        tenant_id: b.tenant,
        intent_id: b.sponsor_handover_intents,
        attempt_no: 2,
        dispatched_at: LATER,
        authorizing_entry_id: b.sponsor_roster_entries,
        authorizing_term_id: b.sponsor_terms,
        authorizing_term_start: MID,
        authorizing_end: LATER,
        boundary_at: START,
      };
      await serial(Object.entries(frozen), ([column, value]) =>
        rejected(
          tx,
          sp => update(sp, table, id, { [column]: value }),
          '23514',
          'only one move from unknown'
        )
      );
      await serial(['scheduled', 'refused', 'moot'], outcome =>
        rollback(tx, async sp => {
          await update(sp, table, id, { outcome, evidence_ref: uid(), resolved_at: MID });
          await serial(
            Object.entries({ outcome: 'unknown', evidence_ref: uid(), resolved_at: END }),
            ([column, value]) =>
              rejected(
                sp,
                trial => update(trial, table, id, { [column]: value }),
                '23514',
                'only one move from unknown'
              )
          );
          await rejected(
            sp,
            trial => update(trial, table, id, { evidence_ref: null }),
            '23514',
            'only one move from unknown'
          );
          await rejected(
            sp,
            trial => update(trial, table, id, { resolved_at: null }),
            '23514',
            'only one move from unknown'
          );
          await rejected(
            sp,
            trial => update(trial, table, id, { outcome }),
            '23514',
            'only one move from unknown'
          );
        })
      );
    });
  });
});

test('Attempt evidence cannot be rewritten before resolving unknown (design §3.3)', async t => {
  await withFixture(t, async ({ admin, a }) => {
    await restricted(admin, a, async tx => {
      // A regression assertion, not an acceptance of the current guard's loophole.
      await rejected(
        tx,
        sp =>
          update(sp, 'sponsor_handover_cancel_attempts', a.sponsor_handover_cancel_attempts, {
            evidence_ref: uid(),
          }),
        '23514'
      );
    });
  });
});

test('Charge guard freezes each charge column and allows staff_task_id only once', async t => {
  await withFixture(t, async ({ admin, a, b }) => {
    await restricted(admin, a, async tx => {
      const table = 'sponsor_handover_charges';
      const id = a[table];
      const frozen: Row = {
        id: uid(),
        tenant_id: b.tenant,
        intent_id: b.sponsor_handover_intents,
        provider_transaction_id: uid(),
        billing_period_starts_at: END,
        found_at: LATER,
      };
      await serial(Object.entries(frozen), ([column, value]) =>
        rejected(tx, sp => update(sp, table, id, { [column]: value }), '23514', 'append-only')
      );
      const task = uid();
      await update(tx, table, id, { staff_task_id: task });
      await update(tx, table, id, { staff_task_id: task });
      await serial([uid(), null], staff_task_id =>
        rejected(tx, sp => update(sp, table, id, { staff_task_id }), '23514', 'append-only')
      );
    });
  });
});
