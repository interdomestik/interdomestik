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
  inboundInput,
  insertDocument,
  insertEntry,
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

const staffRevocations = [
  { label: 'staff role', role: 'member', branchId: assignedBranch },
  { label: 'staff branch', role: 'staff', branchId: otherBranch },
] as const;

function receiptRows(admin: postgres.Sql, claimId: string) {
  return admin`
    select
      (select jsonb_agg(to_jsonb(entry) order by entry.id)
       from claim_correspondence entry where entry.claim_id = ${claimId}) as entries,
      (select jsonb_agg(to_jsonb(seal) order by seal.correspondence_id)
       from claim_correspondence_received_seals seal where seal.claim_id = ${claimId}) as seals,
      (select jsonb_agg(to_jsonb(link) order by link.correspondence_id, link.claim_document_id)
       from claim_correspondence_received_documents link where link.claim_id = ${claimId}) as links
  `;
}

export async function proveReceivedActorScope(connections: Connection) {
  const { admin, runtime } = connections;
  const { recordInboundCorrespondence } =
    await importDomain<typeof import('@interdomestik/domain-claims/claims/correspondence')>(
      '/claims/correspondence'
    );
  const [previous] = await admin<{ role: string | null; branch_id: string | null }[]>`
    select role, branch_id from "user" where id = ${homeActor}`;
  await admin`update "user" set branch_id = ${assignedBranch} where id = ${homeActor}`;
  try {
    const claim = await enrolledCase(admin, assignedBranch);
    const document = await approve(connections, claim, 'intended-for-member');
    const replacement = await approve(connections, claim, 'intended-for-member');
    await runSequentially([document, replacement], async evidence => {
      assert.equal(await attest(admin, evidence), true);
      await restricted(runtime, tx => publish(tx, evidence));
    });

    const inputWithoutDocumentIds = {
      claimId: claim.id,
      correlationId: randomUUID(),
      partyKind: 'insurer',
      partyOrganisation: 'Synthetic insurer',
      channel: 'email',
      occurredAt: '2020-01-01T00:00:00.000Z',
      body: 'Synthetic receipt in assigned branch',
    };
    const input = { ...inputWithoutDocumentIds, receivedDocumentIds: [document.id] };
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
    assert.deepEqual(
      await recordInboundCorrespondence(assigned.session, assigned.authority, input),
      result
    );
    const [link] = await admin`select claim_document_id from claim_correspondence_received_documents
      where correspondence_id = ${result.correspondenceId}`;
    assert.equal(link?.claim_document_id, document.id);

    const substituted = { ...input, receivedDocumentIds: [replacement.id] };
    const committed = await receiptRows(admin, claim.id);
    assert.deepEqual(
      await recordInboundCorrespondence(assigned.session, assigned.authority, substituted),
      { ok: false, code: 'conflict' }
    );
    assert.deepEqual(await receiptRows(admin, claim.id), committed);
    const replays = [
      { label: 'exact links', input },
      { label: 'omitted links', input: inputWithoutDocumentIds },
      { label: 'same-size substituted links', input: substituted },
    ];
    await runSequentially(staffRevocations, async ({ label, role, branchId }) => {
      await admin`update "user" set role = ${role}, branch_id = ${branchId} where id = ${homeActor}`;
      await runSequentially(replays, async ({ label: links, input: replay }) => {
        assert.deepEqual(
          await recordInboundCorrespondence(assigned.session, assigned.authority, replay),
          { ok: false, code: 'forbidden' },
          `replay with ${links} after revoking ${label}`
        );
        assert.deepEqual(await receiptRows(admin, claim.id), committed);
      });
    });
  } finally {
    await admin`update "user" set role = ${previous.role}, branch_id = ${previous.branch_id}
      where id = ${homeActor}`;
  }
}

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
