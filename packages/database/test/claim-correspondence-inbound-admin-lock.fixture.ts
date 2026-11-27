import assert from 'node:assert/strict';
import type postgres from 'postgres';

import { runtimePid, waitUntilBlocked } from './claim-correspondence-domain.fixture';
import {
  approver,
  decisionDocument,
  enrolledCase,
  insertDecision,
  ownerA,
  setActor,
} from './claim-correspondence-inbound-pilot.fixture';
import { homeTenant, restricted, type Case, type Connection } from './claim-correspondence.fixture';

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
