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

test('Intent guard freezes ownership and sets evidence once while allowing worker progress', async t => {
  await withFixture(t, async ({ admin, a, b }) => {
    await restricted(admin, a, async tx => {
      const table = 'sponsor_handover_intents';
      const id = a[table];
      const frozen: Row = {
        id: uid(),
        tenant_id: b.tenant,
        user_id: a.staff,
        subscription_id: b.subscription,
        provider_subscription_id: uid(),
        created_at: LATER,
      };
      await serial(Object.entries(frozen), ([column, value]) =>
        rejected(
          tx,
          sp => update(sp, table, id, { [column]: value }),
          '23514',
          'set-once or terminal'
        )
      );
      const once: Row = {
        cancel_dispatched_at: START,
        dispatch_period_ends_at: MID,
        paid_until: MID,
        paid_until_evidence: uid(),
        canceled_confirmed_at: MID,
        reconciliation_closed_at: END,
        staff_disposition: 'renewing_as_member',
        staff_evidence_id: uid(),
        restoration_cutoff: END,
      };
      await update(tx, table, id, { ...once, state: 'closed_by_staff' });
      await update(tx, table, id, { ...once, state: 'closed_by_staff' });
      await serial(Object.keys(once), async column => {
        await rejected(
          tx,
          sp => update(sp, table, id, { [column]: null }),
          '23514',
          'set-once or terminal'
        );
        const value =
          column === 'staff_disposition'
            ? 'canceled'
            : column.endsWith('evidence') || column.endsWith('evidence_id')
              ? uid()
              : LATER;
        await rejected(
          tx,
          sp => update(sp, table, id, { [column]: value }),
          '23514',
          'set-once or terminal'
        );
      });
      await rejected(
        tx,
        sp => update(sp, table, id, { state: 'pending' }),
        '23514',
        'set-once or terminal'
      );
      await update(tx, table, id, {
        attempts: 1,
        next_attempt_at: MID,
        reconciled_through: MID,
        updated_at: MID,
      });
      await update(tx, table, id, {
        attempts: 2,
        next_attempt_at: END,
        reconciled_through: END,
        updated_at: END,
      });
    });
  });
});

test('Each terminal intent state is irreversible; pending worker transitions remain allowed', async t => {
  await withFixture(t, async ({ admin, a }) => {
    await restricted(admin, a, async tx => {
      const table = 'sponsor_handover_intents';
      await serial(['void', 'done', 'closed_by_staff'], state =>
        rollback(tx, async sp => {
          await update(
            sp,
            table,
            a[table],
            state === 'closed_by_staff'
              ? { state, staff_disposition: 'canceled', staff_evidence_id: uid() }
              : { state }
          );
          await rejected(
            sp,
            attempt => update(attempt, table, a[table], { state: 'pending' }),
            '23514',
            'set-once or terminal'
          );
        })
      );
      await update(tx, table, a[table], {
        state: 'cancel_scheduled',
        cancel_dispatched_at: START,
        dispatch_period_ends_at: MID,
      });
      await update(tx, table, a[table], { state: 'staff_review', attempts: 1 });
    });
  });
});
