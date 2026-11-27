import { restricted } from '../../../../database/test/exchange-rates.fixture';
import { sql } from 'drizzle-orm';
import { PgDialect } from 'drizzle-orm/pg-core';
import { randomUUID } from 'node:crypto';
import { setTimeout as poll } from 'node:timers/promises';
import { expect, it, vi } from 'vitest';

import { toMkdMinor } from '../../port/money';
import type { SaleInput } from '../../port/sale-input';
import {
  directSaleRow,
  insertDirectSale,
  tryInsertDirectSale,
} from './individual-sale-direct.test-support';
import { saleScope } from './individual-sale-offer-races.test-support';
import {
  absent,
  accepted,
  completed,
  refused,
  success,
  type SaleFixture,
} from './individual-sales.test-support';

type VerificationInput = ReturnType<SaleFixture['verificationInput']>;
export type AgeFixture = (maxAgeSeconds?: number | null) => Promise<SaleFixture>;

export const ageViolation = { code: '23514', constraint_name: 'membership_sales_stale_rate' };

export async function ageCandidate(
  f: SaleFixture,
  rate?: { id: string; effective_on: string },
  observedRate = '61.50'
) {
  const { version } = success(await f.publish());
  const current = rate ?? (await f.addUnverifiedRate(observedRate))[0];
  const offer = {
    planVersionId: version.id,
    legalEntityId: version.legalEntityId,
    listPriceMinor: version.listPriceMinor,
    priceCurrency: version.priceCurrency,
    termsVersion: 'v1',
    rateId: current.id,
    rateEffectiveOn: current.effective_on,
    amountMkdMinor: toMkdMinor(version.listPriceMinor, observedRate),
  };
  return {
    input: accepted(offer, { memberUserId: f.member.id }),
    evidence: await f.newEvidence(current.id, observedRate),
  };
}

export function insertEvidence(
  f: SaleFixture,
  tx: Parameters<typeof insertDirectSale>[0],
  evidence: VerificationInput
) {
  return tx<{ verified_at: string }[]>`insert into exchange_rate_verifications
    (id, tenant_id, legal_entity_id, book_id, rate_id, base, quote, rate_effective_on,
     observed_rate, source_ref, verified_by, operation_key, check_id)
    select ${randomUUID()}, tenant_id, ${evidence.legalEntityId}, book_id, id, base, quote,
      effective_on, ${evidence.observedRate}::numeric, ${evidence.sourceRef}, ${f.owner.id}, ${evidence.operationKey},
      ${evidence.checkId ?? null}
    from exchange_rates where tenant_id = ${f.tenantId} and id = ${evidence.rateId}
    returning verified_at::text`;
}

async function databaseDeadline(f: SaleFixture, evidence: VerificationInput) {
  const [{ deadline }] = await f.peer<{ deadline: string }[]>`
    select (verified_at + make_interval(secs => max_age_seconds))::text as deadline
    from exchange_rate_verifications join exchange_rate_verification_limits using (tenant_id)
    where tenant_id = ${f.tenantId} and operation_key = ${evidence.operationKey}`;
  return deadline;
}

async function expired(f: SaleFixture, deadline: string) {
  const [{ passed }] = await f.peer<{ passed: boolean }[]>`
    select clock_timestamp() > ${deadline}::text::timestamptz as passed`;
  return passed;
}

async function waitForExpiry(f: SaleFixture, deadline: string) {
  const timeout = Date.now() + 10000;
  return check();

  async function check(): Promise<void> {
    if (await expired(f, deadline)) return;
    if (Date.now() >= timeout) throw new Error('The verification deadline did not pass');
    await poll(10);
    return check();
  }
}

export async function assertClosed(f: SaleFixture, input: SaleInput) {
  expect(await f.quote()).toEqual(refused('stale_rate'));
  expect(await f.sale(input)).toEqual(refused('stale_rate'));
  expect(await f.counts(input.operationKey)).toEqual(absent);
}

async function assertAgeInsertRefusal(f: SaleFixture, input: SaleInput) {
  const row = await directSaleRow(f, input, { deriveDueOn: true });
  await expect(
    restricted(f.admin, f.tenantId, tx => insertDirectSale(tx, row))
  ).rejects.toMatchObject(ageViolation);
  const description = 'Independent work after the insert refusal';
  await restricted(f.admin, f.tenantId, async tx => {
    await tx`savepoint age_proof`;
    expect(await tryInsertDirectSale(tx, row)).toBe('stale_rate');
    await tx`rollback to savepoint age_proof`;
    await tx`release savepoint age_proof`;
    await tx`update membership_plans set description = ${description} where id = ${f.planId}`;
  });
  const [plan] = await f.admin`select description from membership_plans where id = ${f.planId}`;
  expect(plan.description).toBe(description);
  expect(await f.counts(input.operationKey)).toEqual(absent);
}

