import assert from 'node:assert/strict';

import { waitUntilBlocked } from './claim-correspondence-domain.fixture';
import {
  assignedBranch,
  createDecision,
  decisionDocument,
  enrolledCase,
  insertDecision,
  otherBranch,
  ownerA,
  setActor,
} from './claim-correspondence-inbound-pilot.fixture';
import { homeActor, homeTenant, restricted, type Connection } from './claim-correspondence.fixture';

export async function proveStaffDecisionActorLock({ admin, runtime, peer }: Connection) {
  const claim = await enrolledCase(admin, assignedBranch);
  const [previous] = await admin<{ branch_id: string | null }[]>`
    select branch_id from "user" where tenant_id = ${homeTenant} and id = ${homeActor}`;
  assert.ok(previous);
  let move: Promise<unknown> | undefined;
  let moverPid = 0;
  try {
    await admin`update "user" set branch_id = ${assignedBranch}
      where tenant_id = ${homeTenant} and id = ${homeActor}`;
    const decisionId = await restricted(runtime, async writer => {
      await setActor(writer, homeActor, 'staff', assignedBranch);
      const [{ id }] = await insertDecision(
        writer,
        decisionDocument(claim),
        'intended-for-member',
        ownerA
      );
      const [{ pid: writerPid }] = await writer<{ pid: number }[]>`select pg_backend_pid() as pid`;
      move = admin.begin(async mover => {
        await mover`set local lock_timeout = '5s'`;
        const [{ pid }] = await mover<{ pid: number }[]>`select pg_backend_pid() as pid`;
        moverPid = pid;
        // Only the actor's non-key branch changes. FK KEY SHARE cannot account for the wait.
        return mover`update "user" set branch_id = ${otherBranch}
          where tenant_id = ${homeTenant} and id = ${homeActor}`;
      });
      void move.catch(() => {});
      await waitUntilBlocked(peer, () => Promise.resolve(moverPid), writerPid);
      return id;
    });
    await move;
    const [durable] = await admin<{ id: string; branch_id: string }[]>`
      select decision.id, actor.branch_id
      from claim_inbound_upload_decisions as decision
      join "user" as actor on actor.tenant_id = decision.tenant_id and actor.id = decision.decided_by
      where decision.claim_id = ${claim.id}`;
    assert.equal(durable?.id, decisionId);
    assert.equal(durable?.branch_id, otherBranch);
  } finally {
    await Promise.allSettled([move]);
    await admin`update "user" set branch_id = ${previous.branch_id}
      where tenant_id = ${homeTenant} and id = ${homeActor}`;
  }
}

export async function proveDecisionClassificationBasis(connections: Connection) {
  const { admin, runtime } = connections;
  const claim = await enrolledCase(admin);
  const { decisionId } = await createDecision(connections, claim, 'intended-for-member');
  const replacement = decisionDocument(claim);
  await assert.rejects(
    restricted(runtime, async tx => {
      await setActor(tx);
      // Copy the valid staff actor and decision fields. Only the classification is crossed,
      // with fresh correlation and object identifiers so the basis check must reject it.
      await tx`insert into claim_inbound_upload_decisions
        (tenant_id, claim_id, correlation_id, classification, decided_by, role_basis, recipient_id,
          uploader_id, office_receipt_ref, document_id, bucket, file_path, file_name, mime_type, file_size, sha256)
        select tenant_id, claim_id, gen_random_uuid(), 'approved-to-show', decided_by, role_basis, recipient_id,
          uploader_id, office_receipt_ref, ${replacement.id}, bucket, ${replacement.file_path}, file_name, mime_type, file_size, sha256
        from claim_inbound_upload_decisions where id = ${decisionId}`;
    }),
    { code: '23514', constraint_name: 'claim_inbound_decisions_basis_check' }
  );
  const decisions = await admin<{ id: string }[]>`
    select id from claim_inbound_upload_decisions where claim_id = ${claim.id}`;
  assert.deepEqual(
    decisions.map(row => row.id),
    [decisionId]
  );
}
