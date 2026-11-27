import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import type postgres from 'postgres';

import { mintTenantAuthority } from '../src/tenant-authority';
import { importDomain, runtimePid, waitUntilBlocked } from './claim-correspondence-domain.fixture';
import {
  approver,
  attest,
  createDecision,
  decisionDocument,
  enrolledCase,
  insertDecision,
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
import { runSequentially } from './in-order';

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

async function updateApproverRole(
  client: postgres.Sql | postgres.TransactionSql,
  role: 'member' | 'tenant_admin'
) {
  // Changing only the non-key role column does not conflict with the actor FK's KEY SHARE lock.
  const [updated] = await client<{ role: string }[]>`
    update "user" set role = ${role} where id = ${approver} and tenant_id = ${homeTenant}
    returning role`;
  assert.equal(updated?.role, role);
}

function writeAdminDecision(
  runtime: postgres.Sql,
  claim: Case,
  written?: (pid: number) => Promise<void>
) {
  return restricted(runtime, async tx => {
    await setActor(tx, approver, 'tenant_admin');
    const [decision] = await insertDecision(
      tx,
      decisionDocument(claim),
      'approved-to-show',
      ownerA
    );
    assert.ok(decision);
    if (written) {
      const [{ pid }] = await tx<{ pid: number }[]>`select pg_backend_pid() as pid`;
      await written(pid);
    }
    return decision.id;
  });
}

async function proveAdminApprovalCommitsFirst({ admin, runtime, peer }: Connection) {
  const claim = await enrolledCase(admin);
  let revoking: Promise<void> | undefined;
  let revokerPid = 0;
  try {
    const decisionId = await writeAdminDecision(runtime, claim, async writerPid => {
      revoking = admin.begin(async tx => {
        await tx`set local lock_timeout = '5s'`;
        const [{ pid }] = await tx<{ pid: number }[]>`select pg_backend_pid() as pid`;
        revokerPid = pid;
        await updateApproverRole(tx, 'member');
      });
      void revoking.catch(() => {});
      await waitUntilBlocked(peer, () => Promise.resolve(revokerPid), writerPid);
    });
    await revoking;
    const [committed] = await admin<{ id: string }[]>`
      select id from claim_inbound_upload_decisions where claim_id = ${claim.id}`;
    assert.equal(committed?.id, decisionId);
  } finally {
    await Promise.allSettled([revoking]);
  }
}

async function proveAdminRevocationCommitsFirst({ admin, runtime, peer }: Connection) {
  const claim = await enrolledCase(admin);
  let refused: Promise<void> | undefined;
  try {
    await admin.begin(async tx => {
      const [{ pid }] = await tx<{ pid: number }[]>`select pg_backend_pid() as pid`;
      await updateApproverRole(tx, 'member');
      refused = assert.rejects(writeAdminDecision(runtime, claim), {
        code: 'P1210',
        message: 'Pilot visibility decision refused',
      });
      void refused.catch(() => {});
      await waitUntilBlocked(peer, () => runtimePid(peer), pid);
    });
    await refused;
    assert.deepEqual(
      [
        ...(await admin`select id from claim_inbound_upload_decisions where claim_id = ${claim.id}`),
      ],
      []
    );
  } finally {
    await Promise.allSettled([refused]);
  }
}

export async function proveAdminDecisionActorLock(connections: Connection) {
  const { admin } = connections;
  try {
    await proveAdminApprovalCommitsFirst(connections);
    await updateApproverRole(admin, 'tenant_admin');
    await proveAdminRevocationCommitsFirst(connections);
  } finally {
    await updateApproverRole(admin, 'tenant_admin');
  }
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
  const visibilityCases = [
    [ownerA, 'member', false],
    [ownerB, 'member', false],
    [staffPeer, 'staff', false],
    [homeActor, 'staff', true],
    [approver, 'tenant_admin', true],
  ] as const;
  await runSequentially(visibilityCases, async ([actor, role, visible]) => {
    await restricted(runtime, async tx => {
      await setActor(tx, actor, role);
      const rows =
        await tx`select file_name, office_receipt_ref, recipient_id, sha256, bucket, file_path
        from claim_inbound_upload_decisions where id = ${decisionId}`;
      assert.equal(rows.length, Number(visible), role + ' ' + actor);
    });
  });
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
  const refusedAuthorities = [
    ['wrong user', sessionAuthority(homeTenant, staffPeer, 'staff')],
    ['wrong role', sessionAuthority(homeTenant, homeActor, 'tenant_admin')],
    ['wrong tenant', sessionAuthority(foreignTenant, homeActor, 'staff')],
  ] as const;
  await runSequentially(refusedAuthorities, async ([reason, authority]) => {
    assert.equal(await load(freshId, authority), null, reason);
  });
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
  const refusedAuthorities = [
    sessionAuthority(homeTenant, ownerB, 'member'),
    sessionAuthority(homeTenant, approver, 'tenant_admin'),
    sessionAuthority(foreignTenant, foreignActor, 'staff'),
    sessionAuthority(homeTenant, homeActor, 'staff', 'different-branch'),
  ];
  await runSequentially(refusedAuthorities, async authority => {
    assert.deepEqual(await recordInboundUploadDecision(authority, input, storage), refused);
  });
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
