import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import type postgres from 'postgres';
import type { PublicInformationRequest } from '@interdomestik/domain-claims';

export function assertOpenRequestProjection(
  visible: PublicInformationRequest[],
  dueAt: string
): void {
  assert.equal(visible.length, 1);
  assert.deepEqual(
    Object.keys(visible[0]).sort((a, b) => a.localeCompare(b)),
    [
      'createdAt',
      'dueAt',
      'evidence',
      'explanationForMember',
      'fulfilledAt',
      'fulfilledDocumentId',
      'progress',
      'requestedInformation',
      'requestId',
      'slaPosture',
      'status',
    ]
  );
  assert.equal(visible[0].slaPosture, 'incomplete');
  assert.equal(visible[0].dueAt, dueAt);
  assert.deepEqual(visible[0].evidence, []);
  assert.equal(visible[0].progress, 'awaiting_evidence');
  assert.equal(visible[0].fulfilledAt, null);
  assert.equal(visible[0].fulfilledDocumentId, null);
}

type ProofContext = {
  admin: postgres.Sql;
  rls: postgres.Sql;
  actor: (
    id: string,
    role?: string,
    tenantId?: string
  ) => {
    user: { id: string; role: string; tenantId: string };
  };
  before: unknown;
  claimId: string;
  documentId: string;
  fulfilInput: { claimId: string; requestId: string; documentId: string; reviewed: boolean };
  member: string;
  otherStaff: string;
  requestId: string;
  staff: string;
};

export async function assertFulfilmentAndEvidenceBoundary({
  admin,
  rls,
  actor,
  before,
  claimId,
  documentId,
  fulfilInput,
  member,
  otherStaff,
  requestId,
  staff,
}: ProofContext): Promise<void> {
  const { getInformationRequests } =
    await import('../../domain-claims/src/claims/information-requests');
  const { acknowledgeInformationRequestEvidence } =
    await import('../../domain-claims/src/claims/information-request-evidence');
  const { fulfilInformationRequest } =
    await import('../../domain-claims/src/claims/fulfil-information-request');
  const { persistClaimDocumentMetadata } =
    await import('../../../apps/web/src/features/claims/upload/server/claim-document-write');
  for (const denied of [
    actor(otherStaff),
    actor(member, 'member'),
    actor(staff, 'branch_manager'),
    actor(staff, 'staff', 'tenant_mk'),
  ]) {
    assert.deepEqual(await fulfilInformationRequest(denied, { ...fulfilInput, documentId }), {
      success: false,
      error: 'access_denied',
    });
  }
  assert.deepEqual(
    await fulfilInformationRequest(actor(staff), { ...fulfilInput, documentId, reviewed: false }),
    { success: false, error: 'invalid_input' }
  );
  assert.deepEqual(
    await fulfilInformationRequest(actor(staff), fulfilInput),
    { success: false, error: 'conflict' },
    'an unrelated document cannot fulfil the request'
  );
  await assert.rejects(
    admin`update claim_information_requests
        set status = 'fulfilled', fulfilled_at = now(), fulfilled_by_staff_id = ${staff}, fulfilled_document_id = ${fulfilInput.documentId}
        where id = ${requestId}`,
    /foreign key constraint/,
    'direct writes cannot attach an unrelated document to a fulfilled request'
  );
  const [fulfilled, repeated] = await Promise.all([
    fulfilInformationRequest(actor(staff), { ...fulfilInput, documentId }),
    fulfilInformationRequest(actor(staff), { ...fulfilInput, documentId }),
  ]);
  assert.equal(fulfilled.success, true);
  assert.deepEqual(repeated, fulfilled, 'concurrent retry returns the first durable result');
  assert.deepEqual(
    await fulfilInformationRequest(actor(staff), fulfilInput),
    { success: false, error: 'conflict' },
    'a different document cannot overwrite fulfilment'
  );
  const fulfilledView = await getInformationRequests(actor(member, 'member'), claimId);
  assert.equal(fulfilledView[0]?.status, 'fulfilled');
  assert.equal(fulfilledView[0]?.fulfilledDocumentId, documentId);
  assert.equal(fulfilledView[0]?.fulfilledAt, fulfilled.success ? fulfilled.fulfilledAt : null);
  assert.equal(fulfilledView[0]?.progress, 'acknowledged');
  assert.equal(
    (
      await admin`select id from audit_log where action = 'claim_information_request.fulfilled' and entity_id = ${requestId}`
    ).length,
    1,
    'concurrent fulfilment writes one audit event'
  );
  await assert.rejects(
    admin`delete from claim_information_request_evidence where request_id = ${requestId} and document_id = ${documentId}`,
    /foreign key constraint/,
    'the reviewed evidence association cannot disappear while the fulfilment record exists'
  );
  assert.deepEqual(
    await acknowledgeInformationRequestEvidence(actor(staff), {
      claimId,
      requestId,
      documentId,
    }),
    { success: false, error: 'conflict' },
    'a fulfilled request cannot receive a fresh acknowledgement'
  );
  await assert.rejects(
    persistClaimDocumentMetadata({
      category: 'evidence',
      claimId,
      fileId: `s4_${randomUUID()}`,
      fileSize: 1024,
      informationRequestId: requestId,
      logPrefix: '[S7 fulfilment proof]',
      mimeType: 'application/pdf',
      originalName: 'late-estimate.pdf',
      resolvedBucket: 'claim-evidence',
      storagePath: `pii/tenants/tenant_ks/claims/${claimId}/late-estimate.pdf`,
      tenantId: 'tenant_ks',
      userId: member,
    }),
    /Information request changed/
  );
  assert.deepEqual(
    await admin`select * from "claim" where id = ${claimId}`,
    before,
    'submission, acknowledgement and fulfilment do not mutate claim lifecycle, assignment or timers'
  );
  assert.equal(
    (
      await rls`select document_id from claim_information_request_evidence where request_id = ${requestId}`
    ).length,
    0,
    'missing tenant context hides request-linked evidence'
  );
  await rls.begin(async tx => {
    await tx`select set_config('app.current_tenant_id', 'tenant_mk', true)`;
    assert.equal(
      (
        await tx`update claim_information_request_evidence set acknowledged_at = now(), acknowledged_by_staff_id = ${otherStaff} where request_id = ${requestId} returning document_id`
      ).length,
      0
    );
  });
}
