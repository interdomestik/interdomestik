import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

import type { ExchangeRateFixture } from './exchange-rates.fixture';

// Seed a valid individual sale in the journal-built scratch database with its triggers active.
export function seedRateLinkedSale(
  { admin, tenantId, actor }: ExchangeRateFixture,
  bookId: string
) {
  const entityId = randomUUID();
  const buyerId = randomUUID();
  const email = `${buyerId}@example.test`;
  const planId = randomUUID();
  const planVersionId = randomUUID();
  const operationKey = randomUUID();
  const saleId = randomUUID();
  const termsVersion = 'test-v1';
  const priceMinor = 1000;

  return admin.begin('isolation level read committed', async tx => {
    await tx`insert into public.legal_entities
      (id, tenant_id, legal_name, country_code, governing_law, terms_version)
      values (${entityId}, ${tenantId}, 'Test sale entity', 'MK', 'MK', ${termsVersion})`;
    await tx`insert into public."user"
      (id, tenant_id, name, email, "emailVerified", role, "createdAt", "updatedAt")
      values (${buyerId}, ${tenantId}, 'Test buyer', ${email}, true, 'member', now(), now())`;
    await tx`insert into public.membership_plans
      (id, tenant_id, name, tier, interval, currency, price, members_included, is_active, updated_at)
      values (${planId}, ${tenantId}, 'Test sale plan', 'basic', 'year', 'EUR',
        ${priceMinor}::numeric / 100, 1, true, now())`;
    await tx`insert into public.membership_plan_versions
      (id, tenant_id, plan_id, version, legal_entity_id, tier, interval, members_included,
        list_price_minor, price_currency, published_by)
      values (${planVersionId}, ${tenantId}, ${planId}, 1, ${entityId}, 'basic', 'year', 1,
        ${priceMinor}, 'EUR', ${actor.id})`;

    const [rate] = await tx<{ id: string; amount_mkd_minor: string }[]>`
      select id, (round(${priceMinor}::numeric * rate * 0.01) * 100)::bigint::text as amount_mkd_minor
      from public.exchange_rates
      where tenant_id = ${tenantId} and book_id = ${bookId}
        and effective_on <= (clock_timestamp() at time zone 'Europe/Skopje')::date
      order by effective_on desc, revision desc limit 1`;
    assert.ok(rate, 'the book must have an effective rate before recording a sale');

    const [{ request_hash }] = await tx<{ request_hash: string }[]>`
      insert into public.membership_sale_claims (tenant_id, operation_key, request_hash, claimed_at)
      values (${tenantId}, ${operationKey}, public.membership_individual_sale_hash(
        'member', ${buyerId}, ${planVersionId}, ${termsVersion}, ${rate.id},
        ${rate.amount_mkd_minor}::bigint, 'cash'), clock_timestamp())
      returning request_hash`;
    const [sale] = await tx<{ id: string; rate_id: string }[]>`
      insert into public.membership_sales
        (id, tenant_id, kind, plan_version_id, plan_id, legal_entity_id, governing_law, terms_version,
          price_currency, price_minor, list_price_minor, plan_tier, plan_members_included,
          rate_id, rate_book_id, rate, rate_base, rate_quote, rate_effective_on, amount_mkd_minor,
          channel, sold_by, operation_key, request_hash, buyer_kind, member_user_id)
      select ${saleId}, r.tenant_id, 'individual', ${planVersionId}, ${planId}, ${entityId}, 'MK',
        ${termsVersion}, 'EUR', ${priceMinor}::bigint, ${priceMinor}::bigint, 'basic', 1,
        r.id, r.book_id, r.rate, r.base, r.quote, r.effective_on, ${rate.amount_mkd_minor}::bigint,
        'cash', ${actor.id}, ${operationKey}, ${request_hash}, 'member', ${buyerId}
      from public.exchange_rates r where r.tenant_id = ${tenantId} and r.id = ${rate.id}
      returning id, rate_id`;
    assert.ok(sale, 'the fixture must insert a rate-linked sale');
    return sale;
  });
}
