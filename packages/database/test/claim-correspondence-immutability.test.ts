import assert from 'node:assert/strict';
import test, { type TestContext } from 'node:test';
import {
  createBases,
  documentInput,
  inboundInput,
  insertClaim,
  insertDocument,
  insertEntry,
  insertLink,
  linkInput,
  outboundInput,
  past,
  restricted,
  insertGrant,
  grantInput,
  revoke,
  withRegisterDb,
  type Connection,
} from './claim-correspondence.fixture';

const invalidEntry = { code: 'P1204' };
const conflict = { code: 'P1205' };

test('WP-12 append-only records and deferred link count', async t => {
  await withRegisterDb(t, connections => proveAppendOnly(t, connections));
});

async function proveAppendOnly(t: TestContext, { admin, runtime }: Connection) {
  await t.test(
    'triggers enforce append-only content and commit-time links with table-wide DML',
    async () => {
      const claim = await insertClaim(admin);
      const draft = await insertClaim(admin, { lifecycle: 'draft' });
      const { evidence, another, bases, entry, inbound } = await restricted(runtime, async tx => {
        const evidence = await insertDocument(tx, documentInput(claim));
        const another = await insertDocument(tx, documentInput(claim));
        const bases = await createBases(tx, claim, evidence);
        const entry = await insertEntry(tx, outboundInput(claim, bases, 1));
        await insertLink(tx, linkInput(entry, evidence));
        const inbound = await insertEntry(tx, { ...inboundInput(claim), in_reply_to_id: entry.id });
        return { evidence, another, bases, entry, inbound };
      });
      await assert.rejects(
        restricted(runtime, tx => insertEntry(tx, inboundInput(draft))),
        { code: 'P1201' }
      );
      await assert.rejects(
        restricted(runtime, tx =>
          insertEntry(tx, { ...inboundInput(claim), in_reply_to_id: inbound.id })
        ),
        invalidEntry
      );
      await assert.rejects(
        restricted(runtime, tx =>
          insertEntry(tx, { ...inboundInput(claim), recovery_authority_id: bases.recovery.id })
        ),
        { code: '23514', constraint_name: 'claim_correspondence_inbound_check' }
      );
      let inserted = false;
      await assert.rejects(
        restricted(runtime, async tx => {
          await insertEntry(tx, outboundInput(claim, bases, 1));
          inserted = true;
        }),
        conflict
      );
      assert.ok(inserted, 'parent insert succeeds before the deferred check at commit');

      let linked = false;
      await assert.rejects(
        restricted(runtime, async tx => {
          await insertLink(tx, linkInput(entry, another));
          linked = true;
        }),
        conflict
      );
      assert.ok(linked, 'the later link reaches the commit-time count check');
      for (const [table, where, row, patch, updateError, deleteError] of [
        [
          'claim_authorities',
          'id',
          bases.recovery.id,
          // An otherwise valid first revocation, so only the immutable-column check can refuse it.
          { version: 'changed', revoked_by_user_id: bases.recovery.recorded_by_staff_id },
          conflict,
          invalidEntry,
        ],
        ['claim_correspondence', 'id', entry.id, { body: 'changed' }, conflict, invalidEntry],
        [
          'claim_correspondence_documents',
          'correspondence_id',
          entry.id,
          { document_file_path: 'changed' },
          conflict,
          invalidEntry,
        ],
      ] as const) {
        await assert.rejects(
          restricted(
            runtime,
            tx => tx`update ${tx(table)} set ${tx(patch)} where ${tx(where)} = ${row}`
          ),
          updateError
        );
        await assert.rejects(
          restricted(runtime, tx => tx`delete from ${tx(table)} where ${tx(where)} = ${row}`),
          deleteError
        );
      }

      const [untouched] = await restricted(
        runtime,
        tx => tx`select version, revoked_at, revoked_by_user_id
      from claim_authorities where id = ${bases.recovery.id}`
      );
      assert.deepEqual(untouched, { version: 'v1', revoked_at: null, revoked_by_user_id: null });
      // An insert never carries its own revocation: the revoke guard stamps it with the server clock.
      for (const patch of [
        { revoked_at: past, revoked_by_user_id: claim.user },
        { revoked_at: null, revoked_by_user_id: claim.user },
        { revoked_at: past, revoked_by_user_id: null },
      ]) {
        await assert.rejects(
          restricted(runtime, tx =>
            insertGrant(tx, { ...grantInput(claim, evidence, 'signed_assignment'), ...patch })
          ),
          invalidEntry
        );
      }
      // Positive control: the clean revocation passes.
      await restricted(runtime, tx => revoke(tx, bases.recovery));
      const lateReply = await restricted(runtime, tx =>
        insertEntry(tx, {
          ...inboundInput(claim),
          in_reply_to_id: entry.id,
        })
      );
      assert.equal(lateReply.in_reply_to_id, entry.id);
      const [changed] = await restricted(
        runtime,
        tx => tx`update claim_correspondence set follow_up_at = ${past}
      where id = ${entry.id} returning follow_up_at`
      );
      assert.deepEqual(changed, { follow_up_at: new Date(past) });
      const [links] = await restricted(
        runtime,
        tx => tx`select count(*)::int as total
      from claim_correspondence_documents where correspondence_id = ${entry.id} and claim_document_id = ${evidence.id}`
      );
      assert.equal(links.total, 1);
    }
  );
}
