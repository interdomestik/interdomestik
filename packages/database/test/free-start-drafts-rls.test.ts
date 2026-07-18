import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { KS_TENANT_ID, MK_TENANT_ID, withRlsFixture } from './free-start-drafts-rls.support';
test('C14-C18 free-start owner/access RLS and lifecycle proof', async t => {
  await withRlsFixture(t, async h => {
    const { admin, auditId, draftOne, draftTwo, ownerOne, ownerTwo, rls, rlsDraft } = h;
    await t.test(
      'C14 missing context denies; actor RLS survives omitted owner predicate',
      async () => {
        assert.equal((await rls`select "id" from "free_start_drafts"`).length, 0);
        assert.equal(
          (await rls`update "free_start_drafts" set "resume_step" = 'details' returning "id"`)
            .length,
          0
        );
        assert.equal((await rls`delete from "free_start_drafts" returning "id"`).length, 0);
        await assert.rejects(rls`insert into "free_start_drafts" (
          "id", "tenant_id", "access_tenant_id", "owner_user_id", "client_request_id",
          "category", "resume_step"
        ) values (${randomUUID()}, ${KS_TENANT_ID}, ${KS_TENANT_ID}, ${ownerOne}, ${randomUUID()}, 'vehicle', 'category')`);
        const rows = await rls.begin(async tx => {
          await tx`select set_config('app.current_tenant_id', ${KS_TENANT_ID}, true)`;
          await tx`select set_config('app.current_access_tenant_id', ${KS_TENANT_ID}, true)`;
          await tx`select set_config('app.current_actor_id', ${ownerOne}, true)`;
          return tx`select "id" from "free_start_drafts" where "access_tenant_id" = ${KS_TENANT_ID}`;
        });
        assert.deepEqual(
          rows.map(row => row.id),
          [draftOne]
        );
      }
    );

    await t.test('C15 same-tenant peers cannot read or forge another owner row', async () => {
      await rls.begin(async tx => {
        await tx`select set_config('app.current_tenant_id', ${KS_TENANT_ID}, true)`;
        await tx`select set_config('app.current_access_tenant_id', ${KS_TENANT_ID}, true)`;
        await tx`select set_config('app.current_actor_id', ${ownerTwo}, true)`;
        assert.deepEqual(
          (await tx`select "id" from "free_start_drafts"`).map(row => row.id),
          [draftTwo]
        );
        assert.equal(
          (
            await tx`update "free_start_drafts" set "resume_step" = 'details' where "id" = ${draftOne} returning "id"`
          ).length,
          0
        );
        assert.equal(
          (await tx`delete from "free_start_drafts" where "id" = ${draftOne} returning "id"`)
            .length,
          0
        );
        await assert.rejects(
          tx.savepoint(
            savepoint => savepoint`
          insert into "free_start_drafts" (
            "id", "tenant_id", "access_tenant_id", "owner_user_id", "client_request_id",
            "category", "resume_step"
          ) values (${randomUUID()}, ${KS_TENANT_ID}, ${KS_TENANT_ID}, ${ownerOne}, ${randomUUID()}, 'vehicle', 'category')
        `
          )
        );
      });
    });

    await t.test('C16 cross-tenant denial and correct-owner CRUD', async () => {
      await rls.begin(async tx => {
        await tx`select set_config('app.current_tenant_id', ${KS_TENANT_ID}, true)`;
        await tx`select set_config('app.current_access_tenant_id', ${KS_TENANT_ID}, true)`;
        await tx`select set_config('app.current_actor_id', ${ownerOne}, true)`;
        await tx`insert into "free_start_drafts" (
          "id", "tenant_id", "access_tenant_id", "owner_user_id", "client_request_id",
          "category", "resume_step"
        ) values (${rlsDraft}, ${KS_TENANT_ID}, ${KS_TENANT_ID}, ${ownerOne}, ${randomUUID()}, 'vehicle', 'category')`;
        await tx`update "free_start_drafts" set "resume_step" = 'details' where "id" = ${rlsDraft}`;
        assert.equal(
          (await tx`select "resume_step" from "free_start_drafts" where "id" = ${rlsDraft}`)[0]
            ?.resume_step,
          'details'
        );
        await tx`delete from "free_start_drafts" where "id" = ${rlsDraft}`;
      });
      const crossTenant = await rls.begin(async tx => {
        await tx`select set_config('app.current_tenant_id', ${MK_TENANT_ID}, true)`;
        await tx`select set_config('app.current_access_tenant_id', ${MK_TENANT_ID}, true)`;
        await tx`select set_config('app.current_actor_id', ${ownerOne}, true)`;
        const read = await tx`select "id" from "free_start_drafts" where "id" = ${draftOne}`;
        const update =
          await tx`update "free_start_drafts" set "resume_step" = 'details' where "id" = ${draftOne} returning "id"`;
        const remove =
          await tx`delete from "free_start_drafts" where "id" = ${draftOne} returning "id"`;
        await assert.rejects(
          tx.savepoint(
            savepoint => savepoint`
            insert into "free_start_drafts" (
              "id", "tenant_id", "access_tenant_id", "owner_user_id", "client_request_id",
              "category", "resume_step"
            ) values (${randomUUID()}, ${KS_TENANT_ID}, ${KS_TENANT_ID}, ${ownerOne}, ${randomUUID()}, 'vehicle', 'category')
          `
          )
        );
        return { read, remove, update };
      });
      assert.deepEqual(
        Object.fromEntries(Object.entries(crossTenant).map(([key, rows]) => [key, rows.length])),
        { read: 0, remove: 0, update: 0 }
      );
    });

    await t.test('C17 owner FK retains default no-action user-delete behavior', async () => {
      await assert.rejects(admin`delete from "user" where "id" = ${ownerOne}`, error => {
        const failure = error as { code?: string; constraint_name?: string };
        return (
          failure.code === '23503' &&
          failure.constraint_name === 'free_start_drafts_owner_user_id_user_id_fk'
        );
      });
      assert.equal(
        (
          await admin`select count(*)::int as count from "free_start_drafts" where "id" = ${draftOne}`
        )[0]?.count,
        1
      );
    });

    await t.test('C18 content-free audit shape under actor/access context', async () => {
      await rls.begin(async tx => {
        await tx`select set_config('app.current_tenant_id', ${KS_TENANT_ID}, true)`;
        await tx`select set_config('app.current_access_tenant_id', ${KS_TENANT_ID}, true)`;
        await tx`select set_config('app.current_actor_id', ${ownerOne}, true)`;
        await tx`insert into "audit_log" (
          "id", "tenant_id", "actor_id", "actor_role", "action", "entity_type", "entity_id", "metadata"
        ) values (${auditId}, ${KS_TENANT_ID}, ${ownerOne}, 'member', 'free_start_draft.created', 'free_start_draft', ${draftOne}, ${tx.json({ version: 1 })})`;
      });
      const [audit] =
        await admin`select "tenant_id", "actor_id", "actor_role", "action", "entity_type", "entity_id", "metadata" from "audit_log" where "id" = ${auditId}`;
      assert.deepEqual(audit, {
        tenant_id: KS_TENANT_ID,
        actor_id: ownerOne,
        actor_role: 'member',
        action: 'free_start_draft.created',
        entity_type: 'free_start_draft',
        entity_id: draftOne,
        metadata: { version: 1 },
      });
    });
  });
});
