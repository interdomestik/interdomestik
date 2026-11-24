import type { TenantTransaction } from '@interdomestik/database';
import {
  exchangeRateBooks,
  exchangeRates,
  legalEntities,
  membershipPlans,
  membershipPlanVersions,
  user,
} from '@interdomestik/database/schema';
import type { TenantAuthority } from '@interdomestik/database/tenant-authority';
import { withTenantAuthority } from '@interdomestik/database/tenant-authority-context';
import { withTenant } from '@interdomestik/database/tenant-security';
import { and, desc, eq, isNull, sql } from 'drizzle-orm';

import { toMkdMinor } from './money';
import { hasLegalTerms } from './plan-versions';
import {
  matchesSaleActor,
  saleRoles,
  sessionPrincipal,
  type SaleActor,
  type SalePrincipal,
} from './sale-authority';
import { getSaleOfferInputSchema } from './sale-input';

export async function readSaleOffer(
  tx: TenantTransaction,
  principal: SalePrincipal,
  planId: string
) {
  const { tenantId, userId } = principal;
  const currentVersionId = tx
    .select({ id: membershipPlanVersions.id })
    .from(membershipPlanVersions)
    .where(
      withTenant(
        tenantId,
        membershipPlanVersions.tenantId,
        and(
          eq(membershipPlanVersions.planId, membershipPlans.id),
          isNull(membershipPlanVersions.withdrawnAt)
        )
      )
    )
    .orderBy(desc(membershipPlanVersions.version))
    .limit(1);

  const [snapshot] = await tx
    .select({
      planId: membershipPlans.id,
      active: membershipPlans.isActive,
      version: {
        id: membershipPlanVersions.id,
        planId: membershipPlanVersions.planId,
        legalEntityId: membershipPlanVersions.legalEntityId,
        tier: membershipPlanVersions.tier,
        membersIncluded: membershipPlanVersions.membersIncluded,
        listPriceMinor: membershipPlanVersions.listPriceMinor,
        priceCurrency: membershipPlanVersions.priceCurrency,
      },
      entity: legalEntities,
      rate: {
        id: exchangeRates.id,
        bookId: exchangeRates.bookId,
        rate: exchangeRates.rate,
        base: exchangeRates.base,
        quote: exchangeRates.quote,
        effectiveOn: exchangeRates.effectiveOn,
      },
      rateVerified: sql<boolean>`coalesce(sale_rate.ready, false)`,
    })
    .from(user)
    .leftJoin(
      membershipPlans,
      withTenant(tenantId, membershipPlans.tenantId, eq(membershipPlans.id, planId))
    )
    .leftJoin(
      membershipPlanVersions,
      withTenant(
        tenantId,
        membershipPlanVersions.tenantId,
        eq(membershipPlanVersions.id, currentVersionId)
      )
    )
    .leftJoin(
      legalEntities,
      withTenant(
        tenantId,
        legalEntities.tenantId,
        eq(legalEntities.id, membershipPlanVersions.legalEntityId)
      )
    )
    .leftJoin(
      exchangeRateBooks,
      withTenant(
        tenantId,
        exchangeRateBooks.tenantId,
        and(eq(exchangeRateBooks.base, 'EUR'), eq(exchangeRateBooks.quote, 'MKD'))
      )
    )
    .leftJoinLateral(
      sql`public.membership_sale_rate_at(${tenantId}, ${exchangeRateBooks.id}) as sale_rate`,
      sql`true`
    )
    .leftJoin(
      exchangeRates,
      withTenant(
        tenantId,
        exchangeRates.tenantId,
        and(
          eq(exchangeRates.bookId, exchangeRateBooks.id),
          sql`${exchangeRates.id} = sale_rate.rate_id`
        )
      )
    )
    .where(withTenant(tenantId, user.tenantId, eq(user.id, userId)));

  if (!snapshot) return { ok: false, code: 'forbidden' } as const;
  if (!snapshot.planId) return { ok: false, code: 'not_found' } as const;
  const { active, version, entity, rate } = snapshot;
  if (
    !active ||
    !version ||
    !entity?.governingLaw ||
    !entity.termsVersion ||
    !hasLegalTerms(entity) ||
    (version.tier !== 'basic' && version.tier !== 'standard') ||
    version.membersIncluded !== 1
  ) {
    return { ok: false, code: 'stale_offer' } as const;
  }
  return {
    ok: true,
    version,
    rate,
    rateVerified: snapshot.rateVerified,
    governingLaw: entity.governingLaw,
    termsVersion: entity.termsVersion,
  } as const;
}

export async function getSaleOffer(authority: TenantAuthority, input: unknown, actor?: SaleActor) {
  const principal = sessionPrincipal(authority, saleRoles);
  if (!principal || (actor && !matchesSaleActor(principal, actor))) {
    return { ok: false, code: 'forbidden' } as const;
  }
  const parsed = getSaleOfferInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, code: 'invalid' } as const;
  return withTenantAuthority(authority, async tx => {
    const result = await readSaleOffer(tx, principal, parsed.data.planId);
    if (!result.ok) return result;
    const { version, rate, termsVersion } = result;
    if (!rate) return { ok: false, code: 'rate_unavailable' } as const;
    const amountMkdMinor = toMkdMinor(version.listPriceMinor, rate.rate);
    if (amountMkdMinor <= 0n) return { ok: false, code: 'rate_unavailable' } as const;
    if (!result.rateVerified) return { ok: false, code: 'stale_rate' } as const;
    return {
      ok: true,
      offer: {
        planVersionId: version.id,
        listPriceMinor: version.listPriceMinor,
        priceCurrency: version.priceCurrency,
        legalEntityId: version.legalEntityId,
        termsVersion,
        rateId: rate.id,
        rateEffectiveOn: rate.effectiveOn,
        amountMkdMinor,
      },
    } as const;
  });
}
