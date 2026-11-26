import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import type postgres from 'postgres';

import { mintTenantAuthority } from '../src/tenant-authority';
import { importDomain } from './claim-correspondence-domain.fixture';
import {
  assignedPath,
  documentInput,
  foreignActor,
  foreignTenant,
  homeActor,
  homeTenant,
  insertClaim,
  insertDocument,
  type Case,
  type Connection,
  type Document,
} from './claim-correspondence.fixture';

export const ownerA = 'wp12-pilot-owner-a';
export const ownerB = 'wp12-pilot-owner-b';
const approver = 'wp12-pilot-approver';
export async function setup({ admin }: Connection) {
  for (const [id, role] of [
    [ownerA, 'member'],
    [ownerB, 'member'],
    [approver, 'tenant_admin'],
  ]) {
    await admin`insert into "user" (id, tenant_id, name, email, role, "createdAt", "updatedAt")
      values (${id}, ${homeTenant}, 'Synthetic pilot actor', ${id + '@example.test'}, ${role}, now(), now())`;
  }
}

export async function enrolledCase(admin: postgres.Sql) {
  const claim = await insertClaim(admin);
  await admin`update claim set "userId" = ${ownerA} where id = ${claim.id}`;
  await admin`insert into claim_inbound_pilot_cases
    (tenant_id, claim_id, enrolled_at, legacy_credential_disposition)
    values (${claim.tenant}, ${claim.id}, now(), 'none-issued')`;
  return claim;
}

export async function setActor(
  tx: postgres.TransactionSql,
  id: string = homeActor,
  role = 'staff'
) {
  await tx`select set_config('app.current_actor_id', ${id}, true),
                  set_config('app.current_actor_role', ${role}, true)`;
}

export async function approve(
  connections: Connection,
  claim: Case,
  kind: 'intended-for-member' | 'approved-to-show'
) {
  const { admin } = connections;
  const classification = kind;
  const userId = kind === 'intended-for-member' ? homeActor : approver;
  const role = kind === 'intended-for-member' ? 'staff' : 'tenant_admin';
  const authority = mintTenantAuthority({
    tenantId: claim.tenant,
    purpose: 'session',
    principal: { userId, role, branchId: null, agentId: null },
  });
  const work =
    await importDomain<typeof import('@interdomestik/domain-claims/claims/inbound-upload')>(
      '/claims/inbound-upload'
    );
  const input = {
    claimId: claim.id,
    classification,
    correlationId: randomUUID(),
    officeReceiptRef: 'office-proof',
    fileName: 'synthetic-inbound.pdf',
    fileSize: 120,
    sha256: 'a'.repeat(64),
  };
  const storage = {
    bucket: 'claim-evidence',
    pathForDocument: (id: string) => assignedPath(claim, id),
  };
  const result = await work.recordInboundUploadDecision(authority, input, storage);
  assert.deepEqual(await work.recordInboundUploadDecision(authority, input, storage), result);
  assert.deepEqual(
    await work.recordInboundUploadDecision(
      authority,
      { ...input, sha256: 'b'.repeat(64) },
      storage
    ),
    {
      ok: false,
      code: 'conflict',
    }
  );
  assert.ok(result.ok);
  const [row] = await admin<
    { document_id: string; file_path: string }[]
  >`select document_id, file_path
    from claim_inbound_upload_decisions where id = ${result.decisionId}`;
  return { ...documentInput(claim, row.document_id, row.file_path), name: input.fileName };
}

export async function proveDecisionDenials({ admin }: Connection) {
  const { recordInboundUploadDecision, inboundUploadDecisionInput } =
    await importDomain<typeof import('@interdomestik/domain-claims/claims/inbound-upload')>(
      '/claims/inbound-upload'
    );
  const claim = await enrolledCase(admin);
  const draft = await insertClaim(admin, { lifecycle: 'draft' });
  await admin`insert into claim_inbound_pilot_cases
    (tenant_id, claim_id, enrolled_at, legacy_credential_disposition)
    values (${draft.tenant}, ${draft.id}, now(), 'none-issued')`;
  const input = {
    claimId: claim.id,
    classification: 'intended-for-member' as const,
    correlationId: randomUUID(),
    officeReceiptRef: 'office-proof',
    fileName: 'synthetic-inbound.pdf',
    fileSize: 120,
    sha256: 'a'.repeat(64),
  };
  const storage = {
    bucket: 'claim-evidence',
    pathForDocument: (id: string) => assignedPath(claim, id),
  };
  const session = (
    tenantId: string,
    userId: string,
    role: string,
    branchId: string | null = null
  ) =>
    mintTenantAuthority({
      tenantId,
      purpose: 'session',
      principal: { userId, role, branchId, agentId: null },
    });
  const refused = { ok: false, code: 'forbidden' };
  for (const authority of [
    session(homeTenant, ownerB, 'member'),
    session(homeTenant, approver, 'tenant_admin'),
    session(foreignTenant, foreignActor, 'staff'),
    session(homeTenant, homeActor, 'staff', 'different-branch'),
  ]) {
    assert.deepEqual(await recordInboundUploadDecision(authority, input, storage), refused);
  }
  const staff = session(homeTenant, homeActor, 'staff');
  assert.deepEqual(
    await recordInboundUploadDecision(staff, { ...input, claimId: draft.id }, storage),
    refused
  );
  await admin`update claim set "staffId" = null where id = ${claim.id}`;
  assert.deepEqual(await recordInboundUploadDecision(staff, input, storage), refused);
  assert.equal(
    inboundUploadDecisionInput.safeParse({ ...input, recipientId: ownerB }).success,
    false
  );
  assert.equal(
    inboundUploadDecisionInput.safeParse({ ...input, classification: 'held' }).success,
    false
  );
  const [count] = await admin`select count(*)::int as count from claim_inbound_upload_decisions
    where claim_id in (${claim.id}, ${draft.id})`;
  assert.equal(count.count, 0);
}

export async function publish(
  tx: postgres.TransactionSql,
  document: Document,
  explicitHome = false
) {
  await setActor(tx);
  await insertDocument(
    tx,
    explicitHome ? { ...document, access_tenant_id: document.tenant_id } : document
  );
}

export async function changeOwner(tx: postgres.TransactionSql, claim: Case) {
  const rows =
    await tx`update claim set "userId" = ${ownerB} where id = ${claim.id} returning "userId"`;
  assert.deepEqual([...rows], [{ userId: ownerB }]);
}
