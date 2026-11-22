import { randomUUID } from 'node:crypto';
import type { TenantAuthority } from '@interdomestik/database/tenant-authority';
import {
  firstRate,
  insertRate,
  paymentPortTestGuardRole,
  paymentPortTestSession,
  restricted,
  runSequentially,
  runtimeRole,
  type PaymentPortDatabase,
} from '@interdomestik/database/testing/payment-port-rls';
import { expect } from 'vitest';

import type { SaleInput } from '../../port/sale-input';

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
  const port: PaymentPort = await import('../../payment-port');
  const tenantId = randomUUID();
  const otherTenantId = randomUUID();
  await runSequentially([tenantId, otherTenantId], async id => {
    await admin`insert into tenants (id, name, legal_name, country_code)
      values (${id}, 'Synthetic tenant', 'Synthetic tenant', 'MK')`;
  });
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
