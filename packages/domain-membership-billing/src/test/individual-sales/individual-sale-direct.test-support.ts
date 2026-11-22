import type { PaymentPortTestTransaction } from '@interdomestik/database/testing/payment-port-rls';
import { createHash, randomUUID } from 'node:crypto';

import { skopjeDate } from '../../port/calendar';
import type { SaleInput } from '../../port/sale-input';
import type { SaleFixture } from './individual-sales.test-support';

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
