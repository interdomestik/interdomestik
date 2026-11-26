import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import type postgres from 'postgres';

import {
  approve,
  attest,
  changeOwner,
  enroll,
  enrolledCase,
  ownerA,
  ownerB,
  publish,
  setActor,
} from './claim-correspondence-inbound-pilot.fixture';
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
  type Connection,
} from './claim-correspondence.fixture';
import { quoteIdentifier, quoteSqlLiteral } from './rls-test-connection';

const reserved = { code: 'P1211' };
const wrongCase = { code: 'P1210' };
const frozenScope = { code: 'P1212' };
const frozenOwner = { code: 'P1213' };

export async function provePublishedScope(connections: Connection) {
  const { admin, runtime, peer, role } = connections;

  for (const classification of ['intended-for-member', 'approved-to-show'] as const) {
    const claim = await enrolledCase(admin);
    const explicitHome = classification === 'approved-to-show';
    await assert.rejects(
      restricted(runtime, tx => insertDocument(tx, documentInput(claim))),
      wrongCase
    );
    const document = await approve(connections, claim, classification);
    await assert.rejects(
      restricted(runtime, tx => insertDocument(tx, document)),
      reserved
    );
    await assert.rejects(
      restricted(runtime, tx => publish(tx, { ...document, uploaded_by: ownerB })),
      reserved
    );
    await assert.rejects(
      restricted(runtime, tx => publish(tx, { ...document, access_tenant_id: foreignTenant })),
      reserved
    );
    await assert.rejects(
      restricted(runtime, tx => publish(tx, { ...document, category: 'legal' })),
      reserved
    );
    assert.equal(await attest(admin, document), true);
    await restricted(runtime, tx => publish(tx, document, explicitHome));
    const frozen = [ownerB, explicitHome ? null : homeTenant, 'legal'] as const;
    await assert.rejects(
      restricted(
        runtime,
        tx => tx`update claim_documents set uploaded_by = ${frozen[0]}
      where id = ${document.id}`
      ),
      frozenScope
    );
    await assert.rejects(
      restricted(
        runtime,
        tx => tx`update claim_documents set access_tenant_id = ${frozen[1]}
      where id = ${document.id}`
      ),
      frozenScope
    );
    await assert.rejects(
      restricted(
        runtime,
        tx => tx`update claim_documents set category = ${frozen[2]}
      where id = ${document.id}`
      ),
      frozenScope
    );
    await restricted(
      runtime,
      tx => tx`update claim_documents set name = 'Synthetic rename',
      category = category, uploaded_by = uploaded_by, access_tenant_id = access_tenant_id where id = ${document.id}`
    );
    const [published] =
      await admin`select uploaded_by, access_tenant_id, category from claim_documents
      where id = ${document.id}`;
    assert.deepEqual(
      { ...published },
      {
        uploaded_by: homeActor,
        access_tenant_id: explicitHome ? homeTenant : null,
        category: 'evidence',
      }
    );
    await admin`delete from claim_inbound_pilot_cases where claim_id = ${claim.id}`;
    // Hide only the document. The home claim must still be writable by this restricted role.
    await admin.unsafe(`create policy wp12_test_hidden_document on claim_documents as restrictive
      for select to ${quoteIdentifier(role)} using (id <> ${quoteSqlLiteral(document.id)})`);
    try {
      await assert.rejects(
        restricted(runtime, async tx => {
          assert.equal((await tx`select id from claim where id = ${claim.id}`).length, 1);
          assert.equal(
            (await tx`select id from claim_documents where id = ${document.id}`).length,
            0
          );
          const control =
            await tx`update claim set "userId" = "userId" where id = ${claim.id} returning id`;
          assert.equal(control.length, 1);
          await changeOwner(tx, claim);
        }),
        frozenOwner
      );
    } finally {
      await admin`drop policy wp12_test_hidden_document on claim_documents`;
    }
    const [stored] = await admin`select "userId" from claim where id = ${claim.id}`;
    assert.equal(stored.userId, ownerA);
  }

  const claim = await enrolledCase(admin);
  const document = await approve(connections, claim, 'intended-for-member');
  assert.equal(await attest(admin, document), true);
  // Hold an older repeatable-read snapshot in one connection and publish in the other.
  await restricted(
    peer,
    async tx => {
      await tx`select id from claim where id = ${claim.id}`;
      await restricted(runtime, writer => publish(writer, document));
      await assert.rejects(
        tx.savepoint(savepoint => changeOwner(savepoint, claim)),
        { code: '40001' }
      );
    },
    { isolation: 'repeatable read' }
  );

  const [grants] = await admin`select
    has_table_privilege(${role}, 'public.claim_inbound_pilot_cases', 'INSERT') as enroll,
    has_table_privilege(${role}, 'public.claim_inbound_upload_decisions', 'UPDATE') as edit,
    has_column_privilege(${role}, 'public.claim_inbound_upload_decisions', 'decided_at', 'INSERT') as date,
    has_function_privilege(${role}, 'public.claim_inbound_owner_guard_fn()', 'EXECUTE') as lookup`;
  assert.deepEqual({ ...grants }, { enroll: false, edit: false, date: false, lookup: false });
}

