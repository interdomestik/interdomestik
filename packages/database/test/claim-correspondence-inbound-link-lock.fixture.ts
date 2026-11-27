import assert from 'node:assert/strict';
import type postgres from 'postgres';

import { runtimePid, waitUntilBlocked } from './claim-correspondence-domain.fixture';
import { receiptRows, staffRevocations } from './claim-correspondence-inbound-branch.fixture';
import {
  approve,
  assignedBranch,
  attest,
  enrolledCase,
  publish,
  setActor,
} from './claim-correspondence-inbound-pilot.fixture';
import {
  homeActor,
  inboundInput,
  insertEntry,
  restricted,
  type Connection,
} from './claim-correspondence.fixture';
import { runSequentially } from './in-order';

async function writeReceivedEvidence(
  tx: postgres.TransactionSql,
  entry: ReturnType<typeof inboundInput>,
  documentId: string
) {
  await setActor(tx, homeActor, 'staff', assignedBranch);
  await tx`insert into claim_correspondence_received_seals
    (tenant_id, claim_id, correspondence_id, document_count)
    values (${entry.tenant_id}, ${entry.claim_id}, ${entry.id}, 1)`;
  await insertEntry(tx, entry);
  await tx`insert into claim_correspondence_received_documents
    (tenant_id, claim_id, correspondence_id, claim_document_id)
    values (${entry.tenant_id}, ${entry.claim_id}, ${entry.id}, ${documentId})`;
}

async function commitLinkBeforeRevocation(
  { admin, runtime, peer }: Connection,
  write: (tx: postgres.TransactionSql) => Promise<void>
) {
  let revocation: Promise<unknown> | undefined;
  let revocationPid = 0;
  try {
    await restricted(runtime, async writer => {
      const [{ pid }] = await writer<{ pid: number }[]>`select pg_backend_pid() as pid`;
      await write(writer);
      revocation = admin.begin(async tx => {
        await tx`set local lock_timeout = '5s'`;
        const [backend] = await tx<{ pid: number }[]>`select pg_backend_pid() as pid`;
        revocationPid = backend.pid;
        await tx`update "user" set role = 'member' where id = ${homeActor}`;
      });
      void revocation.catch(() => {});
      // Only the staff row is updated by the competing transaction.
      await waitUntilBlocked(peer, () => Promise.resolve(revocationPid), pid);
    });
    await revocation;
  } finally {
    await revocation?.catch(() => {});
  }
}

async function commitRevocationBeforeLink(
  { admin, runtime, peer }: Connection,
  { role, branchId }: (typeof staffRevocations)[number],
  write: (tx: postgres.TransactionSql) => Promise<void>
) {
  let denial: Promise<void> | undefined;
  try {
    await admin.begin(async tx => {
      const [{ pid }] = await tx<{ pid: number }[]>`select pg_backend_pid() as pid`;
      await tx`update "user" set role = ${role}, branch_id = ${branchId} where id = ${homeActor}`;
      denial = assert.rejects(restricted(runtime, write), { code: 'P1203' });
      void denial.catch(() => {});
      await waitUntilBlocked(peer, () => runtimePid(peer), pid);
    });
    await denial;
  } finally {
    await denial?.catch(() => {});
  }
}

export async function proveReceivedWriteLockOrders(connections: Connection) {
  const { admin, runtime } = connections;
  const [previous] = await admin<{ role: string | null; branch_id: string | null }[]>`
    select role, branch_id from "user" where id = ${homeActor}`;
  const restoreStaff = () =>
    admin`update "user" set role = 'staff', branch_id = ${assignedBranch} where id = ${homeActor}`;
  try {
    await restoreStaff();
    const claim = await enrolledCase(admin, assignedBranch);
    const document = await approve(connections, claim, 'intended-for-member');
    assert.equal(await attest(admin, document), true);
    await restricted(runtime, tx => publish(tx, document));

    const committedEntry = inboundInput(claim);
    await commitLinkBeforeRevocation(connections, tx =>
      writeReceivedEvidence(tx, committedEntry, document.id)
    );
    const [linked] =
      await admin`select claim_document_id from claim_correspondence_received_documents
      where correspondence_id = ${committedEntry.id}`;
    assert.equal(linked?.claim_document_id, document.id);
    const [revoked] = await admin`select role from "user" where id = ${homeActor}`;
    assert.equal(revoked?.role, 'member');
    const committed = await receiptRows(admin, claim.id);

    await runSequentially(staffRevocations, async revocation => {
      await restoreStaff();
      const entry = inboundInput(claim);
      await commitRevocationBeforeLink(connections, revocation, tx =>
        writeReceivedEvidence(tx, entry, document.id)
      );
      assert.deepEqual(await receiptRows(admin, claim.id), committed);
    });
  } finally {
    await admin`update "user" set role = ${previous.role}, branch_id = ${previous.branch_id}
      where id = ${homeActor}`;
  }
}
