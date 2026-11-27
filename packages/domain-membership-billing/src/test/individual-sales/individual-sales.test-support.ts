import { randomUUID } from 'node:crypto';
import {
  firstRate,
  insertRate,
  paymentPortTestGuardRole,
  provisionRateWindow,
  restricted,
  runtimeRole,
  type PaymentPortDatabase,
} from '../../../../database/test/exchange-rates.fixture';
import {
  setRateVerificationLimit,
  withPaymentPortReleaseClient,
} from '../../../../database/test/exchange-rates-release.fixture';
import { expect } from 'vitest';

import type { SaleInput } from '../../port/sale-input';
import { seedSaleParties } from './individual-sale-parties.test-support';

export async function grantSaleFixturePrerequisites({ admin }: PaymentPortDatabase) {
  // The runtime already reads these catalogue and identity tables. A scratch journal has
  // no external runtime bootstrap, so reproduce their SELECT and row-lock privileges.
  await admin.unsafe(`grant usage on schema public to "${runtimeRole}"`);
  await admin.unsafe(`grant select, update on membership_plans, legal_entities, member_leads, "user"
    to "${runtimeRole}", "${paymentPortTestGuardRole}"`);
  await admin.unsafe(`grant select on subscriptions, sponsor_terms, sponsor_term_revisions,
    sponsor_revision_decisions, sponsor_roster_entries, sponsor_handover_intents to "${runtimeRole}"`);
  // PostgreSQL requires UPDATE on at least one column for FOR SHARE. The race also writes status.
  await admin.unsafe(`grant update (status) on subscriptions to "${runtimeRole}"`);
  await admin.unsafe(`grant update (id) on sponsor_terms to "${runtimeRole}"`);
  await admin.unsafe(`grant update (conflict_decision, conflict_decided_at) on sponsor_roster_entries
    to "${runtimeRole}"`);
  await admin.unsafe(`grant select, update, delete on membership_plan_versions, membership_sale_claims,
    membership_sales, membership_ledger_entries to "${paymentPortTestGuardRole}"`);
}

export type PaymentPort = typeof import('../../payment-port');
export type SaleOffer = Extract<
  Awaited<ReturnType<PaymentPort['getSaleOffer']>>,
  { ok: true }
>['offer'];
export type SaleFixture = Awaited<ReturnType<typeof saleFixture>>;

export function success<T extends { ok: boolean }>(result: T): Extract<T, { ok: true }> {
  expect(result).toMatchObject({ ok: true });
  if (!result.ok) throw new Error('Expected the restricted port command to succeed');
  return result as Extract<T, { ok: true }>;
}