export async function proveEnrollmentSnapshot({ admin, runtime, peer }: Connection) {
  for (const staged of [false, true]) {
    const claim = await insertClaim(admin);
    const writer = staged ? { ...claim, tenant: foreignTenant, user: foreignActor } : claim;
    if (staged) {
      await admin`insert into claim_inbound_pilot_cases (tenant_id, claim_id, paused)
        values (${claim.tenant}, ${claim.id}, true)`;
    }
    await restricted(
      peer,
      async tx => {
        await setActor(tx, writer.user);
        assert.equal(
          (
            await tx`select claim_id from claim_inbound_pilot_cases
        where claim_id = ${claim.id} and enrolled_at is not null`
          ).length,
          0
        );
        await enroll(admin, claim);
        await assert.rejects(
          tx.savepoint(savepoint => insertDocument(savepoint, documentInput(writer))),
          { code: '40001' }
        );
      },
      { home: writer.tenant, isolation: 'repeatable read' }
    );
    await assert.rejects(
      restricted(runtime, async tx => {
        await setActor(tx);
        await insertDocument(tx, documentInput(claim));
      }),
      wrongCase
    );
    const [row] =
      await admin`select count(*)::int as count from claim_documents where claim_id = ${claim.id}`;
    assert.equal(row.count, 0);
  }
}

