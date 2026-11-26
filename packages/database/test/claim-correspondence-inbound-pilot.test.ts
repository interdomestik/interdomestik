import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import type postgres from 'postgres';

import { actor, importDomain, withDomainPools } from './claim-correspondence-domain.fixture';
import {
  approve,
  enrolledCase,
  proveDecisionDenials,
  publish,
  setActor,
  setup,
} from './claim-correspondence-inbound-pilot.fixture';
import {
  provePublishedScope,
  proveReservation,
} from './claim-correspondence-inbound-reservation.fixture';
import { proveVaultRace } from './claim-correspondence-inbound-vault.fixture';
import {
  homeActor,
  homeTenant,
  inboundInput,
  insertEntry,
  restricted,
  type Connection,
  withRegisterDb,
} from './claim-correspondence.fixture';

async function proveReceivedSet(connections: Connection) {
  const { admin, runtime } = connections;
  const claim = await enrolledCase(admin);
  const document = await approve(connections, claim, 'intended-for-member');
  const second = await approve(connections, claim, 'approved-to-show');
  const { recordInboundCorrespondence } =
    await importDomain<typeof import('@interdomestik/domain-claims/claims/correspondence')>(
      '/claims/correspondence'
    );
  const staff = actor(homeActor, 'staff', homeTenant, null);
  const inbound = {
    claimId: claim.id,
    correlationId: randomUUID(),
    partyKind: 'insurer',
    partyOrganisation: 'Synthetic insurer',
    channel: 'email',
    occurredAt: '2020-01-01T00:00:00.000Z',
    body: 'Synthetic exact receipt',
  };
  const write = (ids: string[]) =>
    recordInboundCorrespondence(staff.session, staff.authority, {
      ...inbound,
      receivedDocumentIds: ids,
    });
  const unavailable = { ok: false, code: 'document_invalid' };
  assert.deepEqual(await write([document.id]), unavailable);
  assert.equal(
    (
      await admin`select id from claim_correspondence where correlation_id = ${inbound.correlationId}`
    ).length,
    0
  );
  const historical = await restricted(runtime, tx => insertEntry(tx, inboundInput(claim)));
  await restricted(runtime, tx => publish(tx, document));
  await restricted(runtime, tx => publish(tx, second));
  const entry = inboundInput(claim);
  const seal = (tx: postgres.TransactionSql, id: string, count: number) => tx`
    insert into claim_correspondence_received_seals (tenant_id, claim_id, correspondence_id, document_count)
    values (${claim.tenant}, ${claim.id}, ${id}, ${count})`;
  const link = (tx: postgres.TransactionSql, id: string, documentId = document.id) => tx`
    insert into claim_correspondence_received_documents (tenant_id, claim_id, correspondence_id, claim_document_id)
    values (${claim.tenant}, ${claim.id}, ${id}, ${documentId})`;
  await assert.rejects(
    restricted(runtime, tx => seal(tx, historical.id, 1)),
    { code: 'P1205' }
  );
  await assert.rejects(
    restricted(runtime, async tx => {
      await seal(tx, entry.id, 1);
      await insertEntry(tx, entry);
    }),
    { code: 'P1204' }
  );
  const [rolledBack] = await admin`select
    exists(select 1 from claim_correspondence where id = ${entry.id}) as parent,
    exists(select 1 from claim_correspondence_received_seals where correspondence_id = ${entry.id}) as seal`;
  assert.deepEqual({ ...rolledBack }, { parent: false, seal: false });
  await restricted(runtime, async tx => {
    await setActor(tx);
    await seal(tx, entry.id, 1);
    await insertEntry(tx, entry);
    await link(tx, entry.id);
  });
  const [count] =
    await admin`select count(*)::int as count from claim_correspondence_received_documents
    where correspondence_id = ${entry.id}`;
  assert.equal(count.count, 1);
  for (const id of [historical.id, entry.id]) {
    await assert.rejects(
      restricted(runtime, async tx => {
        await setActor(tx);
        await link(tx, id, second.id);
      }),
      { code: 'P1204' }
    );
  }
  const [sent] = await admin`select count(*)::int as count from claim_correspondence_documents
    where correspondence_id = ${entry.id}`;
  assert.equal(sent.count, 0);
  await assert.rejects(
    restricted(
      runtime,
      tx => tx`
    delete from claim_correspondence_received_documents where correspondence_id = ${entry.id}`
    ),
    { code: '42501' }
  );

  assert.deepEqual(await write([document.id, randomUUID()]), {
    ok: false,
    code: 'document_invalid',
  });
  const ids = [document.id, second.id];
  const [created, duplicate] = await Promise.all([write(ids), write([...ids].reverse())]);
  assert.ok(created.ok);
  assert.deepEqual(duplicate, created);
  assert.deepEqual(await write([second.id]), { ok: false, code: 'conflict' });
  const rows = await admin`select claim_document_id from claim_correspondence_received_documents
    where correspondence_id = ${created.correspondenceId}`;
  assert.deepEqual(rows.map(row => row.claim_document_id).sort(), [...ids].sort());
}

test('WP-12.1 restricted runtime publication and receipt proofs', async t => {
  await withRegisterDb(t, async connections => {
    await setup(connections);
    await withDomainPools(connections.admin, connections.runtime, async () => {
      await t.test('refuses decisions outside the assigned home-tenant role and case scope', () =>
        proveDecisionDenials(connections)
      );
      await t.test('pilot freezes published scope and serializes recipient changes under RLS', () =>
        provePublishedScope(connections)
      );
      await t.test(
        'reserved keys reject reparenting and polymorphic aliases across snapshots',
        () => proveReservation(connections)
      );
      await t.test(
        'transfer before publication does not enter the former owner’s MK vault snapshot',
        () => proveVaultRace(connections)
      );
      await t.test('seals exactly the received set and preserves empty historical receipts', () =>
        proveReceivedSet(connections)
      );
    });
  });
});
