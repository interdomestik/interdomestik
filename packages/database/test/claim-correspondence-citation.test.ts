import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test, { type TestContext } from 'node:test';

import {
  foreignKey,
  isolationLevels,
  restricted,
  type Connection,
  createBases,
  documentInput,
  foreignTenant,
  grantInput,
  homeTenant,
  insertClaim,
  insertDocument,
  insertEntry,
  insertGrant,
  insertLink,
  linkInput,
  outboundInput,
  withRegisterDb,
} from './claim-correspondence.fixture';

const frozen = { code: 'P1203' };
const evidenceFk = 'claim_authorities_evidence_document_fk';
const sentFk = 'claim_correspondence_documents_document_fk';

test('WP-12 cited documents keep their identity and storage coordinates', async t => {
  await withRegisterDb(t, connections => proveCitations(t, connections));
});

async function proveCitations(t: TestContext, connections: Connection) {
  const { admin, runtime } = connections;

  await t.test('runtime cannot create a trigger or set replication mode', async () => {
    const [acl] = await runtime`select
      has_table_privilege(current_user, 'public.claim_documents', 'TRIGGER') as can_trigger,
      has_parameter_privilege(current_user, 'session_replication_role', 'SET') as can_set_replication_role`;
    assert.deepEqual(acl, { can_trigger: false, can_set_replication_role: false });
    await assert.rejects(runtime`set session_replication_role = replica`, { code: '42501' });
  });

  await t.test(
    'claim document guards are enabled AFTER ROW triggers for the expected events',
    async () => {
      const triggers = await admin`
      select tgname, tgenabled, (tgtype & 2) = 0 as after_trigger, (tgtype & 1) = 1 as row_trigger,
        (tgtype & 4) = 4 as on_insert, (tgtype & 16) = 16 as on_update
      from pg_trigger
      where tgrelid = 'public.claim_documents'::regclass and not tgisinternal
      order by tgname`;
      assert.deepEqual(
        triggers.map(row => [
          row.tgname,
          row.tgenabled,
          row.after_trigger,
          row.row_trigger,
          row.on_insert,
          row.on_update,
        ]),
        [
          ['claim_documents_coordinates_frozen', 'O', true, true, false, true],
          ['claim_inbound_document_home_guard', 'O', true, true, true, false],
          ['claim_inbound_document_publication_guard', 'O', true, true, true, false],
          ['claim_inbound_document_scope_guard', 'O', true, true, false, true],
          ['claim_inbound_staff_scope_guard', 'O', true, true, true, false],
        ]
      );
    }
  );

  await proveFreeze(t, connections);
  await proveRestrictedIdentity(t, connections);
  await proveFinalCopies(t, connections);
}

async function proveFreeze(t: TestContext, { admin, runtime }: Connection) {
  await t.test(
    'storage coordinates are frozen for cited and uncited rows, home and access-tenant writers',
    async () => {
      const claim = await insertClaim(admin);
      const { evidence, sent, uncited } = await restricted(runtime, async tx => {
        const evidence = await insertDocument(tx, documentInput(claim));
        const sent = await insertDocument(tx, documentInput(claim));
        const uncited = await insertDocument(tx, documentInput(claim));
        const bases = await createBases(tx, claim, evidence);
        const entry = await insertEntry(tx, outboundInput(claim, bases, 1));
        await insertLink(tx, linkInput(entry, sent));
        return { evidence, sent, uncited };
      });

      for (const isolation of isolationLevels) {
        // The r6 B1 shape: an access-tenant writer can reach the home tenant's documents.
        for (const home of [homeTenant, foreignTenant]) {
          const scope = { home, access: homeTenant, isolation };
          for (const document of [evidence, sent, uncited]) {
            for (const patch of [
              { bucket: 'other-bucket' },
              { file_path: `${document.file_path}.changed` },
            ]) {
              await assert.rejects(
                restricted(
                  runtime,
                  tx => tx`update claim_documents set ${tx(patch)} where id = ${document.id}`,
                  scope
                ),
                frozen,
                `${home}, ${isolation}: ${Object.keys(patch).join()} of ${document.id}`
              );
            }
          }
          // Positive control: a non-coordinate column stays editable on a cited row.
          const name = `Renamed ${isolation} ${home}`;
          const renamed = await restricted(
            runtime,
            tx => tx`update claim_documents set name = ${name}
              where id = ${evidence.id} returning name`,
            scope
          );
          assert.deepEqual([...renamed], [{ name }]);
        }
      }
    }
  );

  await t.test(
    'identity changes are refused: by the freeze, or by RESTRICT when cited',
    async () => {
      const claim = await insertClaim(admin);
      const otherClaim = await insertClaim(admin);
      const foreignClaim = await insertClaim(admin, { tenant: foreignTenant });
      const { evidence, uncited } = await restricted(runtime, async tx => {
        const evidence = await insertDocument(tx, documentInput(claim));
        const uncited = await insertDocument(tx, documentInput(claim));
        await createBases(tx, claim, evidence);
        return { evidence, uncited };
      });
      // The owner bypasses RLS, so only the trigger and the keys can refuse these updates.
      await assert.rejects(
        admin`update claim_documents set tenant_id = ${foreignTenant} where id = ${uncited.id}`,
        frozen,
        'uncited tenant_id only'
      );
      for (const patch of [
        { claim_id: otherClaim.id },
        { tenant_id: foreignTenant, claim_id: foreignClaim.id },
        { id: randomUUID() },
      ]) {
        const columns = Object.keys(patch).join();
        await assert.rejects(
          admin`update claim_documents set ${admin(patch)} where id = ${uncited.id}`,
          frozen,
          `uncited ${columns}`
        );
        await assert.rejects(
          admin`update claim_documents set ${admin(patch)} where id = ${evidence.id}`,
          foreignKey(evidenceFk),
          `cited ${columns}`
        );
      }
    }
  );
}