export async function proveReservation(connections: Connection) {
  const { admin, runtime, peer } = connections;
  const claim = await enrolledCase(admin);
  const other = await insertClaim(admin);
  const foreign = await insertClaim(admin, { tenant: foreignTenant });
  const mismatch = { ...documentInput(foreign), claim_id: claim.id };
  await assert.rejects(
    restricted(
      runtime,
      async tx => {
        const visible =
          await tx`select claim_id from claim_inbound_pilot_cases where claim_id = ${claim.id}`;
        assert.equal(visible.length, 0);
        await setActor(tx, foreignActor);
        await insertDocument(tx, mismatch);
      },
      { home: foreignTenant }
    ),
    wrongCase
  );
  await assert.rejects(
    restricted(
      runtime,
      async tx => {
        await setActor(tx, foreignActor, 'member');
        await insertDocument(tx, { ...documentInput(foreign), claim_id: claim.id });
      },
      { home: foreignTenant }
    ),
    wrongCase
  );
  const [refused] = await admin`select count(*)::int as count from claim_documents
    where claim_id = ${claim.id} and tenant_id = ${foreignTenant}`;
  assert.equal(refused.count, 0);
  await assert.rejects(
    restricted(runtime, async tx => {
      await setActor(tx, ownerB, 'member');
      await insertDocument(tx, { ...documentInput(claim), uploaded_by: ownerB });
    }),
    wrongCase
  );
  const own = { ...documentInput(claim), uploaded_by: ownerA };
  await restricted(runtime, async tx => {
    await setActor(tx, ownerA, 'member');
    await insertDocument(tx, own);
  });
  await assert.rejects(
    restricted(
      runtime,
      tx => tx`update claim_documents set claim_id = ${other.id}
    where id = ${own.id}`
    ),
    { code: 'P1203' }
  );
  await assert.rejects(
    restricted(
      runtime,
      tx => tx`update claim_documents set tenant_id = ${foreignTenant}
    where id = ${own.id}`
    ),
    { code: '42501' }
  );
  await restricted(runtime, tx => insertDocument(tx, documentInput(other)));

  const alias = (tx: postgres.TransactionSql, id: string, path: string) => tx`insert into documents
    (id, tenant_id, entity_type, entity_id, file_name, mime_type, file_size, storage_path, uploaded_by)
    values (${id}, ${homeTenant}, 'claim', ${other.id}, 'Fixture PDF', 'application/pdf', 120, ${path}, ${homeActor})`;

  const unused = 'wp12-inbound-' + randomUUID().replaceAll('-', '');
  await assert.rejects(
    restricted(peer, tx => alias(tx, unused, assignedPath(other, unused))),
    reserved
  );

  const document = await restricted(
    peer,
    async tx => {
      await tx`select id from claim where id = ${claim.id}`;
      const approved = await approve(connections, claim, 'intended-for-member');
      await assert.rejects(
        tx.savepoint(savepoint => alias(savepoint, approved.id, approved.file_path)),
        reserved
      );
      return approved;
    },
    { isolation: 'repeatable read' }
  );
  await assert.rejects(
    restricted(peer, tx =>
      insertDocument(tx, documentInput(other, randomUUID(), document.file_path))
    ),
    reserved
  );
  await assert.rejects(
    restricted(peer, tx => alias(tx, document.id, 'synthetic/unreserved.pdf')),
    reserved
  );
  await assert.rejects(
    restricted(
      peer,
      async tx => {
        const approvals =
          await tx`select id from claim_inbound_upload_decisions where document_id = ${document.id}`;
        assert.equal(approvals.length, 0);
        await insertDocument(tx, documentInput(foreign, randomUUID(), document.file_path));
      },
      { home: foreignTenant }
    ),
    reserved
  );
  const ordinaryId = randomUUID();
  await restricted(peer, tx => alias(tx, ordinaryId, assignedPath(other, ordinaryId)));
  const encoded = document.file_path.replace('/wp12-inbound-', '/%77p12-inbound-');
  const aliases = [
    document.file_path + '#fragment',
    document.file_path + '?query',
    document.file_path + '%3Fquery',
    encoded,
    encoded.replace('%77', '%2577'),
  ];
  for (const path of aliases) {
    await assert.rejects(
      restricted(peer, tx => insertDocument(tx, documentInput(other, randomUUID(), path))),
      reserved
    );
    await assert.rejects(
      restricted(peer, tx => alias(tx, randomUUID(), path)),
      reserved
    );
  }
  await restricted(peer, async tx => {
    const updated =
      await tx`update documents set deleted_at = now() where id = ${ordinaryId} returning id`;
    assert.equal(updated.length, 1);
  });
  await assert.rejects(
    restricted(
      peer,
      tx => tx`update documents set storage_path = ${document.file_path},
    deleted_at = null where id = ${ordinaryId}`
    ),
    reserved
  );
  await assert.rejects(
    restricted(
      peer,
      tx => tx`insert into documents
    (id, tenant_id, entity_type, entity_id, file_name, mime_type, file_size, storage_path, uploaded_by)
    values (${ordinaryId}, ${homeTenant}, 'claim', ${other.id}, 'Fixture PDF', 'application/pdf', 120, ${assignedPath(other, ordinaryId)}, ${homeActor})
    on conflict (id) do update set storage_path = ${document.file_path}, deleted_at = null`
    ),
    reserved
  );
  const [deleted] =
    await admin`select deleted_at, storage_path from documents where id = ${ordinaryId}`;
  assert.ok(deleted.deleted_at);
  assert.equal(deleted.storage_path, assignedPath(other, ordinaryId));
  await restricted(peer, async tx => {
    const restored =
      await tx`update documents set deleted_at = null where id = ${ordinaryId} returning id`;
    assert.equal(restored.length, 1);
  });
  assert.equal(await attest(admin, document), true);
  await restricted(runtime, tx => publish(tx, document));
  const [count] = await admin`select
    (select count(*)::int from claim_documents where file_path = ${document.file_path}) as ordinary,
    (select count(*)::int from documents where storage_path in ${admin([document.file_path, ...aliases])} or id = ${document.id}) as aliases`;
  assert.deepEqual({ ...count }, { ordinary: 1, aliases: 0 });
}

