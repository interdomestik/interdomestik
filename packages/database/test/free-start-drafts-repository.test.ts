import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';

import {
  facts,
  withAuditInsertDenied,
  withRepository,
} from './free-start-drafts-repository.support';

test('C19-C24/C32 free-start repository proof', async t => {
  await withRepository(t, 107, async ({ admin, context, repository: repo, userIds }) => {
    // prettier-ignore
    const create = (owner: string, summary: string = facts.summary, clientRequestId = randomUUID()) => repo.createFreeStartDraft(context(owner), { ...facts, clientRequestId, summary });
    await t.test('C19 create retries are idempotent', async () => {
      const request = randomUUID();
      const results = await Promise.all([
        create(userIds[0]!, facts.summary, request),
        create(userIds[0]!, facts.summary, request),
      ]);
      assert.equal(
        results.every(result => result.ok),
        true
      );
      if (!results[0]?.ok || !results[1]?.ok) return;
      assert.equal(results[0].draft.id, results[1].draft.id);
      assert.deepEqual([results[0].idempotent, results[1].idempotent].sort(), [false, true]);
    });

    await t.test('C20 locking enforces exactly 200 drafts', async () => {
      const results = await Promise.all(Array.from({ length: 201 }, () => create(userIds[1]!)));
      assert.equal(results.filter(result => result.ok).length, 200);
      assert.equal(
        results.filter(result => !result.ok && result.code === 'limitReached').length,
        1
      );
    });

    await t.test('C21 keyset pagination stays stable', async () => {
      await Promise.all(Array.from({ length: 5 }, () => create(userIds[2]!)));
      const first = await repo.listFreeStartDrafts(context(userIds[2]!), { limit: 2 });
      // prettier-ignore
      const second = await repo.listFreeStartDrafts(context(userIds[2]!), { cursor: first.nextCursor, limit: 2 });
      // prettier-ignore
      const third = await repo.listFreeStartDrafts(context(userIds[2]!), { cursor: second.nextCursor, limit: 2 });
      const all = [...first.items, ...second.items, ...third.items];
      assert.equal(all.length, 5);
      assert.equal(new Set(all.map(item => item.id)).size, 5);
    });

    await t.test('C22 resume restores all six facts', async () => {
      const created = await create(userIds[3]!);
      assert.equal(created.ok, true);
      if (!created.ok) return;
      const resumed = await repo.resumeFreeStartDraft(context(userIds[3]!), created.draft.id);
      assert.equal(resumed.ok, true);
      if (!resumed.ok) return;
      const { category, counterparty, desiredOutcome, incidentDate, issueType, summary } =
        resumed.draft;
      // prettier-ignore
      assert.deepEqual([category, counterparty, desiredOutcome, incidentDate, issueType, summary], [facts.category, facts.counterparty, facts.desiredOutcome, facts.incidentDate, facts.issueType, facts.summary]);
    });

    await t.test('C23 one expected version has one winner', async () => {
      const created = await create(userIds[4]!);
      if (!created.ok) return assert.fail('create failed');
      let arrivals = 0;
      let release!: () => void;
      const start = new Promise<void>(resolve => (release = resolve));
      // prettier-ignore
      const update = async (summary: string) => { if (++arrivals === 2) release(); await start; return repo.updateFreeStartDraft(context(userIds[4]!), { ...facts, expectedVersion: 1, id: created.draft.id, summary }); };
      const results = await Promise.all([update('First update.'), update('Second update.')]);
      assert.equal(results.filter(result => result.ok).length, 1);
      assert.deepEqual(
        results.find(result => !result.ok),
        { ok: false, code: 'conflict', latestVersion: 2 }
      );
    });

    await t.test('C24 every lifecycle audit is content-free and atomic', async () => {
      const owner = userIds[5]!;
      const created = await create(owner);
      if (!created.ok) return assert.fail('create failed');
      // prettier-ignore
      const updated = await repo.updateFreeStartDraft(context(owner), { ...facts, expectedVersion: 1, id: created.draft.id, summary: 'Updated facts.' });
      assert.equal(updated.ok, true);
      assert.equal((await repo.resumeFreeStartDraft(context(owner), created.draft.id)).ok, true);
      assert.equal(
        (
          await repo.deleteFreeStartDraft(context(owner), {
            expectedVersion: 2,
            id: created.draft.id,
          })
        ).ok,
        true
      );
      const audits = await admin`
        select "tenant_id", "actor_id", "actor_role", "action", "entity_type", "entity_id", "metadata"
        from "audit_log" where "entity_id" = ${created.draft.id} order by "action"`;
      // prettier-ignore
      assert.deepEqual(audits.map(row => [row.action, row.metadata]), [['free_start_draft.created', { version: 1 }], ['free_start_draft.deleted', { version: 2 }], ['free_start_draft.resumed', { version: 2 }], ['free_start_draft.updated', { version: 2 }]]);
      // prettier-ignore
      assert.equal(audits.every(row => row.tenant_id === context(owner).tenantId && row.actor_id === owner && row.actor_role === 'member' && row.entity_type === 'free_start_draft' && row.entity_id === created.draft.id), true);

      const rollback = await create(owner, 'Rollback baseline.');
      if (!rollback.ok) return assert.fail('rollback create failed');
      const failedRequest = randomUUID();
      await withAuditInsertDenied(admin, async () => {
        await assert.rejects(create(owner, 'Must roll back.', failedRequest));
        // prettier-ignore
        await assert.rejects(repo.updateFreeStartDraft(context(owner), { ...facts, expectedVersion: 1, id: rollback.draft.id, summary: 'Must roll back.' }));
        await assert.rejects(repo.resumeFreeStartDraft(context(owner), rollback.draft.id));
        await assert.rejects(
          repo.deleteFreeStartDraft(context(owner), { expectedVersion: 1, id: rollback.draft.id })
        );
      });
      const [row] =
        await admin`select "summary", "version" from "free_start_drafts" where "id" = ${rollback.draft.id}`;
      assert.deepEqual(row, { summary: 'Rollback baseline.', version: 1 });
      assert.equal(
        (
          await admin`select "id" from "free_start_drafts" where "client_request_id" = ${failedRequest}`
        ).length,
        0
      );
    });

    await t.test('C32 isolates 101 owners behind one latch', async () => {
      const owners = userIds.slice(6);
      let release!: () => void;
      const start = new Promise<void>(resolve => (release = resolve));
      const creates = owners.map(async (owner, index) => {
        await start;
        return create(owner, `isolated owner ${index}`);
      });
      release();
      assert.equal((await Promise.all(creates)).filter(result => result.ok).length, 101);
      const pages = await Promise.all(
        owners.map(owner => repo.listFreeStartDrafts(context(owner)))
      );
      assert.equal(
        pages.every(page => page.items.length === 1),
        true
      );
      assert.equal(new Set(pages.flatMap(page => page.items.map(item => item.id))).size, 101);
    });
  });
});
