import assert from 'node:assert/strict';
import type postgres from 'postgres';

import { runtimePid, waitUntilBlocked } from './claim-correspondence-domain.fixture';
import {
  assignedBranch,
  attest,
  createDecision,
  decisionDocument,
  enrolledCase,
  insertDecision,
  otherBranch,
  ownerA,
  setActor,
} from './claim-correspondence-inbound-pilot.fixture';
import {
  homeActor,
  homeTenant,
  insertDocument,
  restricted,
  type Connection,
} from './claim-correspondence.fixture';
import { runSequentially } from './in-order';

// The case is in otherBranch. Exercise omission, forgery and narrower sessions against the live row.
const refusedBranchScopes = [
  [assignedBranch, undefined],
  [assignedBranch, otherBranch],
  [otherBranch, assignedBranch],
  [null, assignedBranch],
] as const;

async function proveStaleStaffBranch(
  { admin, runtime, peer }: Connection,
  write: (tx: postgres.TransactionSql) => Promise<unknown>,
  refusal: { code: string; message: string }
) {
  let denial: Promise<unknown> | undefined;
  try {
    await admin.begin(async tx => {
      const [{ pid }] = await tx<{ pid: number }[]>`select pg_backend_pid() as pid`;
      await tx`update "user" set branch_id = ${assignedBranch} where id = ${homeActor}`;
      denial = assert.rejects(
        restricted(runtime, async writer => {
          await setActor(writer, homeActor, 'staff', otherBranch);
          await write(writer);
        }),
        refusal
      );
      void denial.catch(() => {});
      await waitUntilBlocked(peer, () => runtimePid(peer), pid);
    });
  } finally {
    await denial;
  }
}

export async function proveDirectDecisionBranch(connections: Connection) {
  const { admin, runtime } = connections;
  const claim = await enrolledCase(admin, otherBranch);
  const write = (tx: postgres.TransactionSql) =>
    insertDecision(tx, decisionDocument(claim), 'intended-for-member', ownerA);
  const refusal = { code: 'P1210', message: 'Pilot visibility decision refused' };
  await assert.rejects(
    restricted(
      runtime,
      tx => tx`select public.claim_inbound_lock_staff_branch(${homeTenant}, ${otherBranch})`
    ),
    { code: '42501' }
  );
  try {
    await runSequentially(refusedBranchScopes, async ([staffBranch, sessionBranch]) => {
      await admin`update "user" set branch_id = ${staffBranch} where id = ${homeActor}`;
      await assert.rejects(
        restricted(runtime, async tx => {
          await setActor(tx, homeActor, 'staff', sessionBranch);
          await write(tx);
        }),
        refusal
      );
    });
    await admin`update "user" set branch_id = ${otherBranch} where id = ${homeActor}`;
    await restricted(runtime, async tx => {
      await setActor(tx, homeActor, 'staff', otherBranch);
      assert.equal((await write(tx)).length, 1);
    });
    await proveStaleStaffBranch(connections, write, refusal);
  } finally {
    await admin`update "user" set branch_id = null where id = ${homeActor}`;
  }
}

export async function proveDirectPublicationBranch(connections: Connection) {
  const { admin, runtime } = connections;
  const claim = await enrolledCase(admin, assignedBranch);
  const refusal = {
    code: 'P1211',
    message: 'Reserved pilot document is outside assigned staff scope',
  };
  await admin`update "user" set branch_id = ${assignedBranch} where id = ${homeActor}`;
  try {
    const { document, decisionId } = await createDecision(
      connections,
      claim,
      'intended-for-member'
    );
    assert.equal(await attest(admin, document), true);
    await admin`update claim set branch_id = ${otherBranch} where id = ${claim.id}`;
    const write = (tx: postgres.TransactionSql) =>
      insertDocument(tx, { ...document, category: 'evidence' });
    await runSequentially(refusedBranchScopes, async ([staffBranch, sessionBranch]) => {
      await admin`update "user" set branch_id = ${staffBranch} where id = ${homeActor}`;
      await restricted(runtime, async tx => {
        await setActor(tx, homeActor, 'staff', sessionBranch);
        assert.equal(
          (await tx`select id from claim_inbound_upload_decisions where id = ${decisionId}`).length,
          0
        );
      });
      await assert.rejects(
        restricted(runtime, async tx => {
          await setActor(tx, homeActor, 'staff', sessionBranch);
          await write(tx);
        }),
        refusal
      );
    });
    await admin`update "user" set branch_id = ${otherBranch} where id = ${homeActor}`;
    await proveStaleStaffBranch(connections, write, refusal);
    await admin`update "user" set branch_id = ${otherBranch} where id = ${homeActor}`;
    await restricted(runtime, async tx => {
      await setActor(tx, homeActor, 'staff', otherBranch);
      await write(tx);
    });
  } finally {
    await admin`update "user" set branch_id = null where id = ${homeActor}`;
  }
}
