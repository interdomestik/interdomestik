import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import type postgres from 'postgres';
import { sql } from 'drizzle-orm';

import { mintTenantAuthority } from '../src/tenant-authority';
import { drizzle } from 'drizzle-orm/postgres-js';
import * as schema from '../src/schema';
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
  restricted,
  type Case,
  type Connection,
  type Document,
} from './claim-correspondence.fixture';

export const ownerA = 'wp12-pilot-owner-a';
export const ownerB = 'wp12-pilot-owner-b';
const approver = 'wp12-pilot-approver';
const staffPeer = 'wp12-pilot-staff-peer';
export async function setup({ admin }: Connection) {
  for (const [id, role] of [
    [ownerA, 'member'],
    [ownerB, 'member'],
    [approver, 'tenant_admin'],
    [staffPeer, 'staff'],
  ]) {
    await admin`insert into "user" (id, tenant_id, name, email, role, "createdAt", "updatedAt")
      values (${id}, ${homeTenant}, 'Synthetic pilot actor', ${id + '@example.test'}, ${role}, now(), now())`;
  }
}

export async function enrolledCase(admin: postgres.Sql) {
  const claim = await insertClaim(admin);
  await admin`update claim set "userId" = ${ownerA} where id = ${claim.id}`;
  await enroll(admin, claim);
  return claim;
}

export async function enroll(admin: postgres.Sql, claim: Case) {
  await admin`insert into claim_inbound_pilot_cases
    (tenant_id, claim_id, enrolled_at, legacy_credential_disposition)
    values (${claim.tenant}, ${claim.id}, now(), 'none-issued')
    on conflict (claim_id) do update set enrolled_at = excluded.enrolled_at,
      legacy_credential_disposition = excluded.legacy_credential_disposition, paused = false`;
}

export async function setActor(
  tx: postgres.TransactionSql,
  id: string = homeActor,
  role = 'staff',
  branch = ''
) {
  await tx`select set_config('app.current_actor_id', ${id}, true),
                  set_config('app.current_actor_role', ${role}, true),
                  set_config('app.current_actor_branch_id', ${branch}, true)`;
}

const staffAuthority = mintTenantAuthority({
  tenantId: homeTenant,
  purpose: 'session',
  principal: { userId: homeActor, role: 'staff', branchId: null, agentId: null },
});

function decisionDocument(claim: Case, id = 'wp12-inbound-' + randomUUID().replaceAll('-', '')) {
  return { ...documentInput(claim, id), name: 'synthetic-inbound.pdf' };
}

function insertDecision(
  tx: postgres.TransactionSql,
  document: Document,
  kind: 'intended-for-member' | 'approved-to-show',
  recipient: string
) {
  const staff = kind === 'intended-for-member';
  return tx<{ id: string }[]>`insert into claim_inbound_upload_decisions
    (tenant_id, claim_id, correlation_id, classification, decided_by, role_basis, recipient_id,
      uploader_id, office_receipt_ref, document_id, bucket, file_path, file_name, mime_type, file_size, sha256)
    values (${document.tenant_id}, ${document.claim_id}, ${randomUUID()}, ${kind},
      ${staff ? homeActor : approver}, ${staff ? 'staff' : 'tenant_admin'}, ${recipient},
      ${homeActor}, 'office-fixture', ${document.id}, ${document.bucket}, ${document.file_path},
      ${document.name}, ${document.file_type}, ${document.file_size}, ${'a'.repeat(64)})
    returning id`;
}

// Explicit permitted columns keep guard proofs independent of the production insert test.
async function createDecision(
  { admin, runtime }: Connection,
  claim: Case,
  kind: 'intended-for-member' | 'approved-to-show'
) {
  const [{ userId }] = await admin<
    { userId: string }[]
  >`select "userId" from claim where id = ${claim.id}`;
  const document = decisionDocument(claim);
  const [{ id }] = await restricted(runtime, async tx => {
    if (kind === 'intended-for-member') await setActor(tx);
    else await setActor(tx, approver, 'tenant_admin');
    return insertDecision(tx, document, kind, userId);
  });
  return { document, decisionId: id };
}

export async function approve(
  connections: Connection,
  claim: Case,
  kind: 'intended-for-member' | 'approved-to-show'
) {
  return (await createDecision(connections, claim, kind)).document;
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

export async function proveDirectDecisionBranch({ admin, runtime }: Connection) {
  const claim = await enrolledCase(admin);
  await assert.rejects(
    restricted(runtime, async tx => {
      await setActor(tx, homeActor, 'staff', 'different-branch');
      await insertDecision(tx, decisionDocument(claim), 'intended-for-member', ownerA);
    }),
    { code: 'P1210' }
  );
}

export async function proveDirectPublicationBranch(connections: Connection) {
  const { admin, runtime } = connections;
  const claim = await enrolledCase(admin);
  const document = await approve(connections, claim, 'intended-for-member');
  await assert.rejects(
    restricted(runtime, async tx => {
      await setActor(tx, homeActor, 'staff', 'different-branch');
      await insertDocument(tx, document);
    }),
    { code: 'P1211' }
  );
  await restricted(runtime, tx => publish(tx, document));
}

export async function proveDecisionExpiry(connections: Connection) {
  const { admin, runtime } = connections;
  const claim = await enrolledCase(admin);
  const { document, decisionId } = await createDecision(connections, claim, 'intended-for-member');
  const { loadInboundUploadDecision } =
    await importDomain<typeof import('@interdomestik/domain-claims/claims/inbound-upload')>(
      '/claims/inbound-upload'
    );
  const load = async () =>
    drizzle(runtime, { schema }).transaction(async tx => {
      await tx.execute(sql`select set_config('app.current_tenant_id', ${homeTenant}, true),
      set_config('app.current_access_tenant_id', ${homeTenant}, true),
      set_config('app.current_actor_id', ${homeActor}, true),
      set_config('app.current_actor_role', 'staff', true),
      set_config('app.current_actor_branch_id', '', true)`);
      return loadInboundUploadDecision(tx, staffAuthority, claim.id, decisionId);
    });
  assert.ok(await load());
  // Age only the synthetic decision. Restore the live immutable trigger before the denied writes.
  await admin.begin(async tx => {
    await tx`alter table claim_inbound_upload_decisions disable trigger claim_inbound_decisions_immutable`;
    await tx`update claim_inbound_upload_decisions set decided_at = clock_timestamp() - interval '16 minutes'
      where id = ${decisionId}`;
    await tx`alter table claim_inbound_upload_decisions enable trigger claim_inbound_decisions_immutable`;
  });
  await assert.rejects(
    restricted(runtime, tx => publish(tx, document)),
    { code: 'P1211' }
  );
  assert.equal(await load(), null);
  const fresh = await approve(connections, claim, 'intended-for-member');
  await restricted(runtime, tx => publish(tx, fresh));
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
