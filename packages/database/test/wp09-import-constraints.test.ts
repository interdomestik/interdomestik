import test from 'node:test';

import { END, rejected, uid, type Row } from './sponsor-test-fixture';
import { freshList } from './wp09-import-actions.fixture';
import {
  asPrincipal,
  digest,
  insertRecord,
  ref,
  withWp09Fixture,
  writerOf,
  type Table,
} from './wp09-import.fixture';

type Violation = readonly [Table, Row, string, string];

test('WP-09 rejects invalid scopes, proof, raw personal data and replay claims', async t => {
  await withWp09Fixture(t, async ({ db, a, b, home, away }) => {
    const exit = home.sponsor_exit_events;
    const priorPaid = {
      origin: 'prior_paid_company',
      evidence_class: 'historical-payment',
      evidence_ref: ref('payment'),
      source_paid_through: '2041-01-01',
    };

    const cases: Violation[] = [
      [
        'membership_import_assignments',
        { source_key: 'broker' },
        '23514',
        'membership_import_assignments_scope_ck',
      ],
      [
        'membership_import_assignments',
        { capacity: 'admin' },
        '23514',
        'membership_import_assignments_scope_ck',
      ],
      [
        'membership_import_assignments',
        { staff_user_id: a.user },
        '23514',
        'membership_import_assignments_separation_ck',
      ],
      [
        'membership_import_assignments',
        { evidence_ref: 'Signed by Jane Doe' },
        '23514',
        'membership_import_assignments_evidence_ck',
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
        { term_id: a.sponsor_terms, signed_evidence_ref: 'contract-jane-doe.pdf' },
        '23514',
        'sponsor_contract_years_evidence_ck',
      ],
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
        {
          upload_key: 'raw-approver',
          digest: digest('raw-approver'),
          employer_approved_digest: digest('raw-approver'),
          employer_approver_ref: 'jane.doe@example.test',
        },
        '23514',
        'membership_import_lists_employer_approval_ck',
      ],
      [
        'membership_import_lists',
        {
          upload_key: 'raw-approval',
          digest: digest('raw-approval'),
          employer_approved_digest: digest('raw-approval'),
          employer_approval_ref: 'scan of the signed roster',
        },
        '23514',
        'membership_import_lists_employer_approval_ck',
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
        { email_alias_key: digest('facts'), review_facts: '{"name":"Jane Doe"}' },
        '23514',
        'membership_import_rows_review_ck',
      ],
      [
        'membership_import_rows',
        {
          email_alias_key: digest('pair'),
          stable_identity_namespace: 'national_id',
          stable_identity_key: digest('pair'),
        },
        '23514',
        'membership_import_rows_identity_ck',
      ],
      [
        'membership_import_rows',
        {
          ...priorPaid,
          email_alias_key: digest('origin'),
          member_user_id: null,
          member_verified_at: null,
        },
        '23503',
        'membership_import_rows_list_origin_fk',
      ],
      [
        'membership_import_rows',
        { ...priorPaid, email_alias_key: digest('raw proof'), evidence_ref: 'receipt, Jane Doe' },
        '23514',
        'membership_import_rows_proof_ck',
      ],
      [
        'membership_import_rows',
        { ...priorPaid, email_alias_key: digest('raw class'), evidence_class: 'Jane Doe' },
        '23514',
        'membership_import_rows_proof_ck',
      ],
      [
        'membership_import_rows',
        { email_alias_key: null, member_user_id: b.user },
        '23503',
        'membership_import_rows_member_fk',
      ],
      [
        'membership_import_rows',
        { member_user_id: null, member_verified_at: null },
        '23505',
        'membership_import_rows_active_alias_uq',
      ],
      [
        'membership_import_rows',
        { email_alias_key: digest('other') },
        '23505',
        'membership_import_rows_active_member_uq',
      ],
      [
        'membership_import_rows',
        {
          list_id: home.membership_import_lists.id,
          email_alias_key: digest('position'),
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
        { operation_id: 'raw-evidence', evidence_ref: 'letter from Jane Doe' },
        '23514',
        'sponsor_exit_events_evidence_ck',
      ],
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
        { obligation_key: 'raw-recipient', recipient_ref: 'jane.doe@example.test' },
        '23514',
        'membership_notice_obligations_evidence_ck',
      ],
      [
        'membership_notice_obligations',
        { obligation_key: 'second-individual-notice' },
        '23505',
        'membership_notice_obligations_individual_uq',
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
    for (const [table, patch, code, name] of cases) {
      await asPrincipal(db, writerOf(a, table), tx =>
        rejected(
          tx,
          async sp => {
            // A row case goes to a fresh pending list unless it names the fixture list.
            const fresh = freshList(home, 5);
            if (table === 'membership_import_rows' && !('list_id' in patch)) {
              await insertRecord(sp, 'membership_import_lists', fresh);
            }
            const target: Row = table === 'membership_import_rows' ? { list_id: fresh.id } : {};
            await insertRecord(sp, table, { ...home[table], ...target, ...patch, id: uid() });
          },
          code,
          name
        )
      );
    }
    // Only a fulfilled row carries a period reference, so the owner writes this case.
    await db.begin(tx =>
      rejected(
        tx,
        sp =>
          insertRecord(sp, 'membership_import_rows', {
            ...home.membership_import_rows,
            id: uid(),
            fulfillment_state: 'fulfilled',
            period_origin_ref: 'period of Jane Doe',
          }),
        '23514',
        'membership_import_rows_fulfillment_ck'
      )
    );
  });
});
