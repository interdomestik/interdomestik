import { createHash, randomUUID } from 'node:crypto';
import type { TenantAuthority } from '@interdomestik/database/tenant-authority';
import {
  firstRate,
  insertRate,
  paymentPortTestGuardRole,
  paymentPortTestSession,
  restricted,
  runtimeRole,
  type PaymentPortDatabase,
  type PaymentPortTestTransaction,
} from '@interdomestik/database/testing/payment-port-rls';
import { expect } from 'vitest';

import { skopjeDate } from './calendar';
import type { SaleInput } from './sale-input';

export async function grantSaleFixturePrerequisites({ admin }: PaymentPortDatabase) {
  // The runtime already reads these catalogue and identity tables. A scratch journal has
  // no external runtime bootstrap, so reproduce their SELECT and row-lock privileges.
  await admin.unsafe(`grant usage on schema public to "${runtimeRole}"`);
  await admin.unsafe(`grant select, update on membership_plans, legal_entities, member_leads, "user"
    to "${runtimeRole}", "${paymentPortTestGuardRole}"`);
  await admin.unsafe(`grant select, update, delete on membership_plan_versions, membership_sale_claims,
    membership_sales, membership_ledger_entries to "${paymentPortTestGuardRole}"`);
}

export type PaymentPort = typeof import('../payment-port');
export type SaleOffer = Extract<
  Awaited<ReturnType<PaymentPort['getSaleOffer']>>,
  { ok: true }
>['offer'];
export type SaleFixture = Awaited<ReturnType<typeof saleFixture>>;

type TestActor = {
  id: string;
  tenantId: string;
  role: string;
  branchId: string | null;
  authority: TenantAuthority;
};

export function success<T extends { ok: boolean }>(result: T): Extract<T, { ok: true }> {
  expect(result).toMatchObject({ ok: true });
  if (!result.ok) throw new Error('Expected the restricted port command to succeed');
  return result as Extract<T, { ok: true }>;
}