export async function provePolymorphicAliasMutation(
  { admin, runtime }: Connection,
  mutation: 'rekey' | 'restore' | 'upsert'
) {
  const claim = await insertClaim(admin);
  const id = randomUUID();
  const nextId = randomUUID();
  const canonical = assignedPath(claim, id);
  // Both parent revisions accept the encoded basename, even before a pilot decision exists.
  const encoded = assignedPath(claim, '%77p12-inbound-' + 'a'.repeat(32));
  const insert = (tx: postgres.TransactionSql) => tx`insert into documents
    (id, tenant_id, entity_type, entity_id, file_name, mime_type, file_size, storage_path, uploaded_by)
    values (${id}, ${claim.tenant}, 'claim', ${claim.id}, 'Fixture PDF', 'application/pdf', 120, ${canonical}, ${homeActor})`;
  await restricted(runtime, async tx => {
    await insert(tx);
    if (mutation !== 'rekey') await tx`update documents set deleted_at = now() where id = ${id}`;
  });
  const change = (tx: postgres.TransactionSql, path: string) => {
    switch (mutation) {
      case 'rekey':
        return tx`update documents set id = ${nextId}, storage_path = ${path} where id = ${id} returning id`;
      case 'restore':
        return tx`update documents set deleted_at = null, storage_path = ${path} where id = ${id} returning id`;
      case 'upsert':
        // The insert arm uses an ordinary key. Only the conflict update introduces the alias.
        return tx`insert into documents (id, tenant_id, entity_type, entity_id, file_name, mime_type, file_size, storage_path, uploaded_by)
          values (${id}, ${claim.tenant}, 'claim', ${claim.id}, 'Fixture PDF', 'application/pdf', 120, ${canonical}, ${homeActor})
          on conflict (id) do update set storage_path = ${path}, deleted_at = null returning id`;
    }
  };
  await assert.rejects(
    restricted(runtime, tx => change(tx, encoded)),
    {
      ...reserved,
      message: 'Reserved pilot document refused',
    }
  );
  const [unchanged] =
    await admin`select id, storage_path, deleted_at from documents where id = ${id}`;
  assert.equal(unchanged?.storage_path, canonical);
  assert.equal(unchanged?.deleted_at !== null, mutation !== 'rekey');
  const [control] = await restricted(runtime, tx => change(tx, canonical));
  assert.equal(control?.id, mutation === 'rekey' ? nextId : id);
}

export async function proveOrdinaryPathSegment({ admin, runtime }: Connection) {
  // A case ID can resemble the pilot prefix. The reserved segment is the object file name.
  const claim = await insertClaim(admin, { id: 'wp12-inbound-' + 'a'.repeat(32) + '.pdf' });
  const document = documentInput(claim);
  await restricted(runtime, async tx => {
    await insertDocument(tx, document);
    await tx`insert into documents (id, tenant_id, entity_type, entity_id, file_name, mime_type, file_size, storage_path, uploaded_by)
      values (${randomUUID()}, ${claim.tenant}, 'claim', ${claim.id}, 'Fixture PDF', 'application/pdf', 120, ${document.file_path}, ${homeActor})`;
  });
}
