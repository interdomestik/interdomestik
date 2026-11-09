import assert from 'node:assert/strict';
import test from 'node:test';
import {
  END,
  insert,
  iso,
  LATER,
  MID,
  rejected,
  restricted,
  rollback,
  row,
  serial,
  START,
  uid,
  update,
  withFixture,
  type Row,
} from './sponsor-test-fixture';

test('Terms exclude overlaps and allow adjacent half-open windows', async t => {
  await withFixture(t, async ({ admin, a }) => {
    await restricted(admin, a, async tx => {
      await rejected(
        tx,
        sp =>
          insert(sp, 'sponsor_terms', {
            ...row(a, 'sponsor_terms', true),
            term_start: MID,
          }),
        '23P01',
        'sponsor_terms_no_overlap'
      );
      await insert(tx, 'sponsor_terms', row(a, 'sponsor_terms', true));
      const terms = await tx`select term_start, term_end from sponsor_terms
        where sponsor_id = ${a.sponsors} order by term_start`;
      assert.equal(terms.length, 2);
      assert.equal(iso(terms[0]?.term_end), iso(terms[1]?.term_start));
    });
  });
});

test('Every revision and decision column is immutable, including no-op UPDATE', async t => {
  await withFixture(t, async ({ admin, a }) => {
    await restricted(admin, a, async tx => {
      await serial(
        ['sponsor_term_revisions', 'sponsor_revision_decisions'] as const,
        async table => {
          const [original] = await tx`select * from ${tx(table)} where id = ${a[table]}`;
          assert.ok(original);
          await serial(Object.entries(original), async ([column, value]) => {
            const changed =
              value instanceof Date || /^\d{4}-\d\d-\d\d[ T]\d/.test(String(value))
                ? LATER
                : typeof value === 'number'
                  ? value + 1
                  : uid();
            await rejected(
              tx,
              sp => update(sp, table, a[table], { [column]: changed }),
              '23514',
              'rows are immutable'
            );
          });
          await rejected(
            tx,
            sp => update(sp, table, a[table], { id: a[table] }),
            '23514',
            'rows are immutable'
          );
        }
      );
    });
  });
});

test('Term guard freezes all other columns and permits exactly one complete termination', async t => {
  await withFixture(t, async ({ admin, a, b }) => {
    await restricted(admin, a, async tx => {
      const changes: Row = {
        id: uid(),
        tenant_id: b.tenant,
        sponsor_id: b.sponsors,
        term_start: MID,
        term_end: LATER,
        legal_entity_id: b.entity,
        plan_key: b.plan,
        plan_id: 'changed',
        created_by: a.staff,
        created_at: LATER,
      };
      await serial(Object.entries(changes), ([column, value]) =>
        rejected(
          tx,
          sp => update(sp, 'sponsor_terms', a.sponsor_terms, { [column]: value }),
          '23514',
          'only the termination columns'
        )
      );
      await rejected(
        tx,
        sp => update(sp, 'sponsor_terms', a.sponsor_terms, { terminated_effective_at: MID }),
        '23514',
        'sponsor_terms_termination_check'
      );
      await rejected(
        tx,
        sp =>
          update(sp, 'sponsor_terms', a.sponsor_terms, {
            terminated_effective_at: LATER,
            terminated_by: a.staff,
            terminated_at: START,
          }),
        '23514',
        'sponsor_terms_termination_check'
      );
      const termination: Row = {
        terminated_effective_at: MID,
        terminated_by: a.staff,
        terminated_at: START,
      };
      await update(tx, 'sponsor_terms', a.sponsor_terms, termination);
      await update(tx, 'sponsor_terms', a.sponsor_terms, termination);
      await serial(Object.keys(termination), async column => {
        await rejected(
          tx,
          sp => update(sp, 'sponsor_terms', a.sponsor_terms, { [column]: null }),
          '23514',
          'only the termination columns'
        );
        await rejected(
          tx,
          sp =>
            update(sp, 'sponsor_terms', a.sponsor_terms, {
              [column]: column === 'terminated_by' ? a.user : END,
            }),
          '23514',
          'only the termination columns'
        );
      });
    });
  });
});

test('Partial term/user key permits unbound rows, refuses duplicate binding, and permits renewal', async t => {
  await withFixture(t, async ({ admin, a }) => {
    await restricted(admin, a, async tx => {
      const first = row(a, 'sponsor_roster_entries', true);
      const second = row(a, 'sponsor_roster_entries', true);
      await insert(tx, 'sponsor_roster_entries', first);
      await insert(tx, 'sponsor_roster_entries', second);
      const unbound = await tx`select id from sponsor_roster_entries
        where term_id = ${a.sponsor_terms} and user_id is null`;
      assert.equal(unbound.length, 2);
      await rejected(
        tx,
        sp =>
          insert(sp, 'sponsor_roster_entries', {
            ...row(a, 'sponsor_roster_entries', true),
            user_id: a.user,
          }),
        '23505',
        'sponsor_roster_entries_term_user_uq'
      );
      await rejected(
        tx,
        sp => update(sp, 'sponsor_roster_entries', String(first.id), { user_id: a.user }),
        '23505',
        'sponsor_roster_entries_term_user_uq'
      );
      await update(tx, 'sponsor_roster_entries', String(first.id), { user_id: a.staff });
      await rejected(
        tx,
        sp => update(sp, 'sponsor_roster_entries', String(second.id), { user_id: a.staff }),
        '23505',
        'sponsor_roster_entries_term_user_uq'
      );
      await rollback(tx, async sp => {
        const renewal = row(a, 'sponsor_terms', true);
        await insert(sp, 'sponsor_terms', renewal);
        await insert(sp, 'sponsor_roster_entries', {
          ...row(a, 'sponsor_roster_entries', true),
          term_id: renewal.id,
          user_id: a.user,
        });
      });
    });
  });
});
