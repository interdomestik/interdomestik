import type { TenantTransaction } from '@interdomestik/database';
import {
  exchangeRateBooks,
  membershipPlanVersions,
  membershipSales,
} from '@interdomestik/database/schema';
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
import { findScopedBuyer, requestedBuyer, type SaleBuyer } from './sale-buyers';
import { claimSale, replaySale, saleHash, saleResult } from './sale-claim';
import { recordSaleInputSchema, type SaleInput } from './sale-input';
import { readSaleOffer } from './sale-offer';

function prepareSale(authority: TenantAuthority, input: unknown, actor: SaleActor) {
  const principal = sessionPrincipal(authority, saleRoles);
  if (!principal || !matchesSaleActor(principal, actor))
    return { ok: false, code: 'forbidden' } as const;
  const parsed = recordSaleInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, code: 'invalid' } as const;
  return { ok: true, principal, input: parsed.data } as const;
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
  const sale = prepareSale(authority, input, actor);
  if (!sale.ok) return sale;
  return saveSale(tx, sale.principal, sale.input);
}

async function saveSale(tx: TenantTransaction, principal: SalePrincipal, input: SaleInput) {
  const [isolation] = await tx.execute<{ transaction_isolation: string }>(
    sql`show transaction_isolation`
  );
  if (isolation.transaction_isolation !== 'read committed')
    return { ok: false, code: 'invalid' } as const;

  const [scope] = await tx.execute<{
    home: string | null;
    access: string | null;
    role: string | null;
  }>(sql`
    select current_setting('app.current_tenant_id', true) as home,
           current_setting('app.current_access_tenant_id', true) as access,
           current_setting('app.user_role', true) as role
  `);
  if (
    scope.home !== principal.tenantId ||
    scope.access !== principal.tenantId ||
    scope.role !== principal.role
  ) {
    return { ok: false, code: 'forbidden' } as const;
  }

  // postgres-js isolates failed queries in its child transaction scope. Releasing this outer
  // savepoint also releases the driver's nested savepoint.
  await tx.execute(sql`savepoint wp07_sale`);
  let result;
  try {
    result = await tx.transaction(child => claimAndRecord(child, principal, input));
  } catch (error) {
    await tx.execute(sql`rollback to savepoint wp07_sale`);
    await tx.execute(sql`release savepoint wp07_sale`);
    const code = saleWriteFailure(error);
    if (code) return { ok: false, code } as const;
    throw error;
  }
  if (!result.ok) await tx.execute(sql`rollback to savepoint wp07_sale`);
  await tx.execute(sql`release savepoint wp07_sale`);
  return result;
}

function saleWriteFailure(error: unknown) {
  const { cause } = (error ?? {}) as { cause?: unknown };
  const failure = (cause ?? error ?? {}) as { code?: string; constraint_name?: string };
  if (failure.code === '23505' && failure.constraint_name === 'membership_sales_live_lead_uq') {
    return 'conflict';
  }
  if (failure.code !== '23514') return null;
  switch (failure.constraint_name) {
    case 'membership_sales_stale_offer':
      return 'stale_offer';
    case 'membership_sales_stale_rate':
      return 'stale_rate';
    default:
      return null;
  }
}

async function claimAndRecord(tx: TenantTransaction, principal: SalePrincipal, input: SaleInput) {
  await tx.execute(sql`set constraints public.membership_claims_require_sale deferred`);
  const buyer = requestedBuyer(input.buyer);
  if (!(await findScopedBuyer(tx, principal, buyer, false)))
    return { ok: false, code: 'not_found' } as const;

  const hash = saleHash(input, buyer);
  const claim = await claimSale(tx, principal.tenantId, input.operationKey, hash);
  if (!claim) return replaySale(tx, principal, input.operationKey, hash);
  return insertSale(tx, principal, input, buyer, claim.requestHash);
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

async function insertSale(
  tx: TenantTransaction,
  principal: SalePrincipal,
  input: SaleInput,
  buyer: SaleBuyer,
  requestHash: Buffer
) {
  const { tenantId, userId } = principal;
  const { book, requested } = await lockSaleRows(tx, tenantId, input.planVersionId);
  const attribution = await findScopedBuyer(tx, principal, buyer, true);
  if (!attribution) return { ok: false, code: 'not_found' } as const;
  if (!requested) return { ok: false, code: 'stale_offer' } as const;

  const offer = await readSaleOffer(tx, principal, requested.planId);
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

  const [sale] = await tx
    .insert(membershipSales)
    .values({
      id: randomUUID(),
      kind: 'individual',
      planVersionId: version.id,
      planId: version.planId,
      legalEntityId: version.legalEntityId,
      priceCurrency: version.priceCurrency,
      priceMinor: version.listPriceMinor,
      listPriceMinor: version.listPriceMinor,
      planTier: version.tier,
      planMembersIncluded: version.membersIncluded,
      governingLaw,
      termsVersion,
      rateId: rate.id,
      rateBookId: rate.bookId,
      rate: rate.rate,
      rateBase: rate.base,
      rateQuote: rate.quote,
      rateEffectiveOn: rate.effectiveOn,
      amountMkdMinor,
      channel: input.channel,
      soldAt: sql`null`,
      soldOn: sql`null`,
      dueOn: sql`null`,
      operationKey: input.operationKey,
      requestHash,
      buyerKind: buyer.kind,
      leadId: buyer.kind === 'lead' ? buyer.id : null,
      memberUserId: buyer.kind === 'member' ? buyer.id : null,
      branchId: attribution.branchId,
      agentId: attribution.agentId,
      tenantId,
      soldBy: userId,
    })
    .returning();
  return saleResult(sale);
}
