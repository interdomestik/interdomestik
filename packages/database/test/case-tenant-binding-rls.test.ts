import assert from 'node:assert/strict';
import test from 'node:test';

import {
  childRows,
  documentKey,
  evidenceTables,
  homeKey,
  insertChild,
  storedChild,
  withEvidenceDocument,
  type ChildTable,
} from './case-tenant-binding.fixture';
import {
  documentInput,
  foreignKey,
  foreignTenant,
  homeTenant,
  insertClaim,
  insertDocument,
  restricted,
  withRegisterDb,
} from './claim-correspondence.fixture';
import { waitForLockWaiters } from './exchange-rates-lock.fixture';
import { quoteIdentifier } from './rls-test-connection';

test('case children bind to the home of their case and evidence document', async t => {
  await withRegisterDb(t, async ({ admin, runtime, peer, role }) => {
    const ownedCase = await insertClaim(admin);
    const localCase = await insertClaim(admin, { tenant: foreignTenant });
    const localDocument = await insertDocument(admin, documentInput(localCase));
    const delegatedDocument = {
      ...documentInput(ownedCase),
      access_tenant_id: foreignTenant,
    };
    await admin`update public.claim set access_tenant_id = ${foreignTenant}
                where id = ${ownedCase.id}`;

    const denied = childRows({ ...localCase, id: ownedCase.id }, localDocument.id);
    const valid = withEvidenceDocument(localCase, localDocument.id);
    const tables = Object.keys(valid) as ChildTable[];
    // Fixture ACLs expose the inserts to this disposable login so production row policies run.
    await admin.unsafe(`grant insert on table ${tables.join(', ')} to ${quoteIdentifier(role)}`);

    const scope = { home: foreignTenant };
    const relations: string[] = [...tables, 'claim'];
    const [posture] = await restricted(
      runtime,
      tx => tx`
        select current_user as role, current_user = session_user as direct_login,
               current_setting('row_security') = 'on' as row_security,
               current_setting('app.current_tenant_id') as home,
               current_setting('app.current_access_tenant_id') as access,
               rolcanlogin, rolsuper, rolbypassrls,
               (select bool_or(pg_has_role(c.relowner, 'MEMBER'))
                from pg_class c join pg_namespace n on c.relnamespace = n.oid
                where n.nspname = 'public' and c.relname in ${tx(relations)}) as owns_table
        from pg_roles where rolname = current_user`,
      scope
    );
    assert.deepEqual(posture, {
      role,
      direct_login: true,
      row_security: true,
      home: foreignTenant,
      access: foreignTenant,
      rolcanlogin: true,
      rolsuper: false,
      rolbypassrls: false,
      owns_table: false,
    });

    for (const table of tables) {
      await t.test(`${table} refuses a foreign case and accepts a same-home case`, async () => {
        const failure = restricted(runtime, tx => insertChild(tx, table, denied[table]), scope);
        if (table === 'claim_information_requests') {
          await assert.rejects(failure, {
            code: '42501',
            message: /row-level security policy for table "claim_information_requests"/u,
          });
          await assert.rejects(
            insertChild(admin, table, denied[table]),
            foreignKey(homeKey(table))
          );
        } else if (table === 'claim_document_ai_extraction_consents') {
          // A valid document cannot match a case with a wrong home. Either FK may refuse first.
          // The populated upgrade test isolates the case FK using a matching legacy document.
          await assert.rejects(failure, (error: { code: string; constraint_name: string }) => {
            assert.equal(error.code, '23503');
            assert.ok([homeKey(table), documentKey(table)].includes(error.constraint_name));
            return true;
          });
        } else {
          await assert.rejects(failure, foreignKey(homeKey(table)));
        }
        assert.equal(await storedChild(admin, table, denied[table].id), undefined);

        await restricted(runtime, tx => insertChild(tx, table, valid[table]), scope);
        assert.ok(await storedChild(admin, table, valid[table].id));
      });
    }

    await t.test('evidence refuses a document from another case in the same tenant', async () => {
      const otherCase = await insertClaim(admin, { tenant: foreignTenant });
      const wrong = withEvidenceDocument(otherCase, localDocument.id);
      const matchingDocument = await insertDocument(admin, documentInput(otherCase));
      const matching = withEvidenceDocument(otherCase, matchingDocument.id);
      for (const table of evidenceTables) {
        await assert.rejects(
          restricted(runtime, tx => insertChild(tx, table, wrong[table]), scope),
          foreignKey(documentKey(table))
        );
        assert.equal(await storedChild(admin, table, wrong[table].id), undefined);
        await restricted(runtime, tx => insertChild(tx, table, matching[table]), scope);
        assert.ok(await storedChild(admin, table, matching[table].id));
      }
    });

    await t.test(
      'a case-less handoff and evidence without a source document can commit',
      async () => {
        const anotherCase = await insertClaim(admin, { tenant: foreignTenant });
        const rows = childRows(anotherCase, localDocument.id);
        const handoff = { ...rows.support_handoffs, claim_id: null };
        await restricted(
          runtime,
          async tx => {
            await insertChild(tx, 'support_handoffs', handoff);
            await insertChild(tx, 'claim_transition_evidence', rows.claim_transition_evidence);
          },
          scope
        );
        assert.equal(
          (await storedChild(admin, 'support_handoffs', handoff.id))?.row.claim_id,
          null
        );
        assert.equal(
          (await storedChild(admin, 'claim_transition_evidence', rows.claim_transition_evidence.id))
            ?.row.source_document_id,
          null
        );
      }
    );

    await t.test(
      'delegated access reads the document at its home storage coordinates',
      async () => {
        await restricted(runtime, tx => insertChild(tx, 'claim_documents', delegatedDocument));
        const visible = await restricted(
          runtime,
          tx => tx`
          select d.tenant_id, d.access_tenant_id, d.bucket, d.file_path
          from public.claim_documents d join public.claim c on c.id = d.claim_id
          where d.id = ${delegatedDocument.id}`,
          scope
        );
        assert.deepEqual(
          [...visible],
          [
            {
              tenant_id: homeTenant,
              access_tenant_id: foreignTenant,
              bucket: delegatedDocument.bucket,
              file_path: delegatedDocument.file_path,
            },
          ]
        );
        assert.ok(visible[0].file_path.startsWith(`pii/tenants/${homeTenant}/claims/`));
      }
    );

    await t.test('a competing parent rekey waits and fails after a child commits', async () => {
      const claim = await insertClaim(admin, { tenant: foreignTenant });
      const message = childRows(claim, localDocument.id).claim_messages;
      let rekey: Promise<void> | undefined;
      try {
        await restricted(
          runtime,
          async tx => {
            const [{ pid }] = await tx<{ pid: number }[]>`select pg_backend_pid() as pid`;
            await insertChild(tx, 'claim_messages', message);
            rekey = assert.rejects(
              admin.begin(async other => {
                await other`set local statement_timeout = '8s'`;
                await other`update public.claim set tenant_id = ${homeTenant} where id = ${claim.id}`;
              }),
              foreignKey(homeKey('claim_messages'))
            );
            await Promise.race([
              waitForLockWaiters(peer, pid, 1),
              rekey.then(() => assert.fail('the rekey finished before the child committed')),
            ]);
          },
          scope
        );
        await rekey;
      } finally {
        await Promise.allSettled([rekey]);
      }
      const [parent] = await admin`select tenant_id from public.claim where id = ${claim.id}`;
      assert.equal(parent.tenant_id, foreignTenant);
      assert.equal(
        (await storedChild(admin, 'claim_messages', message.id))?.row.tenant_id,
        foreignTenant
      );
    });
  });
});
