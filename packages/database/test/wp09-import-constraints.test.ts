import assert from 'node:assert/strict';
import test from 'node:test';

import { END, rejected, uid, type Row } from './sponsor-test-fixture';
import {
  adminOf,
  asPrincipal,
  digest,
  insertRecord,
  withWp09Fixture,
  type Table,
} from './wp09-import.fixture';

type Violation = readonly [Table, Row, string, string];

test('WP-09 rejects invalid scopes, proof and replay claims for all eight tables', async t => {
  await withWp09Fixture(t, async ({ db, a, b, home, away }) => {
    const exit = home.sponsor_exit_events;

    const cases: Violation[] = [
      [
        'membership_import_assignments',
        { source_key: 'broker' },
        '23514',
        'membership_import_assignments_scope_ck',
      ],
      [
        'membership_import_assignments',
        { valid_from: END },
        '23514',
        'membership_import_assignments_validity_ck',
      ],
      [
        'membership_import_assignments',
        { staff_user_id: b.staff },
        '23503',
        'membership_import_assignments_staff_fk',
      ],
      ['sponsor_contract_years', { current_limit: 0 }, '23514', 'sponsor_contract_years_limit_ck'],
      [
        'sponsor_contract_years',
        { current_limit: 4, signed_ceiling: 3 },
        '23514',
        'sponsor_contract_years_limit_ck',
      ],
      [
        'sponsor_contract_years',
        { current_limit: 500, signed_ceiling: 501 },
        '23514',
        'sponsor_contract_years_limit_ck',
      ],
      [
        'sponsor_contract_years',
        { term_id: b.sponsor_terms, agreement_key: 'foreign-agreement' },
        '23503',
        'sponsor_contract_years_term_fk',
      ],
      [
        'membership_import_lists',
        { upload_key: 'duplicate-digest' },
        '23505',
        'membership_import_lists_digest_uq',
      ],
      [
        'membership_import_lists',
        { employer_approved_digest: digest('wrong version') },
        '23514',
        'membership_import_lists_employer_approval_ck',
      ],
      [
        'membership_import_lists',
        {
          contract_year_id: away.sponsor_contract_years.id,
          upload_key: 'foreign-year',
          digest: digest('foreign-year'),
          employer_approved_digest: digest('foreign-year'),
        },
        '23503',
        'membership_import_lists_company_year_fk',
      ],
      [
        'membership_import_rows',
        {
          source_row: 2,
          stable_identity_namespace: 'other',
          email_alias_key: null,
          member_user_id: b.user,
        },
        '23503',
        'membership_import_rows_member_fk',
      ],
      [
        'membership_import_rows',
        { source_row: 2, email_alias_key: null, member_user_id: null, member_verified_at: null },
        '23505',
        'membership_import_rows_active_stable_uq',
      ],
      [
        'membership_import_rows',
        {
          source_row: 2,
          stable_identity_key: digest('other'),
          member_user_id: null,
          member_verified_at: null,
        },
        '23505',
        'membership_import_rows_active_alias_uq',
      ],
      [
        'membership_import_rows',
        { source_row: 2, stable_identity_key: digest('other'), email_alias_key: null },
        '23505',
        'membership_import_rows_active_member_uq',
      ],
      [
        'membership_import_rows',
        {
          stable_identity_key: digest('other'),
          email_alias_key: null,
          member_user_id: null,
          member_verified_at: null,
        },
        '23505',
        'membership_import_rows_position_uq',
      ],
      ['sponsor_contract_year_seats', { slot: 3 }, '23514', 'sponsor_contract_year_seats_slot_ck'],
      ['sponsor_contract_year_seats', { slot: 1 }, '23505', 'sponsor_contract_year_seats_row_uq'],
      ['sponsor_exit_events', {}, '23505', 'sponsor_exit_events_operation_uq'],
      [
        'sponsor_exit_events',
        { operation_id: 'new-id', employee_seat_id: away.sponsor_contract_year_seats.id },
        '23503',
        'sponsor_exit_events_employee_seat_fk',
      ],
      [
        'membership_notice_obligations',
        { recipient_ref: '\t' },
        '23514',
        'membership_notice_obligations_evidence_ck',
      ],
      [
        'membership_notice_obligations',
        { obligation_key: 'different-key', purpose: 'employer_exit' },
        '23514',
        'membership_notice_obligations_shape_ck',
      ],
      [
        'membership_notice_obligations',
        {
          obligation_key: 'wrong-exit',
          purpose: 'employer_exit',
          exit_event_id: exit.id,
          exit_kind: 'agreement_termination',
        },
        '23503',
        'membership_notice_obligations_exit_fk',
      ],
      [
        'membership_opt_out_tokens',
        { token_hash: 'raw-bearer' },
        '23514',
        'membership_opt_out_tokens_hash_ck',
      ],
      [
        'membership_opt_out_tokens',
        { notice_id: away.membership_notice_obligations.id, token_hash: digest('unlinked') },
        '23503',
        'membership_opt_out_tokens_notice_fk',
      ],
    ];
    await asPrincipal(db, adminOf(a), async tx => {
      for (const [table, patch, code, name] of cases) {
        await rejected(
          tx,
          sp => insertRecord(sp, table, { ...home[table], ...patch, id: uid() }),
          code,
          name
        );
      }
    });
  });
});
