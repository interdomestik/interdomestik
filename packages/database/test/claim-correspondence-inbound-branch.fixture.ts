import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import type postgres from 'postgres';

import {
  actor,
  importDomain,
  runtimePid,
  waitUntilBlocked,
} from './claim-correspondence-domain.fixture';
import {
  approve,
  assignedBranch,
  attest,
  createDecision,
  decisionDocument,
  enrolledCase,
  insertDecision,
  otherBranch,
  ownerA,
  publish,
  setActor,
  staffPeer,
} from './claim-correspondence-inbound-pilot.fixture';
import {
  foreignTenant,
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

export async function proveReceivedActorScope(connections: Connection) {
  const { admin, runtime } = connections;
  const { recordInboundCorrespondence } =
    await importDomain<typeof import('@interdomestik/domain-claims/claims/correspondence')>(
      '/claims/correspondence'
    );
  const [previous] = await admin<{ branch_id: string | null }[]>`
    select branch_id from "user" where id = ${homeActor}`;
  await admin`update "user" set branch_id = ${assignedBranch} where id = ${homeActor}`;
  try {
    const claim = await enrolledCase(admin, assignedBranch);
    const document = await approve(connections, claim, 'intended-for-member');
    assert.equal(await attest(admin, document), true);
    await restricted(runtime, tx => publish(tx, document));

    const input = {
      claimId: claim.id,
      correlationId: randomUUID(),
      partyKind: 'insurer',
      partyOrganisation: 'Synthetic insurer',
      channel: 'email',
      occurredAt: '2020-01-01T00:00:00.000Z',
      body: 'Synthetic receipt in assigned branch',
      receivedDocumentIds: [document.id],
    };
    const assigned = actor(homeActor, 'staff', homeTenant, assignedBranch);
    const peer = actor(staffPeer, 'staff', homeTenant, assignedBranch);
    const denied = [
      peer,
      actor(homeActor, 'staff', foreignTenant, assignedBranch),
      actor(homeActor, 'admin', homeTenant, assignedBranch),
      actor(homeActor, 'staff', homeTenant, otherBranch),
      { session: peer.session, authority: assigned.authority },
    ];
    await runSequentially(denied, async ({ session, authority }) => {
      assert.deepEqual(await recordInboundCorrespondence(session, authority, input), {
        ok: false,
        code: 'forbidden',
      });
    });
    const [before] = await admin`select
      exists(select 1 from claim_correspondence where correlation_id = ${input.correlationId}) as entry,
      exists(select 1 from claim_correspondence_received_documents
             where claim_document_id = ${document.id}) as link`;
    assert.deepEqual({ ...before }, { entry: false, link: false });

    const result = await recordInboundCorrespondence(assigned.session, assigned.authority, input);
    assert.ok(result.ok);
    const [link] = await admin`select claim_document_id from claim_correspondence_received_documents
      where correspondence_id = ${result.correspondenceId}`;
    assert.equal(link?.claim_document_id, document.id);
  } finally {
    await admin`update "user" set branch_id = ${previous.branch_id} where id = ${homeActor}`;
  }
}

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
