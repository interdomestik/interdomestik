import type { TenantTransaction } from '@interdomestik/database';
import {
  exchangeRateBooks,
  membershipPlanVersions,
  membershipSales,
} from '@interdomestik/database/schema';
import { lockSponsorPerson } from '@interdomestik/database/sponsor-locks';
import type { TenantAuthority } from '@interdomestik/database/tenant-authority';
import { withTenantAuthority } from '@interdomestik/database/tenant-authority-context';
import { withTenant } from '@interdomestik/database/tenant-security';
import { and, eq, sql } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';

import { toMkdMinor } from './money';
import { lockLegalEntity, lockPlan } from './plan-versions';
import {
  matchesSaleActor,
  saleRoles,
  sessionPrincipal,
  type SaleActor,
  type SalePrincipal,
} from './sale-authority';
import {
  buyerCoverageFailure,
  findScopedBuyer,
  lockBuyerSubscriptions,
  requestedBuyer,
  type SaleBuyer,
} from './sale-buyers';
import { claimSale, replaySale, saleHash, saleResult } from './sale-claim';
import { recordSaleInputSchema, type SaleInput } from './sale-input';
import { readSaleOffer } from './sale-offer';

const activeSaleTransactions = new WeakSet<TenantTransaction>();

function prepareSale(authority: TenantAuthority, input: unknown, actor: SaleActor) {
  const principal = sessionPrincipal(authority, saleRoles);
  if (!principal || !matchesSaleActor(principal, actor))
    return { ok: false, code: 'forbidden' } as const;
  const parsed = recordSaleInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, code: 'invalid' } as const;

  const { buyer } = parsed.data;
  let validatedBuyer: SaleInput['buyer'];
  // A second key is invalid even when its value is explicitly undefined.
  if (buyer.leadId !== undefined && !Object.hasOwn(buyer, 'memberUserId')) {
    validatedBuyer = { leadId: buyer.leadId };
  } else if (buyer.memberUserId !== undefined && !Object.hasOwn(buyer, 'leadId')) {
    validatedBuyer = { memberUserId: buyer.memberUserId };
  } else {
    return { ok: false, code: 'invalid' } as const;
  }
  return { ok: true, principal, input: { ...parsed.data, buyer: validatedBuyer } } as const;
}

export async function recordSale(authority: TenantAuthority, input: unknown, actor: SaleActor) {
  const sale = prepareSale(authority, input, actor);
  if (!sale.ok) return sale;
  return withTenantAuthority(authority, tx => saveSale(tx, sale.principal, sale.input));
}

export async function recordSaleInTx(
  tx: TenantTransaction,
  authority: TenantAuthority,
  input: unknown,
  actor: SaleActor
) {
  if (activeSaleTransactions.has(tx)) return { ok: false, code: 'invalid' } as const;
  const sale = prepareSale(authority, input, actor);
  if (!sale.ok) return sale;
  activeSaleTransactions.add(tx);
  try {
    return await saveSale(tx, sale.principal, sale.input);
  } finally {
    activeSaleTransactions.delete(tx);
  }
}

async function saveSale(tx: TenantTransaction, principal: SalePrincipal, input: SaleInput) {
  const [scope] = await tx.execute<{
    isolation: string;
    home: string | null;
    access: string | null;
    role: string | null;
  }>(sql`
    select current_setting('transaction_isolation') as isolation,
           current_setting('app.current_tenant_id', true) as home,
           current_setting('app.current_access_tenant_id', true) as access,
           current_setting('app.user_role', true) as role
  `);
  if (scope.isolation !== 'read committed') return { ok: false, code: 'invalid' } as const;
  if (
    scope.home !== principal.tenantId ||
    scope.access !== principal.tenantId ||
    scope.role !== principal.role
  ) {
    return { ok: false, code: 'forbidden' } as const;
  }

  await tx.execute(sql`savepoint wp07_sale`);
  let succeeded = false;
  try {
    const result = await claimAndRecord(tx, principal, input);
    succeeded = result.ok;
    return result;
  } finally {
    if (!succeeded) await tx.execute(sql`rollback to savepoint wp07_sale`);
    await tx.execute(sql`release savepoint wp07_sale`);
  }
}

async function claimAndRecord(tx: TenantTransaction, principal: SalePrincipal, input: SaleInput) {
  await tx.execute(sql`set constraints public.membership_claims_require_sale deferred`);
  const buyer = requestedBuyer(input.buyer);
  const preflight = await findScopedBuyer(tx, principal, buyer, false);
  if (!preflight) return { ok: false, code: 'not_found' } as const;

  const hash = saleHash(input, buyer);
  const claim = await claimSale(tx, principal.tenantId, input.operationKey, hash);
  // An identical replay returns the original sale even if the buyer is now covered.
  if (!claim) return replaySale(tx, principal, input.operationKey, hash);
  return insertSale(tx, principal, input, buyer, claim.requestHash, preflight.coverageUserId);
}

