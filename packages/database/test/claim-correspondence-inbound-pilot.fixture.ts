import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import type postgres from 'postgres';

import {
  documentInput,
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
export const approver = 'wp12-pilot-approver';
export const staffPeer = 'wp12-pilot-staff-peer';
export const assignedBranch = 'wp12-staff-branch';
export const otherBranch = 'wp12-other-branch';
const fixtureDigest = 'a'.repeat(64);
export async function setup({ admin }: Connection) {
  await admin`insert into branches (id, tenant_id, name, slug) values
    (${assignedBranch}, ${homeTenant}, 'Assigned branch', 'assigned'),
    (${otherBranch}, ${homeTenant}, 'Other branch', 'other')`;
  for (const [id, role] of [
    [ownerA, 'member'],
    [ownerB, 'member'],
    [approver, 'tenant_admin'],
    [staffPeer, 'staff'],
  ]) {
    await admin`insert into "user" (id, tenant_id, name, email, role, "emailVerified", "createdAt", "updatedAt")
      values (${id}, ${homeTenant}, 'Synthetic pilot actor', ${id + '@example.test'}, ${role}, true, now(), now())`;
  }
}

export async function enrolledCase(admin: postgres.Sql, branch?: string) {
  const claim = await insertClaim(admin, { branch });
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
  branch?: string
) {
  await tx`select set_config('app.current_actor_id', ${id}, true),
                  set_config('app.current_actor_role', ${role}, true)`;
  if (branch !== undefined) {
    await tx`select set_config('app.current_actor_branch_id', ${branch}, true)`;
  }
}

export function decisionDocument(
  claim: Case,
  id = 'wp12-inbound-' + randomUUID().replaceAll('-', '')
) {
  return { ...documentInput(claim, id), name: 'synthetic-inbound.pdf' };
}

export function insertDecision(
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
      ${document.name}, ${document.file_type}, ${document.file_size}, ${fixtureDigest})
    returning id`;
}

// Explicit permitted columns keep guard proofs independent of the production insert test.
export async function createDecision(
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

function recordVerification(
  tx: postgres.TransactionSql,
  decisionId: string,
  document: Document,
  digest: string
) {
  return tx<{ verified: boolean }[]>`select public.record_claim_inbound_object_verification(
    ${decisionId}, ${document.bucket}, ${document.file_path}, ${document.file_size}, ${digest}
  ) as verified`;
}

function asVerifier<T>(
  admin: postgres.Sql,
  run: (tx: postgres.TransactionSql) => Promise<T>,
  {
    home = homeTenant,
    access = home,
    actor = homeActor,
    branch = '',
  }: { home?: string; access?: string; actor?: string; branch?: string } = {}
) {
  return restricted(
    admin,
    async tx => {
      await tx`set local role interdomestik_wp12_verifier`;
      const [{ role }] = await tx`select current_user as role`;
      assert.equal(role, 'interdomestik_wp12_verifier');
      await setActor(tx, actor, 'staff', branch);
      return run(tx);
    },
    { home, access }
  );
}

export async function attest(admin: postgres.Sql, document: Document, digest = fixtureDigest) {
  const [{ id }] = await admin<{ id: string }[]>`select id from claim_inbound_upload_decisions
    where document_id = ${document.id}`;
  return asVerifier(
    admin,
    async tx => {
      const [{ verified }] = await recordVerification(tx, id, document, digest);
      return verified;
    },
    { home: document.tenant_id, actor: document.uploaded_by }
  );
}

export async function proveStorageVerification(connections: Connection) {
  const { admin, runtime } = connections;
  const claim = await enrolledCase(admin);
  const { document, decisionId } = await createDecision(connections, claim, 'intended-for-member');
  const lacksProof = {
    code: 'P1211',
    message: 'Reserved pilot document requires verified storage',
  };
  await assert.rejects(
    restricted(runtime, tx => publish(tx, document)),
    lacksProof
  );
  await assert.rejects(
    restricted(
      runtime,
      tx => tx`insert into claim_inbound_object_verifications (decision_id)
      values (${decisionId})`
    ),
    { code: '42501' }
  );
  await assert.rejects(
    restricted(runtime, async tx => {
      await setActor(tx, homeActor, 'staff', '');
      return recordVerification(tx, decisionId, document, fixtureDigest);
    }),
    { code: '42501' }
  );
  await assert.rejects(
    restricted(runtime, tx => tx`set local role interdomestik_wp12_verifier`),
    { code: '42501' }
  );
  await assert.rejects(
    asVerifier(
      admin,
      tx => tx`insert into claim_inbound_object_verifications (decision_id)
      values (${decisionId})`
    ),
    { code: '42501' }
  );
  for (const scope of [
    { home: foreignTenant },
    { access: foreignTenant },
    { actor: staffPeer },
    { branch: assignedBranch },
  ]) {
    const [{ verified }] = await asVerifier(
      admin,
      tx => recordVerification(tx, decisionId, document, fixtureDigest),
      scope
    );
    assert.equal(verified, false);
  }
  assert.equal(await attest(admin, document, 'b'.repeat(64)), false);
  assert.equal(
    await attest(admin, { ...document, file_path: document.file_path + '.other' }),
    false
  );
  await assert.rejects(
    restricted(runtime, tx => publish(tx, document)),
    lacksProof
  );
  assert.equal((await admin`select id from claim_documents where id = ${document.id}`).length, 0);
  assert.equal(await attest(admin, document), true);
  assert.equal(await attest(admin, document), true);
  await restricted(runtime, tx => publish(tx, document));
  assert.equal((await admin`select id from claim_documents where id = ${document.id}`).length, 1);

  const approved = await approve(connections, claim, 'approved-to-show');
  assert.equal(await attest(admin, approved), true);
  await restricted(runtime, tx => publish(tx, approved));
}

export async function proveDarkPublication({ admin, runtime }: Connection) {
  assert.equal((await admin`select 1 from claim_inbound_pilot_cases`).length, 0);
  const claim = await insertClaim(admin);
  const reserved = decisionDocument(claim);
  const ordinary = documentInput(claim);
  const write = (document: Document) =>
    restricted(runtime, tx => publish(tx, { ...document, category: 'evidence' }));

  for (const document of [
    reserved,
    { ...reserved, file_path: ordinary.file_path },
    { ...ordinary, file_path: reserved.file_path },
  ]) {
    await assert.rejects(write(document), {
      code: 'P1211',
      message: 'Reserved pilot document requires active enrollment',
    });
  }

  await write(ordinary);
  const rows = await admin`select id, file_path from claim_documents where claim_id = ${claim.id}`;
  assert.deepEqual([...rows], [{ id: ordinary.id, file_path: ordinary.file_path }]);
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
