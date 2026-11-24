import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

import {
  makeVerification,
  insertVerification,
} from '../../database/test/exchange-rate-verifications.fixture';
import {
  setRateVerificationLimit,
  withPaymentPortReleaseClient,
} from '../../database/test/exchange-rates-release.fixture';
import {
  firstRate,
  migratePaymentPortPhase,
  rateInput,
  restricted,
  runtimeRole,
  scratchServerMissing,
  withExchangeRateFixture,
} from '../../database/test/exchange-rates.fixture';
import { quoteIdentifier } from '../../database/test/rls-test-connection';

test('upgrades 0104 through expand and contract on PostgreSQL 16', async t => {
  const missing = scratchServerMissing('REQUIRE_RLS_INTEGRATION');
  if (missing) return t.skip(missing);
  await withExchangeRateFixture(async f => {
    await f.admin.unsafe(
      `grant select, update (id) on legal_entities to ${quoteIdentifier(runtimeRole)}`
    );
    const original = await makeVerification(f, f.tenantId, f.actor.id);
    await restricted(f.peer, f.tenantId, tx => insertVerification(tx, original));
    // The old writer ran with the limit removed throughout expand.
    await withPaymentPortReleaseClient(f.admin, client =>
      setRateVerificationLimit(client, {
        tenantId: f.tenantId,
        maxAgeSeconds: null,
        operationId: randomUUID(),
        approvalReference: 'finance/wp07-upgrade-test',
        releaseIdentity: 'test-release',
      })
    );

    await migratePaymentPortPhase(f.admin, 'expand');
    const useWeeklyTarget = (day: string) =>
      restricted(
        f.peer,
        f.tenantId,
        tx => tx`
        insert into exchange_rates ${tx(firstRate(f.tenantId, original.book_id, day))}
        on conflict (tenant_id, book_id, week_starts_on, revision) do nothing
        returning id`
      );
    assert.equal((await useWeeklyTarget('2099-12-28')).length, 1);
    assert.equal((await useWeeklyTarget('2099-12-29')).length, 0);
    const legacyOnExpand = { ...original, id: randomUUID(), operation_key: randomUUID() };
    await restricted(f.peer, f.tenantId, tx => insertVerification(tx, legacyOnExpand));

    const { recordExchangeRate, recordRateVerification } = await import('../src/payment-port');
    assert.deepEqual(await recordExchangeRate(f.authority, rateInput('2099-12-29'), f.actor), {
      ok: false,
      code: 'conflict',
    });
    const legacyInput = {
      legalEntityId: original.legal_entity_id,
      rateId: original.rate_id,
      observedRate: original.observed_rate,
      sourceRef: original.source_ref,
      operationKey: original.operation_key,
    };
    const replay = await recordRateVerification(f.authority, legacyInput, f.actor);
    assert.ok(replay.ok);
    assert.equal(replay.verification.id, original.id);
    assert.equal(replay.verification.checkId, null);

    // M5 sets this to a pinned source archive with its own installed package graph.
    // The CI scratch lane also exercises the old SQL conflict target using its shallow checkout.
    const legacyRoot = process.env.WP07_LEGACY_SOURCE;
    if (legacyRoot) {
      const fromArchive = (relativePath: string) =>
        import(pathToFileURL(join(legacyRoot, relativePath)).href);
      const old = await fromArchive('packages/domain-membership-billing/src/payment-port.ts');
      const { paymentPortTestSession } = await fromArchive(
        'packages/database/test/exchange-rates.fixture.ts'
      );
      const session = paymentPortTestSession(f.tenantId, f.actor.id, 'tenant_admin');
      const deniedSession = paymentPortTestSession(f.tenantId, f.actor.id, 'staff');
      assert.deepEqual(
        await old.recordExchangeRate(deniedSession, rateInput('2099-12-30'), f.actor),
        { ok: false, code: 'forbidden' }
      );
      assert.equal(
        (await old.recordExchangeRate(session, rateInput('2100-01-05'), f.actor)).ok,
        true
      );
      assert.deepEqual(await old.recordExchangeRate(session, rateInput('2100-01-06'), f.actor), {
        ok: false,
        code: 'conflict',
      });
      assert.equal(
        (
          await old.recordRateVerification(
            session,
            { ...legacyInput, operationKey: randomUUID() },
            f.actor
          )
        ).ok,
        true
      );
    }

    await migratePaymentPortPhase(f.admin, 'contract');
    await assert.rejects(useWeeklyTarget('2099-12-30'), { code: '42P10' });
    await assert.rejects(
      restricted(f.peer, f.tenantId, tx =>
        insertVerification(tx, {
          ...legacyOnExpand,
          id: randomUUID(),
          operation_key: randomUUID(),
        })
      ),
      { code: '23514', constraint_name: 'exchange_rate_verifications_check_required' }
    );
    const compatible = await recordExchangeRate(f.authority, rateInput('2099-12-29'), f.actor);
    assert.ok(compatible.ok);
    assert.equal(compatible.rate.revision, 1);
    assert.equal(compatible.rate.weekStartsOn, '2099-12-28');
    const rows = await restricted(
      f.peer,
      f.tenantId,
      tx => tx`
      select effective_on::text, revision from exchange_rates
      where book_id = ${original.book_id} and week_starts_on = '2099-12-28'
      order by effective_on`
    );
    assert.deepEqual(
      [...rows],
      [
        { effective_on: '2099-12-28', revision: 1 },
        { effective_on: '2099-12-29', revision: 1 },
      ]
    );
    assert.deepEqual(await recordRateVerification(f.authority, legacyInput, f.actor), replay);
  }, '0104');
});