async function directAgePositive(f: SaleFixture, input: SaleInput) {
  const row = await directSaleRow(f, input, { deriveDueOn: true });
  const [{ id }] = await restricted(f.admin, f.tenantId, tx => insertDirectSale(tx, row));
  expect(id).toBe(row.id);
  const [sale] =
    await f.admin`select due_on = sold_on as derived_due_on from membership_sales where id = ${id}`;
  expect(sale.derived_due_on).toBe(true);
  expect(await f.counts(input.operationKey)).toEqual(completed);
}

export function registerRateAgeCases(fixture: AgeFixture) {
  it('closes quotes, sales and direct inserts while the limit is absent', async () => {
    const f = await fixture(null);
    const { input, evidence } = await ageCandidate(f);
    success(await f.verify(evidence));
    await assertClosed(f, input);
    await assertAgeInsertRefusal(f, input);
    await f.setLimit(86400);
    success(await f.sale(input));
    expect(await f.counts(input.operationKey)).toEqual(completed);
  });

  it('closes sales until the exact row has a verification', async () => {
    const f = await fixture();
    const { input, evidence } = await ageCandidate(f);
    await assertClosed(f, input);
    expect(await f.sale({ ...input, amountMkdMinor: input.amountMkdMinor + 100n })).toEqual(
      refused('invalid')
    );
    expect(await f.sale({ ...input, termsVersion: 'wrong' })).toEqual(refused('stale_offer'));
    await assertAgeInsertRefusal(f, input);
    success(await f.verify(evidence));
    success(await f.quote());
    await directAgePositive(f, input);
  });

  it('refuses expired evidence on all paths and preserves an earlier committed replay', async () => {
    const f = await fixture(5);
    const { input, evidence } = await ageCandidate(f);
    success(await f.verify(evidence));
    const prior = success(await f.sale(input));
    const newSale = { ...input, operationKey: randomUUID() };
    await waitForExpiry(f, await databaseDeadline(f, evidence));
    expect(await f.sale(input)).toEqual(prior);
    await assertClosed(f, newSale);
    await assertAgeInsertRefusal(f, newSale);
    await f.setLimit(86400);
    success(await f.verify(await f.newEvidence(evidence.rateId, evidence.observedRate)));
    success(await f.sale(newSale));
    expect(await f.counts(newSale.operationKey)).toEqual(completed);
  }, 30000);

  it('aborts only the composed sale when its verification expires after preflight', async () => {
    const f = await fixture(5);
    const { input, evidence } = await ageCandidate(f);
    success(await f.verify(evidence));
    const deadline = await databaseDeadline(f, evidence);
    const { recordSaleInTx } = await import('../../payment-port-compose');
    const description = 'Composed caller commits independently';
    let checkedInsert = false;
    await saleScope(f, f.owner, async tx => {
      const original = tx.execute.bind(tx);
      const dialect = new PgDialect();
      const spy = vi.spyOn(tx, 'execute').mockImplementation(query => {
        const pending = original(query);
        const statement = dialect.sqlToQuery(pending.getSQL()).sql;
        if (!statement.includes('membership_try_insert_individual_sale')) return pending;
        const execute = pending.execute.bind(pending);
        pending.execute = async () => {
          expect(await expired(f, deadline)).toBe(false);
          await waitForExpiry(f, deadline);
          const result = await execute();
          expect(result[0]).toEqual({ code: 'stale_rate' });
          checkedInsert = true;
          return result;
        };
        return pending;
      });
      try {
        expect(await recordSaleInTx(tx, f.owner.authority, input, f.owner)).toEqual(
          refused('stale_rate')
        );
      } finally {
        spy.mockRestore();
      }
      await tx.execute(
        sql`update membership_plans set description = ${description} where id = ${f.planId}`
      );
    });
    expect(checkedInsert).toBe(true);
    const [plan] = await f.admin`select description from membership_plans where id = ${f.planId}`;
    expect(plan.description).toBe(description);
    expect(await f.counts(input.operationKey)).toEqual(absent);
  }, 30000);
}
