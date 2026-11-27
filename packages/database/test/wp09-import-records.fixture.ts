import { createHash, randomUUID } from 'node:crypto';

import { END, MID, START, uid, type Row, type Scope } from './sponsor-seed.test-support';

export const tables = [
  'membership_import_assignments',
  'sponsor_contract_years',
  'membership_import_lists',
  'membership_import_rows',
  'sponsor_contract_year_seats',
  'sponsor_exit_events',
  'membership_notice_obligations',
  'membership_opt_out_tokens',
] as const;
export type Table = (typeof tables)[number];
export type Records = Record<Table, Row & { id: string }>;

export function digest(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

/** An opaque protected reference: a kind prefix and a UUID, never content. */
export function ref(kind: string): string {
  return `${kind}:${randomUUID()}`;
}

export function records(scope: Scope): Records {
  const ids = Object.fromEntries(tables.map(table => [table, uid()]));
  const tenant = { tenant_id: scope.tenant, legal_entity_id: scope.entity };
  const company = { ...tenant, contract_year_id: ids.sponsor_contract_years };
  const roster = {
    ...company,
    import_row_id: ids.membership_import_rows,
    seat_id: ids.sponsor_contract_year_seats,
  };
  const listDigest = digest(ids.membership_import_lists);

  return {
    membership_import_assignments: {
      ...tenant,
      id: ids.membership_import_assignments,
      staff_user_id: scope.staff,
      capacity: 'import',
      sponsor_id: scope.sponsors,
      approved_by: scope.user,
      evidence_ref: ref('assignment'),
      valid_from: '2000-01-01T00:00:00Z',
      valid_until: END,
    },
    sponsor_contract_years: {
      ...tenant,
      id: ids.sponsor_contract_years,
      sponsor_id: scope.sponsors,
      term_id: scope.sponsor_terms,
      agreement_key: 'fixture-agreement',
      starts_on: '2040-01-01',
      ends_before: '2041-01-01',
      fee_model: 'fixed_fee',
      fee_minor: 100000,
      currency: 'EUR',
      signed_ceiling: 500,
      current_limit: 10,
      signed_evidence_ref: ref('agreement'),
      verified_by: scope.user,
      verified_at: START,
    },
    membership_import_lists: {
      ...company,
      id: ids.membership_import_lists,
      origin: 'new_company',
      sponsor_id: scope.sponsors,
      term_id: scope.sponsor_terms,
      commercial_revision: 1,
      upload_key: 'fixture-upload',
      upload_position: 1,
      upload_list_count: 1,
      upload_fingerprint: digest('fixture-upload'),
      template_version: 'fixture-template',
      canonicalization_version: 'fixture-canonicalization',
      digest: listDigest,
      row_count: 1,
      submitted_by: scope.staff,
      submitted_at: START,
      verified_by: scope.staff,
      verified_at: START,
      employer_approver_ref: ref('signatory'),
      employer_approved_at: START,
      employer_approval_ref: ref('roster_approval'),
      employer_approved_digest: listDigest,
    },
    membership_import_rows: {
      ...company,
      id: ids.membership_import_rows,
      list_id: ids.membership_import_lists,
      origin: 'new_company',
      source_row: 1,
      email_alias_key: digest('fixture-alias'),
      member_user_id: scope.user,
      member_verified_at: START,
    },
    sponsor_contract_year_seats: {
      ...company,
      id: ids.sponsor_contract_year_seats,
      import_row_id: ids.membership_import_rows,
      slot: 2,
      year_current_limit: 10,
    },
    sponsor_exit_events: {
      ...company,
      id: ids.sponsor_exit_events,
      agreement_key: 'fixture-agreement',
      operation_id: 'fixture-exit-operation',
      kind: 'employee_departure',
      employee_seat_id: ids.sponsor_contract_year_seats,
      recorded_by: scope.user,
      effective_at: MID,
      evidence_ref: ref('exit'),
    },
    membership_notice_obligations: {
      ...roster,
      id: ids.membership_notice_obligations,
      purpose: 'individual_notice',
      obligation_key: 'fixture-individual-notice',
      recipient_ref: ref('recipient'),
    },
    membership_opt_out_tokens: {
      ...company,
      id: ids.membership_opt_out_tokens,
      seat_id: ids.sponsor_contract_year_seats,
      notice_id: ids.membership_notice_obligations,
      format_version: 1,
      derivation_version: 1,
      token_hash: digest(ids.membership_opt_out_tokens),
      issued_by: scope.user,
    },
  };
}
