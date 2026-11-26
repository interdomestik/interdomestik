import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';

import { mintTenantAuthority } from '../src/tenant-authority';
import { importDomain } from './claim-correspondence-domain.fixture';
import {
  approver,
  attest,
  createDecision,
  enrolledCase,
  ownerA,
  ownerB,
  publish,
  setActor,
  staffPeer,
} from './claim-correspondence-inbound-pilot.fixture';
import {
  assignedPath,
  documentInput,
  foreignActor,
  foreignTenant,
  homeActor,
  homeTenant,
  insertClaim,
  restricted,
  type Case,
  type Connection,
} from './claim-correspondence.fixture';

function sessionAuthority(
  tenantId: string,
  userId: string,
  role: string,
  branchId: string | null = null
) {
  return mintTenantAuthority({
    tenantId,
    purpose: 'session',
    principal: { userId, role, branchId, agentId: null },
  });
}

export async function proveDecisionGrants(connections: Connection) {
  const claim = await enrolledCase(connections.admin);
  await approveWithCommand(connections, claim, 'intended-for-member');
  await approveWithCommand(connections, claim, 'approved-to-show');
}

async function approveWithCommand(
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

export async function provePendingDecisionVisibility(connections: Connection) {
  const { admin, runtime } = connections;
  const claim = await enrolledCase(admin);
  const { decisionId } = await createDecision(connections, claim, 'approved-to-show');
  for (const [actor, role, visible] of [
    [ownerA, 'member', false],
    [ownerB, 'member', false],
    [staffPeer, 'staff', false],
    [homeActor, 'staff', true],
    [approver, 'tenant_admin', true],
  ] as const) {
    await restricted(runtime, async tx => {
      await setActor(tx, actor, role);
      const rows =
        await tx`select file_name, office_receipt_ref, recipient_id, sha256, bucket, file_path
        from claim_inbound_upload_decisions where id = ${decisionId}`;
      assert.equal(rows.length, Number(visible), role + ' ' + actor);
    });
  }
}

export async function proveDecisionExpiry(connections: Connection) {
  const { admin, runtime, role } = connections;
  const claim = await enrolledCase(admin);
  const { document, decisionId } = await createDecision(connections, claim, 'intended-for-member');
  const { withPrincipalTenantContext } = await import('../src/free-start-drafts');
  const { loadInboundUploadDecision } =
    await importDomain<typeof import('@interdomestik/domain-claims/claims/inbound-upload')>(
      '/claims/inbound-upload'
    );
  const staff = sessionAuthority(homeTenant, homeActor, 'staff');
  const load = (id: string, authority = staff) =>
    withPrincipalTenantContext(authority, async tx => {
      const [login] = await tx.execute<{ role: string }>(sql`select current_user as role`);
      assert.equal(login.role, role);
      return loadInboundUploadDecision(tx, authority, claim.id, id);
    });
  const pending = await load(decisionId);
  assert.ok(pending);
  assert.equal(pending.published, false);
  assert.equal(pending.withinDeadline, true);
  assert.equal(pending.documentId, document.id);
  assert.equal(pending.expiresAt, pending.decidedAt.getTime() + 15 * 60_000);
  assert.equal(await attest(admin, document), true);
  const expire = (id: string) =>
    admin.begin(async tx => {
      await tx`alter table claim_inbound_upload_decisions disable trigger claim_inbound_decisions_immutable`;
      await tx`update claim_inbound_upload_decisions set decided_at = clock_timestamp() - interval '16 minutes'
      where id = ${id}`;
      await tx`alter table claim_inbound_upload_decisions enable trigger claim_inbound_decisions_immutable`;
    });
  await expire(decisionId);
  assert.equal(await attest(admin, document), false);
  await assert.rejects(
    restricted(runtime, tx => publish(tx, document)),
    { code: 'P1211' }
  );
  assert.equal(await load(decisionId), null);
  const { document: fresh, decisionId: freshId } = await createDecision(
    connections,
    claim,
    'intended-for-member'
  );
  assert.equal(await attest(admin, fresh), true);
  await restricted(runtime, tx => publish(tx, fresh));
  await expire(freshId);
  const committed = await load(freshId);
  assert.equal(committed?.withinDeadline, false);
  assert.equal(committed?.published, true);
  assert.equal(committed?.documentId, fresh.id);
  for (const [reason, authority] of [
    ['wrong user', sessionAuthority(homeTenant, staffPeer, 'staff')],
    ['wrong role', sessionAuthority(homeTenant, homeActor, 'tenant_admin')],
    ['wrong tenant', sessionAuthority(foreignTenant, homeActor, 'staff')],
  ] as const) {
    assert.equal(await load(freshId, authority), null, reason);
  }
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
  const refused = { ok: false, code: 'forbidden' };
  for (const authority of [
    sessionAuthority(homeTenant, ownerB, 'member'),
    sessionAuthority(homeTenant, approver, 'tenant_admin'),
    sessionAuthority(foreignTenant, foreignActor, 'staff'),
    sessionAuthority(homeTenant, homeActor, 'staff', 'different-branch'),
  ]) {
    assert.deepEqual(await recordInboundUploadDecision(authority, input, storage), refused);
  }
  const staff = sessionAuthority(homeTenant, homeActor, 'staff');
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