export async function saleFixture(
  db: PaymentPortDatabase,
  maxAgeSeconds: number | null = 86400,
  defaultWindow = true
) {
  const { admin } = db;
  const port: PaymentPort = await import('../../payment-port');
  const parties = await seedSaleParties(admin);
  const { tenantId, legalEntityId, owner } = parties;
  const plan = async (
    overrides: {
      tier?: string;
      interval?: string;
      currency?: string;
      price?: string;
      active?: boolean;
    } = {}
  ) => {
    const {
      tier = 'basic',
      interval = 'year',
      currency = 'EUR',
      price = '10.00',
      active = true,
    } = overrides;
    const id = randomUUID();
    await admin`insert into membership_plans (id, tenant_id, name, tier, interval, currency, price, is_active, updated_at)
      values (${id}, ${tenantId}, 'Synthetic plan', ${tier}, ${interval}, ${currency}, ${price}, ${active}, now())`;
    return id;
  };
  const planId = await plan();
  const [book] = await restricted(
    admin,
    tenantId,
    tx => tx<{ id: string }[]>`select id from exchange_rate_books`
  );
  const [{ today }] = await admin<{ today: string }[]>`
    select (statement_timestamp() at time zone 'Europe/Skopje')::date::text as today`;
  const window = (day = today, opensAt?: string, deadlineAt?: string) =>
    provisionRateWindow(admin, tenantId, book.id, day, opensAt, deadlineAt);
  if (defaultWindow) await window();
  const addUnverifiedRate = (rate = '61.50', effectiveOn = today) =>
    restricted(db.peer, tenantId, tx =>
      insertRate(tx, { ...firstRate(tenantId, book.id, effectiveOn), rate })
    );
  const limitRequest = (seconds: number | null, tenant = tenantId) => ({
    tenantId: tenant,
    maxAgeSeconds: seconds,
    operationId: randomUUID(),
    approvalReference: 'test-approval',
    releaseIdentity: 'test-release',
  });
  const setLimit = (seconds: number | null) =>
    withPaymentPortReleaseClient(admin, client =>
      setRateVerificationLimit(client, limitRequest(seconds))
    );
  if (maxAgeSeconds !== null) await setLimit(maxAgeSeconds);
  const checkInput = (entityId = legalEntityId) => ({
    legalEntityId: entityId,
    operationKey: randomUUID(),
  });
  const begin = (input: unknown = checkInput(), who = owner) =>
    port.beginRateCheck(who.authority, input, who);
  const close = (input: unknown, who = owner) =>
    port.recordRateCheckInconclusive(who.authority, input, who);
  const verificationInput = (rateId: string, observedRate = '61.50', checkId?: string) => ({
    ...checkInput(),
    checkId,
    rateId,
    observedRate,
    sourceRef: 'NBRM/test-entry',
  });
  const verify = (input: ReturnType<typeof verificationInput>, who = owner) =>
    port.recordRateVerification(who.authority, input, who);
  const newEvidence = async (rateId: string, observedRate = '61.50', who = owner) => {
    const { check } = success(await begin(checkInput(), who));
    return verificationInput(rateId, observedRate, check.id);
  };
  const addRate = async (rate = '61.50', effectiveOn = today) => {
    const rows = await addUnverifiedRate(rate, effectiveOn);
    success(await verify(await newEvidence(rows[0].id, rate)));
    return rows;
  };
  const correctRate = async (predecessor: { id: string; effective_on: string }, rate: string) => {
    const { rate: replacement } = success(
      await port.recordExchangeRate(
        owner.authority,
        {
          base: 'EUR',
          quote: 'MKD',
          rate,
          effectiveOn: predecessor.effective_on,
          correctsRateId: predecessor.id,
          correctionReason: 'Corrected synthetic bulletin',
        },
        owner
      )
    );
    return { id: replacement.id, effective_on: replacement.effectiveOn };
  };
  const checkedCorrection = async (
    predecessor: { id: string; effective_on: string },
    rate: string
  ) => {
    const replacement = await correctRate(predecessor, rate);
    success(await verify(await newEvidence(replacement.id, rate)));
    return replacement;
  };
  const publishInput = { planId, legalEntityId };
  const publish = (input = publishInput) => port.publishPlanVersion(owner.authority, input, owner);
  const withdraw = (planVersionId: string) =>
    port.withdrawPlanVersion(owner.authority, { planVersionId }, owner);
  const quote = (id = planId) => port.getSaleOffer(owner.authority, { planId: id }, owner);
  const sale = (input: unknown, who = owner) => port.recordSale(who.authority, input, who);
  const offer = async () => success(await quote()).offer;
  const sellable = async () => {
    success(await publish());
    await addRate();
    return offer();
  };
  const counts = (key: string) =>
    restricted(admin, tenantId, async tx => {
      const [counts] = await tx`select
      (select count(*)::int from membership_sale_claims where operation_key = ${key}) as claims,
      (select count(*)::int from membership_sales where operation_key = ${key}) as sales,
      (select count(*)::int from membership_ledger_entries as e join membership_sales as s
        on (e.tenant_id, e.sale_id) = (s.tenant_id, s.id) where s.operation_key = ${key}) as charges`;
      return counts;
    });
  return {
    ...db,
    ...parties,
    plan,
    planId,
    bookId: book.id,
    today,
    window,
    checkInput,
    begin,
    close,
    newEvidence,
    correctRate,
    checkedCorrection,
    addRate,
    addUnverifiedRate,
    limitRequest,
    setLimit,
    verificationInput,
    verify,
    publish,
    withdraw,
    quote,
    offer,
    sale,
    sellable,
    counts,
    port,
  };
}

export function accepted(offer: SaleOffer, buyer: SaleInput['buyer']): SaleInput {
  return {
    buyer,
    planVersionId: offer.planVersionId,
    termsVersion: offer.termsVersion,
    rateId: offer.rateId,
    amountMkdMinor: offer.amountMkdMinor,
    channel: 'cash',
    operationKey: randomUUID(),
  };
}

export const absent = { claims: 0, sales: 0, charges: 0 };
export const completed = { claims: 1, sales: 1, charges: 1 };
export const refused = (code: string) => ({ ok: false, code });
