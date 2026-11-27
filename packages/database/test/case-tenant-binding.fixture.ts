import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import type postgres from 'postgres';

import { documentInput, past, type Case } from './claim-correspondence.fixture';

export const migrations = fileURLToPath(new URL('../drizzle', import.meta.url));

type Sql = postgres.Sql | postgres.TransactionSql;

export function childRows(claim: Case, documentId: string) {
  const base = { id: randomUUID(), tenant_id: claim.tenant, claim_id: claim.id };
  return {
    case_scoped_access_grants: {
      id: base.id,
      tenant_id: claim.tenant,
      case_id: claim.id,
      access_tenant_id: claim.tenant,
      actor_id: claim.user,
      document_classes: ['evidence'],
      created_by_id: claim.user,
      correlation_id: randomUUID(),
    },
    claim_document_ai_extraction_consents: {
      ...base,
      subject_id: claim.user,
      actor_id: claim.user,
      document_id: documentId,
      consent_type: 'ai_document_extraction',
      processing_purpose: 'ai_document_extraction',
      status: 'accepted',
      privacy_version: 'v1',
      locale: 'en',
      source_surface: 'member_portal',
    },
    claim_documents: documentInput(claim, base.id),
    claim_escalation_agreements: { ...base, accepted_by_id: claim.user, accepted_at: past },
    claim_information_requests: {
      ...base,
      correlation_id: randomUUID(),
      requested_information: 'Invoice',
      explanation_for_member: 'Confirm the repair cost',
      due_at: '2099-01-01T00:00:00Z',
      responsible_staff_id: claim.user,
      created_by_staff_id: claim.user,
      sla_posture: 'incomplete',
    },
    claim_messages: { ...base, sender_id: claim.user, content: 'Fixture message' },
    claim_recovery_no_fee_evidence: {
      ...base,
      reason_code: 'no_recovery',
      documented_by_id: claim.user,
    },
    claim_stage_history: { ...base, to_status: 'draft', changed_by_id: claim.user },
    claim_threads: { ...base, subject: 'Fixture thread', created_by: claim.user },
    claim_tracking_tokens: {
      ...base,
      token_hash: randomUUID(),
      expires_at: '2099-01-01T00:00:00Z',
    },
    claim_transition_evidence: {
      ...base,
      evidence_type: 'human_review',
      evidence_status: 'reviewed',
      recorded_by_id: claim.user,
      source_document_id: null as string | null,
    },
    support_handoffs: {
      ...base,
      claim_id: claim.id as string | null,
      member_id: claim.user,
      subject: 'Fixture handoff',
      message: 'Follow up on the invoice',
      urgency: 'standard',
      trust_risk: 'none',
    },
  };
}

type Children = ReturnType<typeof childRows>;
type Row = Children[keyof Children];
export type ChildTable = keyof Children;
export const homeKey = (table: ChildTable) => `${table}_case_home_fk`;
export const evidenceTables = [
  'claim_document_ai_extraction_consents',
  'claim_transition_evidence',
] as const;
export const documentKey = (table: (typeof evidenceTables)[number]) => `${table}_document_case_fk`;

export function insertChild(sql: Sql, table: ChildTable, row: Row) {
  return sql`insert into public.${sql(table)} ${sql(row)}`;
}

export async function storedChild(sql: Sql, table: ChildTable, id: string) {
  const [result] = await sql`
    select xmin::text as row_version, to_jsonb(child) as row
    from public.${sql(table)} child where id = ${id}`;
  return result;
}

export function withEvidenceDocument(claim: Case, documentId: string) {
  const rows = childRows(claim, documentId);
  rows.claim_transition_evidence.source_document_id = documentId;
  return rows;
}
