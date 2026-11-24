import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { realpathSync } from 'node:fs';
import test from 'node:test';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { legacyRevision } from '../../../scripts/ci/run-wp07-legacy-upgrade.mjs';

import {
  makeVerification,
  insertVerification,
} from '../../database/test/exchange-rate-verifications.fixture';
import {
  setRateVerificationLimit,
  withPaymentPortReleaseClient,
} from '../../database/test/exchange-rates-release.fixture';
import {
  migratePaymentPortPhase,
  rateInput,
  restricted,
  runtimeRole,
  scratchServerMissing,
  withExchangeRateFixture,
} from '../../database/test/exchange-rates.fixture';
import { seedSalePlan } from '../../database/test/exchange-rates-sale.fixture';
import type { SaleInput } from '../src/port/sale-input';
import { quoteIdentifier } from '../../database/test/rls-test-connection';

function requireLegacySource(source: string | undefined) {
  assert.ok(source, 'WP07_LEGACY_SOURCE must name the pinned old checkout');
  const root = realpathSync(source);
  const git = (...args: string[]) =>
    execFileSync('git', ['-C', root, ...args], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  assert.equal(realpathSync(git('rev-parse', '--show-toplevel')), root);
  assert.equal(
    git('rev-parse', 'HEAD'),
    legacyRevision,
    'WP07_LEGACY_SOURCE has the wrong revision'
  );
  assert.ok(
    !git('status', '--porcelain', '--untracked-files=all'),
    'The old checkout must be clean'
  );
  for (const name of ['database', 'shared-auth']) {
    const dependency = join(
      root,
      'packages/domain-membership-billing/node_modules/@interdomestik',
      name
    );
    assert.equal(
      realpathSync(dependency),
      join(root, 'packages', name),
      `The old Billing port must use its own ${name} package`
    );
  }
  return root;
}

test('upgrades 0104 through expand and contract on PostgreSQL 16', async t => {
  const legacyRoot = requireLegacySource(process.env.WP07_LEGACY_SOURCE);
  const missing = scratchServerMissing('REQUIRE_RLS_INTEGRATION');
  if (missing) return t.skip(missing);
  await withExchangeRateFixture(async f => {
    const { admin, tenantId, actor } = f;
    const [{ version }] = await admin<{ version: string }[]>`
      select current_setting('server_version_num') as version`;
    assert.equal(Math.floor(Number(version) / 10000), 16);
    await admin.unsafe(`grant select, update (id) on legal_entities, membership_plans, "user"
      to ${quoteIdentifier(runtimeRole)}`);
    await admin.unsafe(`grant select on subscriptions, sponsor_terms, sponsor_term_revisions,
      sponsor_revision_decisions, sponsor_roster_entries, sponsor_handover_intents
      to ${quoteIdentifier(runtimeRole)}`);
    await admin.unsafe(`grant update (status) on subscriptions to ${quoteIdentifier(runtimeRole)}`);
    await admin.unsafe(`grant update (id) on sponsor_terms, sponsor_roster_entries
      to ${quoteIdentifier(runtimeRole)}`);

    const fromLegacy = <T>(relativePath: string): Promise<T> =>
      import(pathToFileURL(join(legacyRoot, relativePath)).href);
    const old = await fromLegacy<typeof import('../src/payment-port')>(
      'packages/domain-membership-billing/src/payment-port.ts'
    );
    const oldCompose = await fromLegacy<typeof import('../src/payment-port-compose')>(
      'packages/domain-membership-billing/src/payment-port-compose.ts'
    );
    const oldFixtures = await fromLegacy<
      typeof import('../../database/test/exchange-rates.fixture')
    >('packages/database/test/exchange-rates.fixture.ts');
    const oldContext = await fromLegacy<
      typeof import('../../database/src/tenant-authority-context')
    >('packages/database/src/tenant-authority-context.ts');
    const session = oldFixtures.paymentPortTestSession(tenantId, actor.id, 'tenant_admin');
    const deniedSession = oldFixtures.paymentPortTestSession(tenantId, actor.id, 'staff');
    const original = await makeVerification(f, tenantId, actor.id);
    const [legacyVerification] = await restricted(f.peer, tenantId, tx =>
      insertVerification(tx, original)
    );
    assert.deepEqual(legacyVerification, { server_stamp: true });
    const { planId, buyerId } = await admin.begin(tx => seedSalePlan(tx, f));
    const offer = await old.getSaleOffer(session, { planId }, actor);
    assert.ok(offer.ok);
    const saleInput: SaleInput = {
      buyer: { memberUserId: buyerId },
      planVersionId: offer.offer.planVersionId,
      termsVersion: offer.offer.termsVersion,
      rateId: offer.offer.rateId,
      amountMkdMinor: offer.offer.amountMkdMinor,
      channel: 'cash',
      operationKey: randomUUID(),
    };
    const storedSale = await old.recordSale(session, saleInput, actor);
    assert.ok(storedSale.ok);
    const freshBuyerId = randomUUID();
    await admin`insert into "user" (id, tenant_id, name, email, "emailVerified", role, "createdAt", "updatedAt")
      values (${freshBuyerId}, ${tenantId}, 'Test buyer', ${freshBuyerId + '@example.test'}, true, 'member', now(), now())`;
    const fresh = {
      ...saleInput,
      buyer: { memberUserId: freshBuyerId },
      operationKey: randomUUID(),
    };
    const stale = { ok: false, code: 'stale_rate' };
    const checkSales = async () => {
      const [counts] = await restricted(
        f.peer,
        tenantId,
        tx => tx`
        select (select count(operation_key)::int from membership_sale_claims) as claims,
          (select count(*)::int from membership_sales) as sales,
          (select count(*)::int from membership_ledger_entries where kind = 'charge') as charges`
      );
      assert.deepEqual(counts, { claims: 1, sales: 1, charges: 1 });
    };

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
    assert.deepEqual(await old.getSaleOffer(session, { planId }, actor), stale);
    assert.deepEqual(await old.recordSale(session, fresh, actor), stale);
    assert.deepEqual(await old.recordSale(session, saleInput, actor), storedSale);
    await oldContext.withTenantAuthority(session, async tx => {
      assert.deepEqual(await oldCompose.recordSaleInTx(tx, session, fresh, actor), stale);
      assert.deepEqual(await oldCompose.recordSaleInTx(tx, session, saleInput, actor), storedSale);
    });
    await checkSales();
    assert.deepEqual(await old.recordExchangeRate(deniedSession, rateInput('2099-12-28'), actor), {
      ok: false,
      code: 'forbidden',
    });
    assert.ok((await old.recordExchangeRate(session, rateInput('2099-12-28'), actor)).ok);
    assert.deepEqual(await old.recordExchangeRate(session, rateInput('2099-12-29'), actor), {
      ok: false,
      code: 'conflict',
    });

    const { getSaleOffer, recordExchangeRate, recordSale, recordRateVerification } =
      await import('../src/payment-port');
    const { recordSaleInTx } = await import('../src/payment-port-compose');
    const { withTenantAuthority } =
      await import('@interdomestik/database/tenant-authority-context');
    const checkCompatibleSales = async () => {
      assert.deepEqual(await getSaleOffer(f.authority, { planId }, actor), stale);
      assert.deepEqual(await recordSale(f.authority, fresh, actor), stale);
      assert.deepEqual(await recordSale(f.authority, saleInput, actor), storedSale);
      await withTenantAuthority(f.authority, async tx => {
        assert.deepEqual(await recordSaleInTx(tx, f.authority, fresh, actor), stale);
        assert.deepEqual(await recordSaleInTx(tx, f.authority, saleInput, actor), storedSale);
      });
      await checkSales();
    };
    await checkCompatibleSales();
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

    const legacyOnExpand = await old.recordRateVerification(
      session,
      { ...legacyInput, operationKey: randomUUID() },
      actor
    );
    assert.ok(legacyOnExpand.ok);
    const [unlinked] = await restricted(
      f.peer,
      tenantId,
      tx => tx`
      select check_id from exchange_rate_verifications where id = ${legacyOnExpand.verification.id}`
    );
    assert.deepEqual(unlinked, { check_id: null });

    await migratePaymentPortPhase(admin, 'contract');
    await checkCompatibleSales();
    await assert.rejects(
      old.recordExchangeRate(session, rateInput('2099-12-30'), actor),
      (error: unknown) => {
        assert.ok(error instanceof Error && error.cause instanceof Error && 'code' in error.cause);
        assert.equal(error.cause.code, '42P10');
        return true;
      }
    );
    await assert.rejects(
      restricted(f.peer, tenantId, tx =>
        insertVerification(tx, {
          ...original,
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