async function lockSaleRows(tx: TenantTransaction, tenantId: string, planVersionId: string) {
  const [book] = await tx
    .select({ id: exchangeRateBooks.id })
    .from(exchangeRateBooks)
    .where(
      withTenant(
        tenantId,
        exchangeRateBooks.tenantId,
        and(eq(exchangeRateBooks.base, 'EUR'), eq(exchangeRateBooks.quote, 'MKD'))
      )
    )
    .for('share');
  const [requested] = await tx
    .select({
      planId: membershipPlanVersions.planId,
      entityId: membershipPlanVersions.legalEntityId,
    })
    .from(membershipPlanVersions)
    .where(
      withTenant(
        tenantId,
        membershipPlanVersions.tenantId,
        eq(membershipPlanVersions.id, planVersionId)
      )
    );
  if (requested) {
    await lockPlan(tx, tenantId, requested.planId, 'share');
    await lockLegalEntity(tx, tenantId, requested.entityId);
  }
  return { book, requested };
}

function validateSaleOffer(
  offer: Awaited<ReturnType<typeof readSaleOffer>>,
  input: SaleInput,
  book: { id: string } | undefined
) {
  if (!offer.ok && offer.code === 'forbidden') return offer;
  if (
    !offer.ok ||
    offer.version.id !== input.planVersionId ||
    offer.termsVersion !== input.termsVersion
  ) {
    return { ok: false, code: 'stale_offer' } as const;
  }
  if (!book) throw new Error('Missing EUR/MKD exchange rate book');
  const { version, rate, termsVersion, governingLaw } = offer;
  if (!rate) return { ok: false, code: 'rate_unavailable' } as const;
  if (rate.id !== input.rateId) return { ok: false, code: 'stale_rate' } as const;
  const amountMkdMinor = toMkdMinor(version.listPriceMinor, rate.rate);
  if (amountMkdMinor <= 0n) return { ok: false, code: 'rate_unavailable' } as const;
  if (amountMkdMinor !== input.amountMkdMinor) return { ok: false, code: 'invalid' } as const;
  return { ok: true, version, rate, termsVersion, governingLaw, amountMkdMinor } as const;
}

async function insertSale(
  tx: TenantTransaction,
  principal: SalePrincipal,
  input: SaleInput,
  buyer: SaleBuyer,
  requestHash: string,
  coverageUserId: string | null
) {
  const { tenantId, userId } = principal;
  // Sale locks person, subscriptions, book, plan, entity, then buyer.
  // Admission takes person before terms and entries. Paddle updates the subscription
  // before writing its domain event and never takes the person lock in that transaction.
  if (coverageUserId !== null) {
    await lockSponsorPerson(tx, coverageUserId);
    await lockBuyerSubscriptions(tx, tenantId, coverageUserId);
  }
  const { book, requested } = await lockSaleRows(tx, tenantId, input.planVersionId);
  const attribution = await findScopedBuyer(tx, principal, buyer, true);
  if (!attribution) return { ok: false, code: 'not_found' } as const;
  if (attribution.coverageUserId !== coverageUserId)
    return { ok: false, code: 'conflict' } as const;
  if (coverageUserId !== null) {
    const failure = await buyerCoverageFailure(tx, tenantId, coverageUserId);
    if (failure) return { ok: false, code: failure } as const;
  }
  if (!requested) return { ok: false, code: 'stale_offer' } as const;

  const offer = await readSaleOffer(tx, principal, requested.planId);
  const validated = validateSaleOffer(offer, input, book);
  if (!validated.ok) return validated;
  const { version, rate, termsVersion, governingLaw, amountMkdMinor } = validated;

  const id = randomUUID();
  const candidate = JSON.stringify({
    id,
    kind: 'individual',
    plan_version_id: version.id,
    plan_id: version.planId,
    legal_entity_id: version.legalEntityId,
    price_currency: version.priceCurrency,
    price_minor: version.listPriceMinor.toString(),
    list_price_minor: version.listPriceMinor.toString(),
    plan_tier: version.tier,
    plan_members_included: version.membersIncluded,
    governing_law: governingLaw,
    terms_version: termsVersion,
    rate_id: rate.id,
    rate_book_id: rate.bookId,
    rate: rate.rate,
    rate_base: rate.base,
    rate_quote: rate.quote,
    rate_effective_on: rate.effectiveOn,
    amount_mkd_minor: amountMkdMinor.toString(),
    channel: input.channel,
    operation_key: input.operationKey,
    request_hash: requestHash,
    buyer_kind: buyer.kind,
    lead_id: buyer.kind === 'lead' ? buyer.id : null,
    member_user_id: buyer.kind === 'member' ? buyer.id : null,
    branch_id: attribution.branchId,
    agent_id: attribution.agentId,
    tenant_id: tenantId,
    sold_by: userId,
  });
  // postgres.js marks the outer transaction failed on a query error even after ROLLBACK TO.
  const [{ code }] = await tx.execute<{ code: 'conflict' | 'stale_offer' | 'stale_rate' | null }>(
    sql`select public.membership_try_insert_individual_sale(${candidate}::text::jsonb) as code`
  );
  if (code) return { ok: false, code } as const;

  const [sale] = await tx
    .select()
    .from(membershipSales)
    .where(withTenant(tenantId, membershipSales.tenantId, eq(membershipSales.id, id)));
  if (!sale) throw new Error('Recorded sale is missing');
  return saleResult(sale);
}
