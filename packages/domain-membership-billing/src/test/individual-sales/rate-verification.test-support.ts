import { randomUUID } from 'node:crypto';
import {
  firstRate,
  insertRate,
  paymentPortTestScheduledAuthority,
  paymentPortTestSession,
  provisionRateWindow,
  restricted,
  runSequentially,
} from '../../../../database/test/exchange-rates.fixture';
import { expect, it } from 'vitest';

import { toMkdMinor } from '../../port/money';
import { directSaleRow, insertDirectSale } from './individual-sale-direct.test-support';
import {
  ageCandidate,
  ageViolation,
  assertClosed,
  insertEvidence,
  type AgeFixture,
} from './rate-age.test-support';
import {
  absent,
  completed,
  refused,
  success,
  type SaleFixture,
} from './individual-sales.test-support';
import { registerVerificationConcurrencyCases } from './rate-verification-concurrency.test-support';

const currentViolation = {
  code: '23514',
  constraint_name: 'exchange_rate_verifications_current_rate',
};

async function verificationCount(f: SaleFixture) {
  const [{ count }] = await restricted(
    f.admin,
    f.tenantId,
    tx => tx<{ count: number }[]>`select count(*)::int from exchange_rate_verifications`
  );
  return count;
}

export function registerVerificationCases(fixture: AgeFixture) {
  registerVerificationConcurrencyCases(fixture);

  it('admits the two tenant admin roles only and checks session binding and entity scope', async () => {
    const f = await fixture(null);
    const { evidence } = await ageCandidate(f);
    const admin = await f.addUser('admin', null);
    const inactive = await f.entity({ governingLaw: 'MK', terms: 'v1', active: false });
    const foreign = await f.entity(undefined, f.otherTenantId);
    const invoke = f.port.recordRateVerification;

    await runSequentially([f.agent, f.staff, f.member], async actor => {
      expect(await f.verify(evidence, actor)).toEqual(refused('forbidden'));
    });
    const split = paymentPortTestSession(
      f.otherTenantId,
      f.owner.id,
      'tenant_admin',
      null,
      f.tenantId
    );
    const unbound = paymentPortTestSession(f.tenantId, f.owner.id, 'tenant_admin');
    expect(await invoke(split, evidence, f.owner)).toEqual(refused('forbidden'));
    expect(await invoke(unbound, evidence, f.foreignOwner)).toEqual(refused('forbidden'));
    expect(await invoke(unbound, evidence, admin)).toEqual(refused('forbidden'));
    expect(await invoke(paymentPortTestScheduledAuthority(f.tenantId), evidence, f.owner)).toEqual(
      refused('forbidden')
    );
    await runSequentially([inactive, foreign, randomUUID()], async legalEntityId => {
      expect(await f.verify({ ...evidence, legalEntityId })).toEqual(refused('not_found'));
    });
    expect(await f.verify({ ...evidence, rateId: randomUUID() })).toEqual(refused('not_found'));
    expect(await verificationCount(f)).toBe(0);
    const { verification } = success(await f.verify(evidence));
    expect(verification).toMatchObject({
      legalEntityId: f.legalEntityId,
      verifiedBy: f.owner.id,
      tenantId: f.tenantId,
    });
    const second = success(
      await f.verify(await f.newEvidence(evidence.rateId, '61.50', admin), admin)
    );
    expect(second.verification.verifiedBy).toBe(admin.id);
    await f.admin`update legal_entities set is_active = false where id = ${f.legalEntityId}`;
    expect(await f.verify(evidence)).toEqual(refused('not_found'));
    expect(await verificationCount(f)).toBe(2);
  });

  it('refuses malformed evidence and replays canonical evidence only to its original actor', async () => {
    const f = await fixture(null);
    const { evidence } = await ageCandidate(f);
    const malformed = [
      { observedRate: '61.500000001' },
      { observedRate: '0' },
      { observedRate: '61.5\n' },
      { sourceRef: 'wrong reference' },
      { sourceRef: 'NBRM/ref\n' },
      { rateEffectiveOn: '2000-01-03' },
      { tenantId: f.tenantId },
      { verifiedBy: f.owner.id },
      { bookId: f.bookId },
      { verifiedAt: '2000-01-03T00:00:00Z' },
      { rateId: 'rate\0extra' },
    ];
    await runSequentially(malformed, async fields => {
      expect(await f.verify({ ...evidence, ...fields })).toEqual(refused('invalid'));
    });
    expect(await verificationCount(f)).toBe(0);

    const [first, second] = await Promise.all([
      f.verify(evidence),
      f.verify({ ...evidence, observedRate: '061.50000000' }),
    ]);
    expect(first).toEqual(second);
    const original = success(first);
    const otherActor = await f.addUser('tenant_admin', null);
    expect(await f.verify(evidence, otherActor)).toEqual(refused('not_found'));
    expect(await f.verify({ ...evidence, sourceRef: 'NBRM/other' })).toEqual(refused('conflict'));
    expect(await f.verify({ ...evidence, legalEntityId: await f.entity() })).toEqual(
      refused('conflict')
    );
    await f.correctRate({ id: evidence.rateId, effective_on: f.today }, '62');
    expect(await f.verify(evidence)).toEqual(original);
    expect(await verificationCount(f)).toBe(1);
  });

  it('requires evidence for a newer row and conceals other tenants’ books and rates', async () => {
    const f = await fixture();
    const { input, evidence } = await ageCandidate(f);
    success(await f.verify(evidence));
    success(await f.quote());
    const replacement = await f.correctRate(
      { id: evidence.rateId, effective_on: f.today },
      '62.10'
    );
    const sale = { ...input, rateId: replacement.id, amountMkdMinor: toMkdMinor(1000n, '62.10') };

    const foreignEntity = await f.entity(undefined, f.otherTenantId);
    const [foreignBook] = await restricted(
      f.peer,
      f.otherTenantId,
      tx => tx<{ id: string }[]>`select id from exchange_rate_books`
    );
    const [foreignRate] = await restricted(f.peer, f.otherTenantId, tx =>
      insertRate(tx, firstRate(f.otherTenantId, foreignBook.id, f.today))
    );
    await provisionRateWindow(f.admin, f.otherTenantId, foreignBook.id, f.today);
    const { check } = success(await f.begin(f.checkInput(foreignEntity), f.foreignOwner));
    success(
      await f.verify(
        { ...f.verificationInput(foreignRate.id, '61.50', check.id), legalEntityId: foreignEntity },
        f.foreignOwner
      )
    );
    expect(
      await f.verify({ ...evidence, rateId: foreignRate.id, operationKey: randomUUID() })
    ).toEqual(refused('not_found'));
    expect(await f.verify({ ...evidence, checkId: check.id, operationKey: randomUUID() })).toEqual(
      refused('not_found')
    );
    await assertClosed(f, sale);

    const superseded = { ...evidence, operationKey: randomUUID() };
    expect(await f.verify(superseded)).toEqual(refused('stale_rate'));
    await expect(
      restricted(f.peer, f.tenantId, tx => insertEvidence(f, tx, superseded))
    ).rejects.toMatchObject(currentViolation);
    await expect(
      restricted(
        f.peer,
        f.tenantId,
        tx => tx`
      insert into exchange_rate_verifications (id, tenant_id, legal_entity_id, book_id, rate_id,
        base, quote, rate_effective_on, observed_rate, source_ref, verified_by, operation_key, check_id)
      values (${randomUUID()}, ${f.tenantId}, ${f.legalEntityId}, ${foreignBook.id}, ${replacement.id},
        'EUR', 'MKD', ${f.today}::date, 62.10, 'NBRM/foreign-book', ${f.owner.id}, ${randomUUID()}, ${check.id})`
      )
    ).rejects.toMatchObject({ code: '23503' });
    success(await f.verify(await f.newEvidence(replacement.id, '62.10')));
    success(await f.sale(sale));
    expect(await f.counts(sale.operationKey)).toEqual(completed);
  });

  it('leaves a same-date correction closed until the corrected row is verified', async () => {
    const f = await fixture();
    const { input, evidence } = await ageCandidate(f);
    success(await f.verify(evidence));
    const official = '62.13';
    const revised = {
      ...(await f.newEvidence(evidence.rateId, official)),
      observedRate: official,
      sourceRef: 'NBRM/revised',
      operationKey: randomUUID(),
    };
    expect(await f.verify(revised)).toMatchObject(refused('rate_mismatch'));
    expect(await verificationCount(f)).toBe(1);
    const { rate } = success(
      await f.port.recordExchangeRate(
        f.owner.authority,
        {
          base: 'EUR',
          quote: 'MKD',
          rate: official,
          effectiveOn: f.today,
          correctsRateId: evidence.rateId,
          correctionReason: 'Revised official value',
        },
        f.owner
      )
    );
    const inForce = success(
      await f.port.getExchangeRateInForce(
        f.owner.authority,
        new Date(Date.parse(rate.storedAt) + 1)
      )
    );
    expect(inForce.rate.id).toBe(rate.id);
    const sale = { ...input, rateId: rate.id, amountMkdMinor: toMkdMinor(1000n, official) };
    await assertClosed(f, sale);
    const row = await directSaleRow(f, sale, { deriveDueOn: true });
    await expect(
      restricted(f.admin, f.tenantId, tx => insertDirectSale(tx, row))
    ).rejects.toMatchObject(ageViolation);
    expect(await f.counts(sale.operationKey)).toEqual(absent);
    const { verification } = success(await f.verify(await f.newEvidence(rate.id, official)));
    expect(verification.rateEffectiveOn).toBe(rate.effectiveOn);
    success(await f.sale(sale));
    expect(await f.counts(sale.operationKey)).toEqual(completed);
  });
}