export async function saleFixture(db: PaymentPortDatabase) {
  const { admin } = db;
  const port: PaymentPort = await import('../payment-port');
  const tenantId = randomUUID();
  const otherTenantId = randomUUID();
  for (const id of [tenantId, otherTenantId]) {
    await admin`insert into tenants (id, name, legal_name, country_code)
      values (${id}, 'Synthetic tenant', 'Synthetic tenant', 'MK')`;
  }
  const branch = async (tenant = tenantId) => {
    const id = randomUUID();
    await admin`insert into branches (id, tenant_id, name, slug)
      values (${id}, ${tenant}, 'Synthetic branch', ${id})`;
    return id;
  };
  const homeBranch = await branch();
  const otherBranch = await branch();
  const addUser = async (
    role: string,
    branchId: string | null,
    tenant = tenantId
  ): Promise<TestActor> => {
    const id = randomUUID();
    await admin`insert into "user" (id, tenant_id, name, email, "emailVerified", role,
        branch_id, "createdAt", "updatedAt")
      values (${id}, ${tenant}, 'Synthetic user', ${id + '@example.test'}, true, ${role},
        ${branchId}, now(), now())`;
    return {
      id,
      tenantId: tenant,
      role,
      branchId,
      authority: paymentPortTestSession(tenant, id, role, branchId),
    };
  };

  const owner = await addUser('tenant_admin', null);
  const agent = await addUser('agent', homeBranch);
  const otherAgent = await addUser('agent', homeBranch);
  const staff = await addUser('staff', homeBranch);
  const member = await addUser('member', homeBranch);
  const foreignOwner = await addUser('tenant_admin', null, otherTenantId);
  const foreignMember = await addUser('member', null, otherTenantId);

  const lead = async (agentId = agent.id, branchId = homeBranch, kind = 'individual') => {
    const id = randomUUID();
    await admin`insert into member_leads (id, tenant_id, agent_id, branch_id, lead_kind,
        first_name, last_name, email, phone, updated_at, company_name, consent_notice_version,
        capture_channel, consent_captured_at, consent_captured_by)
      values (${id}, ${tenantId}, ${agentId}, ${branchId}, ${kind}, 'Synthetic', 'Lead',
        ${id + '@example.test'}, '0000000', now(), 'Synthetic Co', 'test', 'agent_assisted',
        now(), ${agentId})`;
    return id;
  };
  const entity = async (
    legal = { governingLaw: 'MK' as string | null, terms: 'v1' as string | null, active: true }
  ) => {
    const id = randomUUID();
    await admin`insert into legal_entities (id, tenant_id, legal_name, country_code, governing_law,
      terms_version, is_active) values (${id}, ${tenantId}, 'Synthetic Entity', 'MK',
        ${legal.governingLaw}, ${legal.terms}, ${legal.active})`;
    return id;
  };
  const legalEntityId = await entity();
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
  const addRate = (rate = '61.50', effectiveOn = '2000-01-03') =>
    restricted(db.peer, tenantId, tx =>
      insertRate(tx, { ...firstRate(tenantId, book.id, effectiveOn), rate })
    );
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
    tenantId,
    otherTenantId,
    homeBranch,
    otherBranch,
    owner,
    agent,
    otherAgent,
    staff,
    member,
    foreignOwner,
    foreignMember,
    lead,
    addUser,
    entity,
    legalEntityId,
    plan,
    planId,
    bookId: book.id,
    addRate,
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

export function canonicalHash(input: SaleInput, channel: string = input.channel) {
  const [kind, id] =
    'leadId' in input.buyer ? ['lead', input.buyer.leadId] : ['member', input.buyer.memberUserId];
  const fields = [
    'individual:v1',
    kind,
    id,
    input.planVersionId,
    input.termsVersion,
    input.rateId,
    input.amountMkdMinor.toString(),
    channel,
  ];
  const hash = createHash('sha256');
  for (const value of fields) {
    const bytes = Buffer.from(value, 'utf8');
    const length = Buffer.alloc(4);
    length.writeUInt32BE(bytes.length);
    hash.update(length).update(bytes);
  }
  return hash.digest();
}

export async function directSaleRow(f: SaleFixture, input: SaleInput) {
  const [version] =
    await f.admin`select * from membership_plan_versions where id = ${input.planVersionId}`;
  const [entity] =
    await f.admin`select * from legal_entities where id = ${version.legal_entity_id}`;
  const [rate] = await f.admin`select * from exchange_rates where id = ${input.rateId}`;
  const [lead] =
    'leadId' in input.buyer
      ? await f.admin`select * from member_leads where id = ${input.buyer.leadId}`
      : [];
  const [member] =
    'memberUserId' in input.buyer
      ? await f.admin`select * from "user" where id = ${input.buyer.memberUserId}`
      : [];
  const now = new Date();
  return {
    id: randomUUID(),
    kind: 'individual' as string | null,
    tenant_id: f.tenantId,
    plan_version_id: version.id,
    plan_id: version.plan_id,
    legal_entity_id: version.legal_entity_id,
    governing_law: entity.governing_law,
    terms_version: input.termsVersion,
    price_currency: version.price_currency,
    price_minor: version.list_price_minor,
    list_price_minor: version.list_price_minor,
    plan_tier: version.tier,
    plan_members_included: version.members_included,
    rate_id: rate.id,
    rate_book_id: rate.book_id,
    rate_base: rate.base,
    rate_quote: rate.quote,
    rate: rate.rate,
    rate_effective_on: rate.effective_on,
    amount_mkd_minor: input.amountMkdMinor.toString(),
    operation_key: input.operationKey,
    request_hash: canonicalHash(input),
    sold_by: f.owner.id,
    sold_at: now.toISOString(),
    sold_on: skopjeDate(now),
    due_on: skopjeDate(now),
    channel: input.channel as string,
    buyer_kind: lead ? 'lead' : 'member',
    lead_id: lead?.id ?? null,
    member_user_id: member?.id ?? null,
    agent_id: lead?.agent_id ?? null,
    branch_id: lead?.branch_id ?? member?.branch_id ?? null,
  };
}

export async function insertDirectSale(
  tx: PaymentPortTestTransaction,
  row: Awaited<ReturnType<typeof directSaleRow>>
) {
  await tx`insert into membership_sale_claims (tenant_id, operation_key, request_hash, claimed_at)
    values (${row.tenant_id}, ${row.operation_key}, ${row.request_hash}, clock_timestamp())`;
  return tx`insert into membership_sales ${tx(row)} returning id`;
}
