import assert from 'node:assert/strict';
import test from 'node:test';
import {
  END,
  insert,
  MID,
  rejected,
  restricted,
  rollback,
  row,
  serial,
  START,
  TABLES,
  uid,
  withFixture,
  type Row,
  type Scope,
  type Table,
} from './sponsor-test-fixture';

type Case = { table: Table; suffix: string; column: string; foreign: keyof Scope; patch?: Row };
const cases: Case[] = [
  { table: 'sponsors', suffix: 'branch', column: 'branch_id', foreign: 'branch' },
  { table: 'sponsors', suffix: 'source_lead', column: 'source_lead_id', foreign: 'lead' },
  { table: 'sponsors', suffix: 'created_by', column: 'created_by', foreign: 'user' },
  { table: 'sponsor_terms', suffix: 'sponsor', column: 'sponsor_id', foreign: 'sponsors' },
  { table: 'sponsor_terms', suffix: 'legal_entity', column: 'legal_entity_id', foreign: 'entity' },
  { table: 'sponsor_terms', suffix: 'plan', column: 'plan_key', foreign: 'plan' },
  { table: 'sponsor_terms', suffix: 'created_by', column: 'created_by', foreign: 'user' },
  {
    table: 'sponsor_terms',
    suffix: 'terminated_by',
    column: 'terminated_by',
    foreign: 'user',
    patch: { terminated_effective_at: END, terminated_at: START },
  },
  { table: 'sponsor_term_revisions', suffix: 'term', column: 'term_id', foreign: 'sponsor_terms' },
  { table: 'sponsor_term_revisions', suffix: 'created_by', column: 'created_by', foreign: 'user' },
  {
    table: 'sponsor_revision_decisions',
    suffix: 'revision',
    column: 'revision_id',
    foreign: 'pendingRevision',
  },
  {
    table: 'sponsor_revision_decisions',
    suffix: 'decided_by',
    column: 'decided_by',
    foreign: 'staff',
  },
  {
    table: 'sponsor_handover_intents',
    suffix: 'subscription',
    column: 'subscription_id',
    foreign: 'subscription',
  },
  {
    table: 'sponsor_handover_cancel_attempts',
    suffix: 'intent',
    column: 'intent_id',
    foreign: 'sponsor_handover_intents',
  },
  {
    table: 'sponsor_handover_charges',
    suffix: 'intent',
    column: 'intent_id',
    foreign: 'sponsor_handover_intents',
  },
  { table: 'sponsor_roster_entries', suffix: 'term', column: 'term_id', foreign: 'sponsor_terms' },
  { table: 'sponsor_roster_entries', suffix: 'user', column: 'user_id', foreign: 'user' },
  { table: 'sponsor_roster_entries', suffix: 'added_by', column: 'added_by', foreign: 'user' },
  {
    table: 'sponsor_roster_entries',
    suffix: 'intent',
    column: 'handover_intent_id',
    foreign: 'sponsor_handover_intents',
  },
  {
    table: 'sponsor_mail_outbox',
    suffix: 'entry',
    column: 'roster_entry_id',
    foreign: 'sponsor_roster_entries',
  },
  {
    table: 'sponsor_mail_outbox',
    suffix: 'intent',
    column: 'handover_intent_id',
    foreign: 'sponsor_handover_intents',
    patch: { roster_entry_id: null, kind: 'membership_end_offer' },
  },
];

test('Every migration-0099 composite FK rejects a foreign tenant with its own 23503', async t => {
  await withFixture(t, async ({ admin, a, b }) => {
    const catalog = await admin`select conname from pg_constraint c
      join pg_class r on r.oid = c.conrelid join pg_namespace n on n.oid = r.relnamespace
      where n.nspname = 'public' and r.relname in ${admin(TABLES)}
      and c.contype = 'f' and cardinality(c.conkey) > 1`;
    assert.deepEqual(
      catalog.map(c => c.conname).sort(),
      cases.map(c => `${c.table}_${c.suffix}_fk`).sort(),
      'Inventory must cover every composite FK'
    );
    await restricted(admin, a, async tx => {
      await serial(cases, async c => {
        const valid = { ...row(a, c.table, true), ...c.patch };
        if (c.suffix === 'terminated_by') valid.terminated_by = a.staff;
        if (c.table === 'sponsor_roster_entries' && c.suffix === 'user') valid.user_id = a.staff;
        if (
          c.suffix === 'intent' &&
          c.table !== 'sponsor_handover_charges' &&
          c.table !== 'sponsor_handover_cancel_attempts'
        ) {
          valid.user_id = a.user;
          valid.handover_intent_id = a.sponsor_handover_intents;
        }
        // Free the fixture's bound-user slot inside a rolled-back savepoint for positive controls.
        await rollback(tx, async sp => {
          if (c.table === 'sponsor_roster_entries' && valid.user_id === a.user) {
            valid.term_id = a.sponsor_terms;
            await sp`delete from sponsor_mail_outbox where roster_entry_id = ${a.sponsor_roster_entries}`;
            await sp`delete from sponsor_roster_entries where id = ${a.sponsor_roster_entries}`;
          }
          await rollback(sp, control => insert(control, c.table, valid));
          await rejected(
            sp,
            trial => insert(trial, c.table, { ...valid, [c.column]: b[c.foreign] }),
            '23503',
            `${c.table}_${c.suffix}_fk`
          );
        });
      });
    });
  });
});

test('Composite ownership tuples reject a different same-tenant user or lead branch', async t => {
  await withFixture(t, async ({ admin, a }) => {
    const otherBranch = uid();
    await insert(admin, 'branches', {
      id: otherBranch,
      tenant_id: a.tenant,
      name: 'Other test branch',
      slug: otherBranch,
    });
    await restricted(admin, a, async tx => {
      await rejected(
        tx,
        sp =>
          insert(sp, 'sponsors', {
            ...row(a, 'sponsors', true),
            branch_id: otherBranch,
          }),
        '23503',
        'sponsors_source_lead_fk'
      );
      await rejected(
        tx,
        sp =>
          insert(sp, 'sponsor_handover_intents', {
            ...row(a, 'sponsor_handover_intents', true),
            user_id: a.staff,
          }),
        '23503',
        'sponsor_handover_intents_subscription_fk'
      );
      await serial(['sponsor_roster_entries', 'sponsor_mail_outbox'] as const, async table => {
        await rejected(
          tx,
          sp =>
            insert(sp, table, {
              ...row(a, table, true),
              handover_intent_id: a.sponsor_handover_intents,
              user_id: a.staff,
              ...(table === 'sponsor_mail_outbox'
                ? { roster_entry_id: null, kind: 'membership_end_offer' }
                : {}),
            }),
          '23503',
          `${table}_intent_fk`
        );
      });
      // Snapshot entry/term IDs on attempts deliberately have no FK (design §3.3).
      await rollback(tx, sp =>
        insert(sp, 'sponsor_handover_cancel_attempts', {
          ...row(a, 'sponsor_handover_cancel_attempts', true),
          authorizing_entry_id: 'retained-snapshot',
          authorizing_term_id: 'retained-snapshot',
          boundary_at: MID,
        })
      );
    });
  });
});