async function proveRestrictedIdentity(t: TestContext, { admin, runtime }: Connection) {
  await t.test('a cited document cannot be replaced under the same key', async () => {
    const claim = await insertClaim(admin);
    const { evidence, sent, uncited } = await restricted(runtime, async tx => {
      const evidence = await insertDocument(tx, documentInput(claim));
      const sent = await insertDocument(tx, documentInput(claim));
      const uncited = await insertDocument(tx, documentInput(claim));
      const bases = await createBases(tx, claim, evidence);
      const entry = await insertEntry(tx, outboundInput(claim, bases, 1));
      await insertLink(tx, linkInput(entry, sent));
      return { evidence, sent, uncited };
    });

    for (const [document, constraint] of [
      [evidence, evidenceFk],
      [sent, sentFk],
    ] as const) {
      // One statement: NO ACTION would accept the replacement at statement end; RESTRICT does not.
      await assert.rejects(
        restricted(
          runtime,
          tx => tx`with removed as (
            delete from claim_documents where id = ${document.id} returning *
          )
          insert into claim_documents (id, tenant_id, claim_id, name, file_path, file_type,
            file_size, bucket, uploaded_by)
          select id, tenant_id, claim_id, name, file_path || '.replaced', file_type, file_size,
            bucket, uploaded_by
          from removed`
        ),
        foreignKey(constraint),
        `one statement: ${constraint}`
      );
      // Two statements of one transaction.
      await assert.rejects(
        restricted(runtime, async tx => {
          await tx`delete from claim_documents where id = ${document.id}`;
          await insertDocument(tx, { ...document, file_path: `${document.file_path}.replaced` });
        }),
        foreignKey(constraint),
        `two statements: ${constraint}`
      );
      const kept = await admin`select file_path from claim_documents where id = ${document.id}`;
      assert.deepEqual([...kept], [{ file_path: document.file_path }]);
    }

    // Positive control: an uncited document can still be deleted where the grants allow it.
    const removed = await restricted(
      runtime,
      tx => tx`delete from claim_documents where id = ${uncited.id} returning id`
    );
    assert.deepEqual([...removed], [{ id: uncited.id }]);
  });
}

async function proveFinalCopies(t: TestContext, { admin, runtime }: Connection) {
  await t.test(
    'the final citing row must still copy its document after every BEFORE INSERT trigger',
    async () => {
      const claim = await insertClaim(admin);
      const { evidence, bases, sent } = await restricted(runtime, async tx => {
        const evidence = await insertDocument(tx, documentInput(claim));
        const sent = await insertDocument(tx, documentInput(claim));
        return { evidence, sent, bases: await createBases(tx, claim, evidence) };
      });
      const tables = ['claim_authorities', 'claim_correspondence_documents'];
      await admin.unsafe(`
        create function public.wp12_test_change_copy() returns trigger language plpgsql as $$
        begin
          if tg_table_name = 'claim_authorities' then
            new.evidence_file_path := new.evidence_file_path || '.changed';
          else
            new.document_file_path := new.document_file_path || '.changed';
          end if;
          return new;
        end $$`);
      try {
        for (const table of tables) {
          // "zzz" sorts after every guard, so it runs after the BEFORE INSERT validation.
          await admin.unsafe(`create trigger zzz_wp12_test_change_copy before insert
            on public.${table} for each row execute function public.wp12_test_change_copy()`);
        }
        await assert.rejects(
          restricted(runtime, tx =>
            insertGrant(tx, grantInput(claim, evidence, 'signed_assignment'))
          ),
          frozen,
          'authority evidence copy'
        );
        await assert.rejects(
          restricted(runtime, async tx => {
            const entry = await insertEntry(tx, outboundInput(claim, bases, 1));
            await insertLink(tx, linkInput(entry, sent));
          }),
          frozen,
          'sent document copy'
        );
      } finally {
        for (const table of tables) {
          await admin.unsafe(`drop trigger if exists zzz_wp12_test_change_copy on public.${table}`);
        }
        await admin.unsafe('drop function public.wp12_test_change_copy()');
      }
      // Positive control: without the test trigger the same citations are accepted.
      await restricted(runtime, async tx => {
        await insertGrant(tx, grantInput(claim, evidence, 'signed_assignment'));
        const entry = await insertEntry(tx, outboundInput(claim, bases, 1));
        await insertLink(tx, linkInput(entry, sent));
      });
    }
  );
}
